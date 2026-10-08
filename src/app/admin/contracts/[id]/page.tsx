import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import type { Contract } from "../types";

export const dynamic = "force-dynamic";

type ContractWithRelations = Contract & {
  projects: { id: string; title: string } | null;
  contacts: { id: string; name: string } | null;
};

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("contracts")
    .select("*, projects(id, title), contacts(id, name)")
    .eq("id", id)
    .single();
  if (error || !data) notFound();

  const contract = data as unknown as ContractWithRelations;

  return (
    <main>
      <h1>Contract</h1>
      <p>
        {contract.projects ? (
          <Link className="back" href={`/admin/projects/${contract.projects.id}`}>← Back to {contract.projects.title}</Link>
        ) : (
          <Link className="back" href="/admin/contacts">← Back to contacts</Link>
        )}
      </p>
      <p>
        Status: <strong>{contract.status}</strong>
        {contract.contacts ? ` · ${contract.contacts.name}` : ""}
      </p>

      {/* View-only for now — regenerate from the template if something's
          wrong. Editing a generated contract's body, sending for signature,
          and status transitions are tasks 3.2/3.3. */}
      <pre>{contract.filled_body}</pre>
    </main>
  );
}
