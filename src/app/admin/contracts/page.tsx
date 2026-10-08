import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { ClientCell, StatusPill, StatusTabs, one, shortDate } from "../_components/ui";

export const dynamic = "force-dynamic";

const TABS: [string, string][] = [
  ["all", "All"],
  ["draft", "Draft"],
  ["awaiting_signature", "Awaiting signature"],
  ["in_progress", "In progress"],
  ["completed", "Completed"],
  ["canceled", "Canceled"],
];

const TONE: Record<string, "green" | "amber" | "blue" | "red" | "grey"> = {
  draft: "grey",
  awaiting_signature: "blue",
  in_progress: "amber",
  completed: "green",
  canceled: "red",
};
const LABEL = Object.fromEntries(TABS);

type Row = {
  id: string;
  status: string;
  created_at: string;
  contract_templates: { name: string } | { name: string }[] | null;
  contacts: { name: string } | { name: string }[] | null;
  projects: { title: string } | { title: string }[] | null;
};

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const active = TABS.some(([v]) => v === status) ? (status as string) : "all";

  let q = supabaseAdmin()
    .from("contracts")
    .select("id, status, created_at, contract_templates(name), contacts(name), projects(title)")
    .order("created_at", { ascending: false });
  if (active !== "all") q = q.eq("status", active);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <main>
      <div className="pagehead">
        <h1>Contracts</h1>
        <Link href="/admin/contracts/templates" className="btn">
          View templates
        </Link>
      </div>
      <StatusTabs basePath="/admin/contracts" tabs={TABS} active={active} />
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Client</th>
            <th>Project</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const contact = one(c.contacts)?.name;
            const tpl = one(c.contract_templates)?.name ?? "Contract";
            return (
              <tr key={c.id}>
                <td>
                  <Link href={`/admin/contracts/${c.id}`}>{contact ? `${contact} — ${tpl}` : tpl}</Link>
                </td>
                <td>
                  <StatusPill tone={TONE[c.status] ?? "grey"}>{LABEL[c.status] ?? c.status}</StatusPill>
                </td>
                <td>
                  <ClientCell name={contact} />
                </td>
                <td>{one(c.projects)?.title ?? "—"}</td>
                <td>{shortDate(c.created_at)}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No contracts here yet. Generate one from a project page.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
