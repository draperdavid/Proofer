"use server";

// Stage CRUD. Runs behind the /admin/:path* middleware auth gate, so these
// actions trust the caller and use the service-role client directly.
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { isStageTemplate, isTemplateKey } from "@/lib/email/templates";

function str(raw: FormDataEntryValue | null): string | null {
  const v = raw ? String(raw).trim() : "";
  return v.length > 0 ? v : null;
}

function revalidateStagesAndBoard() {
  revalidatePath("/admin/projects/stages");
  revalidatePath("/admin/projects");
}

export async function createStage(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) throw new Error("Name is required");
  const color = str(formData.get("color"));

  const db = supabaseAdmin();

  // New stages land at the end of the column order, not tied at position 0.
  const { count } = await db.from("project_stages").select("id", { count: "exact", head: true });

  const { error } = await db.from("project_stages").insert({ name, color, position: count ?? 0 });
  if (error) throw error;

  revalidateStagesAndBoard();
}

export async function renameStage(id: string, formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) throw new Error("Name is required");
  const color = str(formData.get("color"));

  const db = supabaseAdmin();
  const { error } = await db.from("project_stages").update({ name, color }).eq("id", id);
  if (error) throw error;

  revalidateStagesAndBoard();
}

export async function moveStage(id: string, direction: "up" | "down") {
  const db = supabaseAdmin();

  const { data: stages, error } = await db
    .from("project_stages")
    .select("id, position")
    .order("position", { ascending: true });
  if (error) throw error;

  const list = stages ?? [];
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return;

  const a = list[idx];
  const b = list[swapIdx];
  await Promise.all([
    db.from("project_stages").update({ position: b.position }).eq("id", a.id),
    db.from("project_stages").update({ position: a.position }).eq("id", b.id),
  ]);

  revalidateStagesAndBoard();
}

// Deletes a stage, reassigning any of its projects to the remaining stage with
// the lowest position first (reassign-to-default, per spec: simpler and
// non-destructive than blocking the delete outright).
export async function deleteStage(id: string) {
  const db = supabaseAdmin();

  const { data: stages, error: stagesErr } = await db
    .from("project_stages")
    .select("id, position")
    .order("position", { ascending: true });
  if (stagesErr) throw stagesErr;

  const list = stages ?? [];
  if (list.length <= 1) throw new Error("Can't delete the last remaining stage");

  const fallback = list.find((s) => s.id !== id);
  if (!fallback) throw new Error("No fallback stage available");

  const { count: destCount, error: destErr } = await db
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", fallback.id);
  if (destErr) throw destErr;

  const { data: orphaned, error: orphanedErr } = await db
    .from("projects")
    .select("id")
    .eq("stage_id", id)
    .order("position", { ascending: true });
  if (orphanedErr) throw orphanedErr;

  let nextPosition = destCount ?? 0;
  for (const p of orphaned ?? []) {
    const { error } = await db
      .from("projects")
      .update({ stage_id: fallback.id, position: nextPosition })
      .eq("id", p.id);
    if (error) throw error;
    nextPosition += 1;
  }

  const { error: deleteErr } = await db.from("project_stages").delete().eq("id", id);
  if (deleteErr) throw deleteErr;

  revalidateStagesAndBoard();
}

// Stage email rules (Phase 8.2): entering a stage emails the project's
// contact. Only templates a project can fill are accepted.
export async function addStageEmail(stageId: string, formData: FormData) {
  const key = str(formData.get("template_key"));
  if (!key || !isTemplateKey(key) || !isStageTemplate(key)) {
    throw new Error("Pick an email that can be sent on a stage change");
  }
  const db = supabaseAdmin();
  const { error } = await db
    .from("automation_rules")
    .upsert({ stage_id: stageId, template_key: key, active: true }, { onConflict: "stage_id,template_key" });
  if (error) throw error;
  revalidatePath("/admin/projects/stages");
}

export async function removeStageEmail(ruleId: string) {
  const db = supabaseAdmin();
  const { error } = await db.from("automation_rules").delete().eq("id", ruleId);
  if (error) throw error;
  revalidatePath("/admin/projects/stages");
}
