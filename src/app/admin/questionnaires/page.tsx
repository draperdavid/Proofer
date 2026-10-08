import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { DocumentsSwitch } from "../_components/documents-switch";
import { ClientCell, StatusPill, StatusTabs, one, shortDate } from "../_components/ui";

export const dynamic = "force-dynamic";

const TABS: [string, string][] = [
  ["all", "All"],
  ["awaiting", "Awaiting response"],
  ["completed", "Completed"],
];

type Row = {
  id: string;
  submitted_at: string | null;
  created_at: string;
  questionnaire_templates: { name: string } | { name: string }[] | null;
  contacts: { name: string } | { name: string }[] | null;
  projects: { title: string } | { title: string }[] | null;
};

export default async function QuestionnairesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const active = TABS.some(([v]) => v === status) ? (status as string) : "all";

  let q = supabaseAdmin()
    .from("questionnaires")
    .select("id, submitted_at, created_at, questionnaire_templates(name), contacts(name), projects(title)")
    .order("created_at", { ascending: false });
  if (active === "awaiting") q = q.is("submitted_at", null);
  if (active === "completed") q = q.not("submitted_at", "is", null);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <main>
      <div className="pagehead">
        <DocumentsSwitch active="questionnaires" />
        <Link href="/admin/questionnaires/templates" className="btn">
          View templates
        </Link>
      </div>
      <StatusTabs basePath="/admin/questionnaires" tabs={TABS} active={active} />
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Client</th>
            <th>Project</th>
            <th>Sent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const contact = one(r.contacts)?.name;
            const tpl = one(r.questionnaire_templates)?.name ?? "Questionnaire";
            return (
              <tr key={r.id}>
                <td>
                  <Link href={`/admin/questionnaires/${r.id}`}>{contact ? `${contact} — ${tpl}` : tpl}</Link>
                </td>
                <td>
                  {r.submitted_at ? (
                    <StatusPill tone="green">Completed</StatusPill>
                  ) : (
                    <StatusPill tone="blue">Awaiting response</StatusPill>
                  )}
                </td>
                <td>
                  <ClientCell name={contact} />
                </td>
                <td>{one(r.projects)?.title ?? "—"}</td>
                <td>{shortDate(r.created_at)}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No questionnaires here yet. Send one from a project page.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
