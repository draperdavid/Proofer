"use server";

// Public questionnaire submission — no Supabase session reaches this route,
// so it re-validates against the questionnaire's own `fields` snapshot
// (never trusts which fields the client claims to have posted) same as
// /pay's checkout-session creation and /inquire's intake validation.
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import type { QuestionnaireAnswers, QuestionnaireField } from "@/app/admin/questionnaires/types";

function buildAnswers(fields: QuestionnaireField[], formData: FormData): QuestionnaireAnswers {
  const answers: QuestionnaireAnswers = {};

  for (const field of fields) {
    const key = `field_${field.id}`;

    if (field.type === "checkbox") {
      const checked = formData.get(key) !== null;
      if (field.required && !checked) {
        throw new Error(`"${field.label}" is required`);
      }
      answers[field.id] = checked ? "true" : "false";
      continue;
    }

    const raw = formData.get(key);
    const value = raw ? String(raw).trim() : "";
    if (field.required && !value) {
      throw new Error(`"${field.label}" is required`);
    }
    if (field.type === "multiple_choice" && value && !field.options.includes(value)) {
      throw new Error(`"${field.label}" has an invalid selection`);
    }
    answers[field.id] = value;
  }

  return answers;
}

export async function submitAnswers(questionnaireId: string, formData: FormData) {
  const db = supabaseAdmin();
  const { data: questionnaire, error } = await db
    .from("questionnaires")
    .select("*")
    .eq("id", questionnaireId)
    .single();
  if (error || !questionnaire) throw error ?? new Error("Questionnaire not found");
  if (questionnaire.submitted_at) throw new Error("This questionnaire has already been submitted");

  const fields = questionnaire.fields as QuestionnaireField[];
  const answers = buildAnswers(fields, formData);

  const { error: updateError } = await db
    .from("questionnaires")
    .update({ answers, submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", questionnaireId);
  if (updateError) throw updateError;

  redirect(`/questionnaire/${questionnaireId}?success=1`);
}
