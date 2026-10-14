"use server";

// Invoice CRUD. Every action checks requireAdmin() first, then uses the
// service-role client directly.
//
// Money-code care: totals are always recomputed here from the submitted line
// items and rates, never trusted as posted values. Status can only move
// between draft/sent/void from this file — "paid" is reserved for the
// Stripe webhook built in task 2.3, nothing here can set it.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth/require-admin";
import { onInvoiceSent } from "@/lib/email/triggers";
import {
  computeInvoiceTotals,
  computeSchedule,
  dollarsToCents,
  type InstallmentPlan,
  type LineItemInput,
  type ScheduleRowInput,
} from "./money";
import type { DiscountType, InvoiceStatus } from "./types";
import { isMissingTable } from "@/lib/db-errors";

function str(raw: FormDataEntryValue | null): string | null {
  const v = raw ? String(raw).trim() : "";
  return v.length > 0 ? v : null;
}

function num(raw: FormDataEntryValue | null): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function parseDiscountType(raw: FormDataEntryValue | null): DiscountType {
  return raw === "percent" || raw === "flat" ? raw : "none";
}

function parseLineItems(raw: FormDataEntryValue | null): LineItemInput[] {
  if (!raw) throw new Error("At least one line item is required");

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    throw new Error("Invalid line items");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("At least one line item is required");
  }

  return parsed.map((raw) => {
    const item = raw as Record<string, unknown>;
    const description = typeof item.description === "string" ? item.description.trim() : "";
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price);

    if (!description) throw new Error("Every line item needs a description");
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Every line item needs a positive quantity");
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error("Every line item needs a non-negative unit price");
    }

    return { description, quantity, unit_price_cents: dollarsToCents(unitPrice) };
  });
}

// Empty / missing = pay in full. Otherwise rows for computeSchedule (2.4).
function parseSchedule(raw: FormDataEntryValue | null): ScheduleRowInput[] | null {
  if (!raw || String(raw).trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    throw new Error("Invalid payment schedule");
  }
  if (!Array.isArray(parsed)) throw new Error("Invalid payment schedule");
  if (parsed.length === 0) return null;
  if (parsed.length > 12) throw new Error("A payment schedule can have at most 12 payments");
  return parsed.map((raw) => {
    const r = raw as Record<string, unknown>;
    const due = typeof r.due_date === "string" ? r.due_date.trim() : "";
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("Invalid due date in the payment schedule");
    return {
      label: typeof r.label === "string" ? r.label : "",
      amount: typeof r.amount === "string" ? r.amount : "",
      due_date: due || null,
    };
  });
}

function invoiceFields(formData: FormData) {
  const projectId = str(formData.get("project_id"));
  if (!projectId) throw new Error("Project is required");
  const contactId = str(formData.get("contact_id"));
  if (!contactId) throw new Error("Contact is required");

  const discountType = parseDiscountType(formData.get("discount_type"));
  const discountValue = Math.max(0, num(formData.get("discount_value")));
  const taxRate = Math.max(0, num(formData.get("tax_rate")));
  const lineItems = parseLineItems(formData.get("line_items_json"));
  const schedule = parseSchedule(formData.get("schedule_json"));

  return {
    project_id: projectId,
    contact_id: contactId,
    due_date: str(formData.get("due_date")),
    discount_type: discountType,
    discount_value: discountValue,
    tax_rate: taxRate,
    notes: str(formData.get("notes")),
    lineItems,
    schedule,
  };
}

async function replaceLineItems(
  db: ReturnType<typeof supabaseAdmin>,
  invoiceId: string,
  lineItems: LineItemInput[]
) {
  const { error: deleteError } = await db
    .from("invoice_line_items")
    .delete()
    .eq("invoice_id", invoiceId);
  if (deleteError) throw deleteError;

  const { error: insertError } = await db.from("invoice_line_items").insert(
    lineItems.map((item, i) => ({
      invoice_id: invoiceId,
      description: item.description,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      position: i,
    }))
  );
  if (insertError) throw insertError;
}

