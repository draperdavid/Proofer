"use server";

// Quote CRUD. Runs behind the /admin/:path* middleware auth gate, so these
// actions trust the caller and use the service-role client directly.
//
// Status can only move between draft/sent from this file — "accepted" is
// reserved for the client's accept action on the public /quote/[id] route,
// which is also the only thing that drafts an invoice from a quote. An
// accepted quote is frozen: no edits, no status changes, no delete.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { onQuoteSent } from "@/lib/email/triggers";
import { dollarsToCents } from "../invoices/money";
import type { QuotePackageLineItem, QuoteStatus } from "./types";

type PackageInput = { name: string; description: string | null; line_items: QuotePackageLineItem[] };

function str(raw: FormDataEntryValue | null): string | null {
  const v = raw ? String(raw).trim() : "";
  return v.length > 0 ? v : null;
}

function num(raw: FormDataEntryValue | null): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function parsePackages(raw: FormDataEntryValue | null): PackageInput[] {
  if (!raw) throw new Error("At least one package is required");

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    throw new Error("Invalid packages");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("At least one package is required");
  }

  return parsed.map((raw) => {
    const p = raw as Record<string, unknown>;
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (!name) throw new Error("Every package needs a name");
    const description = typeof p.description === "string" && p.description.trim() ? p.description.trim() : null;

    if (!Array.isArray(p.line_items) || p.line_items.length === 0) {
      throw new Error(`Package "${name}" needs at least one line item`);
    }
    const lineItems = p.line_items.map((rawItem) => {
      const item = rawItem as Record<string, unknown>;
      const itemDescription = typeof item.description === "string" ? item.description.trim() : "";
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unit_price);

      if (!itemDescription) throw new Error("Every line item needs a description");
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Every line item needs a positive quantity");
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error("Every line item needs a non-negative unit price");
      }
      return { description: itemDescription, quantity, unit_price_cents: dollarsToCents(unitPrice) };
    });

    return { name, description, line_items: lineItems };
  });
}

function quoteFields(formData: FormData) {
  const projectId = str(formData.get("project_id"));
  if (!projectId) throw new Error("Project is required");
  const contactId = str(formData.get("contact_id"));
  if (!contactId) throw new Error("Contact is required");
  const title = str(formData.get("title"));
  if (!title) throw new Error("Title is required");

  return {
    project_id: projectId,
    contact_id: contactId,
    title,
    tax_rate: Math.max(0, num(formData.get("tax_rate"))),
    notes: str(formData.get("notes")),
    packages: parsePackages(formData.get("packages_json")),
  };
}

async function replacePackages(db: ReturnType<typeof supabaseAdmin>, quoteId: string, packages: PackageInput[]) {
  const { error: deleteError } = await db.from("quote_packages").delete().eq("quote_id", quoteId);
  if (deleteError) throw deleteError;

  const { error: insertError } = await db.from("quote_packages").insert(
    packages.map((p, i) => ({
      quote_id: quoteId,
      name: p.name,
      description: p.description,
      line_items: p.line_items,
      position: i,
    }))
  );
  if (insertError) throw insertError;
}

async function assertNotAccepted(db: ReturnType<typeof supabaseAdmin>, id: string) {
  const { data: existing, error } = await db.from("quotes").select("status").eq("id", id).single();
  if (error || !existing) throw error ?? new Error("Quote not found");
  if (existing.status === "accepted") throw new Error("An accepted quote cannot be changed");
}

export async function createQuote(formData: FormData) {
  const { packages, ...fields } = quoteFields(formData);

  const db = supabaseAdmin();
  const { data, error } = await db.from("quotes").insert(fields).select("id").single();
  if (error) throw error;

  await replacePackages(db, data.id, packages);

  revalidatePath(`/admin/projects/${fields.project_id}`);
  redirect(`/admin/quotes/${data.id}`);
}

export async function updateQuote(id: string, formData: FormData) {
  const { packages, ...fields } = quoteFields(formData);

  const db = supabaseAdmin();
  await assertNotAccepted(db, id);

  const { error } = await db
    .from("quotes")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "accepted");
  if (error) throw error;

  await replacePackages(db, id, packages);

  revalidatePath(`/admin/quotes/${id}`);
  revalidatePath(`/admin/projects/${fields.project_id}`);
  redirect(`/admin/quotes/${id}`);
}

export async function deleteQuote(id: string, projectId: string) {
  const db = supabaseAdmin();
  await assertNotAccepted(db, id);

  const { error } = await db.from("quotes").delete().eq("id", id).neq("status", "accepted");
  if (error) throw error;

  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/admin/projects/${projectId}`);
}

// "accepted" is intentionally excluded from this type — only the client's
// accept action on /quote/[id] is allowed to set it.
export async function updateQuoteStatus(id: string, status: Extract<QuoteStatus, "draft" | "sent">) {
  const db = supabaseAdmin();
  await assertNotAccepted(db, id);
  const { data: before } = await db.from("quotes").select("status").eq("id", id).single();

  const { error } = await db
    .from("quotes")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "accepted");
  if (error) throw error;

  if (status === "sent" && before?.status !== "sent") await onQuoteSent(id);

  revalidatePath(`/admin/quotes/${id}`);
}
