import Link from "next/link";
import { TemplatesTabs } from "../../_components/templates-tabs";
import { supabaseAdmin } from "@/lib/supabase";
import { createTemplate } from "../actions";
import { SMART_FIELD_TOKENS } from "../smart-fields";
import type { ContractTemplate } from "../types";

export const dynamic = "force-dynamic";

export default async function ContractTemplatesPage() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("contract_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const templates = (data ?? []) as ContractTemplate[];

  return (
    <main>
      <TemplatesTabs active="contracts" />

      <ul>
        {templates.map((t) => (
          <li key={t.id}>
            <Link href={`/admin/contracts/templates/${t.id}`}>{t.name}</Link>
          </li>
        ))}
        {templates.length === 0 && <li>No templates yet.</li>}
      </ul>

      <h2>New template</h2>
      <p>Available smart fields: {SMART_FIELD_TOKENS.join(", ")}</p>
      <form action={createTemplate}>
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" required />
        </div>
        <div>
          <label htmlFor="body">Body</label>
          <textarea id="body" name="body" rows={12} />
        </div>
        <button type="submit">Create template</button>
      </form>
    </main>
  );
}
