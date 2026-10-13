"use server";

// Contract template CRUD + contract generation. Every action checks
// requireAdmin() first, then uses the service-role client directly.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth/require-admin";
import { headers } from "next/headers";
import { fillSmartFields } from "./smart-fields";
import { onContractSent } from "@/lib/email/triggers";
import { MAX_IP, MAX_USER_AGENT, cleanHeader } from "@/lib/contracts/signing";
import type { Contact } from "../contacts/types";
import type { Project } from "../projects/types";

function str(raw: FormDataEntryValue | null): string | null {
  const v = raw ? String(raw).trim() : "";
  return v.length > 0 ? v : null;
}

export async function createTemplate(formData: FormData) {
  await requireAdmin();
  const name = str(formData.get("name"));
  if (!name) throw new Error("Name is required");
  const body = String(formData.get("body") ?? "");

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("contract_templates")
    .insert({ name, body })
    .select("id")
    .single();
  if (error) throw error;

  revalidatePath("/admin/contracts/templates");
  redirect(`/admin/contracts/templates/${data.id}`);
}

export async function updateTemplate(id: string, formData: FormData) {
  await requireAdmin();
  const name = str(formData.get("name"));
  if (!name) throw new Error("Name is required");
  const body = String(formData.get("body") ?? "");

  const db = supabaseAdmin();
  const { error } = await db
    .from("contract_templates")
    .update({ name, body, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/contracts/templates");
  revalidatePath(`/admin/contracts/templates/${id}`);
  redirect(`/admin/contracts/templates/${id}`);
}

export async function deleteTemplate(id: string) {
  await requireAdmin();
  const db = supabaseAdmin();
  const { error } = await db.from("contract_templates").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/contracts/templates");
  redirect("/admin/contracts/templates");
}

export async function generateContract(projectId: string, formData: FormData) {
  await requireAdmin();
  const templateId = str(formData.get("template_id"));
  if (!templateId) throw new Error("A template is required");

  const db = supabaseAdmin();
  const { data: project, error: projectError } = await db
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (projectError || !project) throw projectError ?? new Error("Project not found");
  if (!project.contact_id) throw new Error("This project has no linked contact");

  const [{ data: contact, error: contactError }, { data: template, error: templateError }] =
    await Promise.all([
      db.from("contacts").select("*").eq("id", project.contact_id).single(),
      db.from("contract_templates").select("*").eq("id", templateId).single(),
    ]);
  if (contactError || !contact) throw contactError ?? new Error("Contact not found");
  if (templateError || !template) throw templateError ?? new Error("Template not found");

  const filledBody = fillSmartFields(template.body, contact as Contact, project as Project);

  const { data: contractRow, error: contractError2 } = await db
    .from("contracts")
    .insert({
      project_id: project.id,
      contact_id: contact.id,
      template_id: template.id,
      filled_body: filledBody,
    })
    .select("id")
    .single();
  if (contractError2) throw contractError2;

  revalidatePath(`/admin/projects/${project.id}`);
  redirect(`/admin/contracts/${contractRow.id}`);
}

// Status changes David controls (Phase 3.3). Each is a conditional update on
// the current status, so a double-click or a stale tab can't apply it twice,
// and the database trigger (migration 0020) refuses any other transition.
// Only the client's signature (/sign/[id]) can reach `completed`.
async function transition(
  id: string,
  from: "draft" | "awaiting_signature",
  to: "awaiting_signature" | "canceled",
  event: "sent" | "canceled"
): Promise<boolean> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("contracts")
    .update({ status: to, updated_at: now, ...(to === "awaiting_signature" ? { sent_at: now } : { canceled_at: now }) })
    .eq("id", id)
    .eq("status", from)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) return false;

  const h = await headers();
  const { error: eventError } = await db.from("contract_events").insert({
    contract_id: id,
    event,
    ip: cleanHeader(h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0], MAX_IP),
    user_agent: cleanHeader(h.get("user-agent"), MAX_USER_AGENT),
    detail: event === "sent" ? "Sent for signature by David" : "Canceled by David",
  });
  if (eventError) throw eventError;
  return true;
}

export async function sendForSignature(id: string) {
  await requireAdmin();
  if (await transition(id, "draft", "awaiting_signature", "sent")) await onContractSent(id);
  revalidatePath(`/admin/contracts/${id}`);
  revalidatePath("/admin/contracts");
}

export async function cancelContract(id: string) {
  await requireAdmin();
  await transition(id, "awaiting_signature", "canceled", "canceled");
  revalidatePath(`/admin/contracts/${id}`);
  revalidatePath("/admin/contracts");
}
