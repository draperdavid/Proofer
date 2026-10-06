import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { deleteTemplate, updateTemplate } from "../../actions";
import { FieldEditor } from "../../field-editor";
import type { QuestionnaireTemplate } from "../../types";
import { ConfirmButton } from "@/app/admin/_components/confirm-button";

export const dynamic = "force-dynamic";

export default async function QuestionnaireTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = supabaseAdmin();
  const { data, error } = await db.from("questionnaire_templates").select("*").eq("id", id).single();
  if (error || !data) notFound();

  const template = data as QuestionnaireTemplate;
  const updateThisTemplate = updateTemplate.bind(null, template.id);
  const deleteThisTemplate = deleteTemplate.bind(null, template.id);

  return (
    <main>
      <h1>Edit questionnaire template</h1>
      <p>
        <Link href="/admin/questionnaires/templates">Back to templates</Link>
      </p>

      <form action={updateThisTemplate}>
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" defaultValue={template.name} required />
        </div>
        <FieldEditor fields={template.fields} />
        <button type="submit">Save changes</button>
      </form>

      <form action={deleteThisTemplate}>
        <ConfirmButton message="Delete this questionnaire template?">Delete template</ConfirmButton>
      </form>
    </main>
  );
}
