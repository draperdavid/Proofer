import Link from "next/link";
import { TemplatesTabs } from "../../_components/templates-tabs";
import { supabaseAdmin } from "@/lib/supabase";
import { createTemplate } from "../actions";
import { FieldEditor } from "../field-editor";
import type { QuestionnaireTemplate } from "../types";

export const dynamic = "force-dynamic";

export default async function QuestionnaireTemplatesPage() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("questionnaire_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const templates = (data ?? []) as QuestionnaireTemplate[];

  return (
    <main>
      <TemplatesTabs active="questionnaires" />

      <ul>
        {templates.map((t) => (
          <li key={t.id}>
            <Link href={`/admin/questionnaires/templates/${t.id}`}>{t.name}</Link>
            {` — ${t.fields.length} field${t.fields.length === 1 ? "" : "s"}`}
          </li>
        ))}
        {templates.length === 0 && <li>No templates yet.</li>}
      </ul>

      <h2>New template</h2>
      <form action={createTemplate}>
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" required />
        </div>
        <FieldEditor fields={[]} />
        <button type="submit">Create template</button>
      </form>
    </main>
  );
}
