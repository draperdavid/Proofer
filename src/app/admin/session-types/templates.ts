import { supabaseAdmin } from "@/lib/supabase";
import type { TemplateOption } from "./types";

// Contract + questionnaire templates offered as attachable intake docs.
export async function loadIntakeTemplates(): Promise<{
  contractTemplates: TemplateOption[];
  questionnaireTemplates: TemplateOption[];
}> {
  const db = supabaseAdmin();
  const [contracts, questionnaires] = await Promise.all([
    db.from("contract_templates").select("id, name").order("name"),
    db.from("questionnaire_templates").select("id, name").order("name"),
  ]);
  if (contracts.error) throw contracts.error;
  if (questionnaires.error) throw questionnaires.error;

  return {
    contractTemplates: (contracts.data ?? []) as TemplateOption[],
    questionnaireTemplates: (questionnaires.data ?? []) as TemplateOption[],
  };
}
