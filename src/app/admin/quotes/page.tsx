import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { ClientCell, StatusPill, StatusTabs, one, shortDate } from "../_components/ui";

export const dynamic = "force-dynamic";

const TABS: [string, string][] = [
  ["all", "All"],
  ["draft", "Draft"],
  ["sent", "Sent"],
  ["accepted", "Accepted"],
];
const TONE: Record<string, "green" | "blue" | "grey"> = { draft: "grey", sent: "blue", accepted: "green" };
const LABEL = Object.fromEntries(TABS);

type Row = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  contacts: { name: string } | { name: string }[] | null;
  projects: { title: string } | { title: string }[] | null;
};

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const active = TABS.some(([v]) => v === status) ? (status as string) : "all";

  let q = supabaseAdmin()
    .from("quotes")
    .select("id, title, status, created_at, contacts(name), projects(title)")
    .order("created_at", { ascending: false });
  if (active !== "all") q = q.eq("status", active);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <main>
      <div className="pagehead">
        <h1>Quotes</h1>
      </div>
      <StatusTabs basePath="/admin/quotes" tabs={TABS} active={active} />
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th>Client</th>
            <th>Project</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/admin/quotes/${r.id}`}>{r.title}</Link>
              </td>
              <td>
                <StatusPill tone={TONE[r.status] ?? "grey"}>{LABEL[r.status] ?? r.status}</StatusPill>
              </td>
              <td>
                <ClientCell name={one(r.contacts)?.name} />
              </td>
              <td>{one(r.projects)?.title ?? "—"}</td>
              <td>{shortDate(r.created_at)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No quotes here yet. Create one from a project page.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
