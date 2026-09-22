"use server";

// Contact CRUD. Runs behind the /admin/:path* middleware auth gate, so these
// actions trust the caller and use the service-role client directly.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import type { ContactKind } from "./types";

function str(raw: FormDataEntryValue | null): string | null {
  const v = raw ? String(raw).trim() : "";
  return v.length > 0 ? v : null;
}

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseKind(raw: FormDataEntryValue | null): ContactKind {
  return raw === "client" ? "client" : "lead";
}

function contactFields(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) throw new Error("Name is required");

  return {
    name,
    email: str(formData.get("email")),
    phone: str(formData.get("phone")),
    kind: parseKind(formData.get("kind")),
    tags: parseTags(formData.get("tags")),
    source: str(formData.get("source")),
    notes: str(formData.get("notes")),
  };
}

export async function createContact(formData: FormData) {
  const fields = contactFields(formData);

  const db = supabaseAdmin();
  const { data, error } = await db.from("contacts").insert(fields).select("id").single();
  if (error) throw error;

  revalidatePath("/admin/contacts");
  redirect(`/admin/contacts/${data.id}`);
}

export async function updateContact(id: string, formData: FormData) {
  const fields = contactFields(formData);

  const db = supabaseAdmin();
  const { error } = await db.from("contacts").update(fields).eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/contacts");
  revalidatePath(`/admin/contacts/${id}`);
  redirect(`/admin/contacts/${id}`);
}

export async function deleteContact(id: string) {
  const db = supabaseAdmin();
  const { error } = await db.from("contacts").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/contacts");
  redirect("/admin/contacts");
}
