"use server";

// Questionnaire template CRUD + sending a questionnaire to a project. Runs
// behind the /admin/:path* middleware auth gate, so these actions trust the
// caller and use the service-role client directly.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import type { QuestionnaireField, QuestionnaireFieldType } from "./types";

const FIELD_TYPES: QuestionnaireFieldType[] = [
  "short_text",
  "long_text",
  "multiple_choice",
  "checkbox",
  "email",
  "date",
];

function str(raw: FormDataEntryValue | null): string | null {
  const v = raw ? String(raw).trim() : "";
  return v.length > 0 ? v : null;
}

function parseFields(raw: FormDataEntryValue | null): QuestionnaireField[] {
  if (!raw) throw new Error("At least one field is required");

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    throw new Error("Invalid fields");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("At least one field is required");
  }

  return parsed.map((raw, i) => {
    const f = raw as Record<string, unknown>;
    const label = typeof f.label === "string" ? f.label.trim() : "";
    const type = FIELD_TYPES.includes(f.type as QuestionnaireFieldType)
      ? (f.type as QuestionnaireFieldType)
      : null;
    if (!label) throw new Error("Every field needs a label");
    if (!type) throw new Error("Every field needs a valid type");

    const options =
      Array.isArray(f.options) && type === "multiple_choice"
        ? f.options.filter((o): o is string => typeof o === "string" && o.trim().length > 0)
        : [];
    if (type === "multiple_choice" && options.length === 0) {
      throw new Error("Multiple choice fields need at least one option");
    }

    return {
      id: typeof f.id === "string" && f.id ? f.id : crypto.randomUUID(),
      label,
      type,
      required: Boolean(f.required),
      options,
      position: i,
    };
  });
}

export async function createTemplate(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) throw new Error("Name is required");
  const fields = parseFields(formData.get("fields_json"));

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("questionnaire_templates")
    .insert({ name, fields })
    .select("id")
    .single();
  if (error) throw error;

  revalidatePath("/admin/questionnaires/templates");
  redirect(`/admin/questionnaires/templates/${data.id}`);
}

export async function updateTemplate(id: string, formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) throw new Error("Name is required");
  const fields = parseFields(formData.get("fields_json"));

  const db = supabaseAdmin();
  const { error } = await db
    .from("questionnaire_templates")
    .update({ name, fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/questionnaires/templates");
  revalidatePath(`/admin/questionnaires/templates/${id}`);
  redirect(`/admin/questionnaires/templates/${id}`);
}

export async function deleteTemplate(id: string) {
  const db = supabaseAdmin();
  const { error } = await db.from("questionnaire_templates").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/questionnaires/templates");
  redirect("/admin/questionnaires/templates");
}

export async function sendQuestionnaire(projectId: string, formData: FormData) {
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

  const { data: template, error: templateError } = await db
    .from("questionnaire_templates")
    .select("*")
    .eq("id", templateId)
    .single();
  if (templateError || !template) throw templateError ?? new Error("Template not found");

  const { data: row, error: insertError } = await db
    .from("questionnaires")
    .insert({
      project_id: project.id,
      contact_id: project.contact_id,
      template_id: template.id,
      fields: template.fields,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  revalidatePath(`/admin/projects/${project.id}`);
  redirect(`/admin/questionnaires/${row.id}`);
}
