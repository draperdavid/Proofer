import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { deleteTemplate, updateTemplate } from "../../actions";
import { SMART_FIELD_TOKENS } from "../../smart-fields";
import type { ContractTemplate } from "../../types";

export const dynamic = "force-dynamic";

export default async function ContractTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = supabaseAdmin();
  const { data, error } = await db.from("contract_templates").select("*").eq("id", id).single();
  if (error || !data) notFound();

  const template = data as ContractTemplate;
  const updateThisTemplate = updateTemplate.bind(null, template.id);
  const deleteThisTemplate = deleteTemplate.bind(null, template.id);

  return (
    <main>
      <h1>Edit template</h1>
      <p>
        <Link href="/admin/contracts/templates">Back to templates</Link>
      </p>
      <p>Available smart fields: {SMART_FIELD_TOKENS.join(", ")}</p>

      <form action={updateThisTemplate}>
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" defaultValue={template.name} required />
        </div>
        <div>
          <label htmlFor="body">Body</label>
          <textarea id="body" name="body" rows={16} defaultValue={template.body} />
        </div>
        <button type="submit">Save changes</button>
      </form>

      <form action={deleteThisTemplate}>
        <button type="submit">Delete template</button>
      </form>
    </main>
  );
}
