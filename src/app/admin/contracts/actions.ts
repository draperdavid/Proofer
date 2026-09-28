"use server";

// Contract template CRUD + contract generation. Runs behind the /admin/:path*
// middleware auth gate, so these actions trust the caller and use the
// service-role client directly.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { fillSmartFields } from "./smart-fields";
import type { Contact } from "../contacts/types";
import type { Project } from "../projects/types";

function str(raw: FormDataEntryValue | null): string | null {
  const v = raw ? String(raw).trim() : "";
  return v.length > 0 ? v : null;
}

export async function createTemplate(formData: FormData) {
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
  const db = supabaseAdmin();
  const { error } = await db.from("contract_templates").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/contracts/templates");
  redirect("/admin/contracts/templates");
}

export async function generateContract(projectId: string, formData: FormData) {
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
