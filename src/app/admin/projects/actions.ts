"use server";

// Project CRUD. Runs behind the /admin/:path* middleware auth gate, so these
// actions trust the caller and use the service-role client directly.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";

function str(raw: FormDataEntryValue | null): string | null {
  const v = raw ? String(raw).trim() : "";
  return v.length > 0 ? v : null;
}

function projectFields(formData: FormData) {
  const title = str(formData.get("title"));
  if (!title) throw new Error("Title is required");

  const contactId = str(formData.get("contact_id"));
  if (!contactId) throw new Error("Contact is required");

  return {
    title,
    contact_id: contactId,
    stage_id: str(formData.get("stage_id")),
    type: str(formData.get("type")),
    event_date: str(formData.get("event_date")),
    location: str(formData.get("location")),
    description: str(formData.get("description")),
    private_notes: str(formData.get("private_notes")),
    archived: formData.get("archived") === "on",
  };
}

export async function createProject(formData: FormData) {
  const fields = projectFields(formData);

  const db = supabaseAdmin();
  const { data, error } = await db.from("projects").insert(fields).select("id").single();
  if (error) throw error;

  revalidatePath("/admin/projects");
  revalidatePath(`/admin/contacts/${fields.contact_id}`);
  redirect(`/admin/projects/${data.id}`);
}

export async function updateProject(id: string, formData: FormData) {
  const fields = projectFields(formData);

  const db = supabaseAdmin();
  const { error } = await db.from("projects").update(fields).eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/projects");
  revalidatePath(`/admin/projects/${id}`);
  revalidatePath(`/admin/contacts/${fields.contact_id}`);
  redirect(`/admin/projects/${id}`);
}

export async function deleteProject(id: string, contactId: string | null) {
  const db = supabaseAdmin();
  const { error } = await db.from("projects").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/projects");
  if (contactId) revalidatePath(`/admin/contacts/${contactId}`);
  redirect(contactId ? `/admin/contacts/${contactId}` : "/admin/contacts");
}