// Rewrites the schedule only when it actually changed, so the installment ids
// behind a client's open Checkout page stay valid across unrelated edits.
// The database refuses this once any installment is paid (0023).
async function replaceInstallments(
  db: ReturnType<typeof supabaseAdmin>,
  invoiceId: string,
  plan: InstallmentPlan[]
) {
  const { data: current, error: readError } = await db
    .from("invoice_installments")
    .select("label, amount_cents, due_date, position")
    .eq("invoice_id", invoiceId)
    .order("position", { ascending: true });
  // Missing table = migration 0023 not run here yet: fine as long as no schedule is asked for.
  if (isMissingTable(readError) && plan.length === 0) return;
  if (readError) throw readError;
  const same =
    (current ?? []).length === plan.length &&
    (current ?? []).every(
      (c, i) => c.label === plan[i].label && c.amount_cents === plan[i].amount_cents && c.due_date === plan[i].due_date
    );
  if (same) return;

  const { error: deleteError } = await db.from("invoice_installments").delete().eq("invoice_id", invoiceId);
  if (deleteError) throw deleteError;
  if (plan.length === 0) return;
  const { error: insertError } = await db
    .from("invoice_installments")
    .insert(plan.map((p, i) => ({ invoice_id: invoiceId, position: i, ...p })));
  if (insertError) throw insertError;
}

async function hasPayments(db: ReturnType<typeof supabaseAdmin>, invoiceId: string): Promise<boolean> {
  const { count, error } = await db
    .from("invoice_installments")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId)
    .eq("status", "paid");
  if (isMissingTable(error)) return false;
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function createInvoice(formData: FormData) {
  await requireAdmin();
  const { lineItems, schedule, ...fields } = invoiceFields(formData);
  const totals = computeInvoiceTotals(lineItems, {
    discountType: fields.discount_type,
    discountValue: fields.discount_value,
    taxRate: fields.tax_rate,
  });
  const plan = schedule ? computeSchedule(totals.totalCents, schedule) : [];

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("invoices")
    .insert({
      ...fields,
      subtotal_cents: totals.subtotalCents,
      discount_cents: totals.discountCents,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
    })
    .select("id")
    .single();
  if (error) throw error;

  await replaceLineItems(db, data.id, lineItems);
  await replaceInstallments(db, data.id, plan);

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/projects/${fields.project_id}`);
  redirect(`/admin/invoices/${data.id}`);
}

export async function updateInvoice(id: string, formData: FormData) {
  await requireAdmin();
  const { lineItems, schedule, ...fields } = invoiceFields(formData);
  const totals = computeInvoiceTotals(lineItems, {
    discountType: fields.discount_type,
    discountValue: fields.discount_value,
    taxRate: fields.tax_rate,
  });
  const plan = schedule ? computeSchedule(totals.totalCents, schedule) : [];

  const db = supabaseAdmin();
  const { data: existing, error: existingError } = await db
    .from("invoices")
    .select("status")
    .eq("id", id)
    .single();
  if (existingError || !existing) throw existingError ?? new Error("Invoice not found");
  if (existing.status === "paid") throw new Error("A paid invoice cannot be edited");
  if (await hasPayments(db, id)) throw new Error("A payment has been made on this invoice, so it can't be edited");

  const { error } = await db
    .from("invoices")
    .update({
      ...fields,
      subtotal_cents: totals.subtotalCents,
      discount_cents: totals.discountCents,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;

  await replaceLineItems(db, id, lineItems);
  await replaceInstallments(db, id, plan);

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath(`/admin/projects/${fields.project_id}`);
  redirect(`/admin/invoices/${id}`);
}

export async function deleteInvoice(id: string, projectId: string) {
  await requireAdmin();
  const db = supabaseAdmin();
  const { error } = await db.from("invoices").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/admin/projects/${projectId}`);
}

// "paid" is intentionally excluded from this type — only the Stripe webhook
// (task 2.3) is allowed to set it.
export async function updateInvoiceStatus(
  id: string,
  status: Extract<InvoiceStatus, "draft" | "sent" | "void">
) {
  await requireAdmin();
  const db = supabaseAdmin();
  const { data: existing, error: existingError } = await db
    .from("invoices")
    .select("status")
    .eq("id", id)
    .single();
  if (existingError || !existing) throw existingError ?? new Error("Invoice not found");
  if (existing.status === "paid") throw new Error("A paid invoice's status cannot be changed here");
  if (await hasPayments(db, id)) throw new Error("A payment has been made on this invoice, so its status can't be changed");

  const { error } = await db
    .from("invoices")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  if (status === "sent" && existing.status !== "sent") await onInvoiceSent(id);

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${id}`);
}
