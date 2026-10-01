"use server";

// Session type CRUD. Runs behind the /admin/:path* middleware auth gate, so
// these actions trust the caller and use the service-role client directly.
// Validation here mirrors the DB check constraints in 0009_session_types.sql
// so David gets a readable error instead of a raw Postgres one.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { dollarsToCents } from "../invoices/money";

function str(raw: FormDataEntryValue | null): string | null {
  const v = raw ? String(raw).trim() : "";
  return v.length > 0 ? v : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDollars(raw: FormDataEntryValue | null, label: string): number | null {
  const v = str(raw);
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a non-negative amount`);
  return dollarsToCents(n);
}

function sessionTypeFields(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) throw new Error("Name is required");

  const slug = slugify(str(formData.get("slug")) ?? name);
  if (!slug) throw new Error("Slug must contain at least one letter or number");

  const duration = Number(str(formData.get("duration_minutes")));
  if (!Number.isInteger(duration) || duration <= 0) {
    throw new Error("Duration must be a whole number of minutes greater than 0");
  }

  const priceCents = parseDollars(formData.get("price"), "Price") ?? 0;
  const depositCents = parseDollars(formData.get("deposit"), "Deposit");
  if (depositCents !== null && (depositCents === 0 || depositCents > priceCents)) {
    throw new Error("Deposit must be greater than 0 and no more than the price (leave blank to require full payment)");
  }

  return {
    name,
    slug,
    description: str(formData.get("description")),
    image_url: str(formData.get("image_url")),
    duration_minutes: duration,
    price_cents: priceCents,
    deposit_cents: depositCents,
    is_public: formData.get("is_public") === "on",
    active: formData.get("active") === "on",
    contract_template_id: str(formData.get("contract_template_id")),
    questionnaire_template_id: str(formData.get("questionnaire_template_id")),
  };
}

// Postgres unique_violation — the only constraint on this table that can
// collide is the slug.
function rethrow(error: { code?: string }, slug: string): never {
  if (error.code === "23505") throw new Error(`Slug "${slug}" is already used by another session type`);
  throw error;
}

export async function createSessionType(formData: FormData) {
  const fields = sessionTypeFields(formData);

  const db = supabaseAdmin();
  const { data, error } = await db.from("session_types").insert(fields).select("id").single();
  if (error) rethrow(error, fields.slug);

  revalidatePath("/admin/session-types");
  redirect(`/admin/session-types/${data.id}`);
}

export async function updateSessionType(id: string, formData: FormData) {
  const fields = sessionTypeFields(formData);

  const db = supabaseAdmin();
  const { error } = await db
    .from("session_types")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) rethrow(error, fields.slug);

  revalidatePath("/admin/session-types");
  revalidatePath(`/admin/session-types/${id}`);
  redirect(`/admin/session-types/${id}`);
}

export async function deleteSessionType(id: string) {
  const db = supabaseAdmin();
  const { error } = await db.from("session_types").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/session-types");
  redirect("/admin/session-types");
}
