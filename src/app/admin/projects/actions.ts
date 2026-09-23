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

  // New cards land at the end of their stage's order, not tied at the default 0.
  const { count } = await db
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", fields.stage_id);

  const { data, error } = await db
    .from("projects")
    .insert({ ...fields, position: count ?? 0 })
    .select("id")
    .single();
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

// Moves a card to `newStageId` at `newIndex` (0-based, among that stage's other
// cards), then resequences positions in the destination stage (and the source
// stage, if different) so drag order persists cleanly with no gaps.
export async function moveProject(projectId: string, newStageId: string, newIndex: number) {
  const db = supabaseAdmin();

  const { data: moving, error: movingErr } = await db
    .from("projects")
    .select("id, stage_id")
    .eq("id", projectId)
    .single();
  if (movingErr || !moving) throw movingErr ?? new Error("Project not found");
  const oldStageId = moving.stage_id as string | null;

  const { data: destCards, error: destErr } = await db
    .from("projects")
    .select("id")
    .eq("stage_id", newStageId)
    .neq("id", projectId)
    .order("position", { ascending: true });
  if (destErr) throw destErr;

  const ids = (destCards ?? []).map((p) => p.id as string);
  const clampedIndex = Math.max(0, Math.min(newIndex, ids.length));
  ids.splice(clampedIndex, 0, projectId);

  await Promise.all(
    ids.map((id, i) => db.from("projects").update({ stage_id: newStageId, position: i }).eq("id", id))
  );

  if (oldStageId && oldStageId !== newStageId) {
    const { data: sourceCards, error: sourceErr } = await db
      .from("projects")
      .select("id")
      .eq("stage_id", oldStageId)
      .order("position", { ascending: true });
    if (sourceErr) throw sourceErr;
    await Promise.all(
      (sourceCards ?? []).map((p, i) => db.from("projects").update({ position: i }).eq("id", p.id))
    );
  }

  revalidatePath("/admin/projects");
}
