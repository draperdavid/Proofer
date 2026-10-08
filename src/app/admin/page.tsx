import Link from "next/link";
import { projectBadges, type Badge } from "@/lib/project-badges";
import { formatDay, todayISO } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase";
import { KanbanBoard } from "./projects/kanban-board";
import type { Project, ProjectStage } from "./projects/types";
import { OverviewWidgets, StatStrip, loadOverview } from "./_components/overview";

export const dynamic = "force-dynamic";

type SearchParams = { view?: string; archived?: string; q?: string; type?: string };

// PostgREST's .or() filter syntax treats "," and "()" as structural, so strip
// them from user input rather than letting a search term reshape the filter.
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()]/g, "").trim();
}

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { view, archived, q, type } = await searchParams;
  const showArchived = archived === "1";
  const isListView = view === "list";

  const db = supabaseAdmin();

  let query = db
    .from("projects")
    .select("*")
    .eq("archived", showArchived)
    .order("position", { ascending: true });

  const term = q ? sanitizeSearchTerm(q) : "";
  if (term) {
    query = query.or(`title.ilike.%${term}%,location.ilike.%${term}%`);
  }
  if (type) {
    query = query.eq("type", type);
  }

  const [
    { data: projectsData, error: projectsError },
    { data: stagesData, error: stagesError },
    { data: contactsData, error: contactsError },
    overview,
  ] = await Promise.all([
    query,
    db.from("project_stages").select("*").order("position", { ascending: true }),
    db.from("contacts").select("id, name"),
    loadOverview(),
  ]);
  if (projectsError) throw projectsError;
  if (stagesError) throw stagesError;
  if (contactsError) throw contactsError;

  const projects = (projectsData ?? []) as Project[];
  const stages = (stagesData ?? []) as ProjectStage[];
  const contactNames = new Map((contactsData ?? []).map((c) => [c.id as string, c.name as string]));
  const hasFilters = Boolean(q || type);

  // Status pills come from each project's real invoices, contracts and questionnaires.
  // If any of these lookups fails the board still renders, just without those pills.
  const projectIds = projects.map((pr) => pr.id);
  const [invRes, conRes, quesRes] =
    projectIds.length > 0
      ? await Promise.all([
          db.from("invoices").select("project_id, status, due_date").in("project_id", projectIds),
          db.from("contracts").select("project_id, status").in("project_id", projectIds),
          db.from("questionnaires").select("project_id, submitted_at").in("project_id", projectIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];
  const today = todayISO();
  const badges: Record<string, Badge[]> = {};
  for (const id of projectIds) {
    badges[id] = projectBadges(
      {
        invoices: ((invRes.data ?? []) as { project_id: string; status: string; due_date: string | null }[]).filter((r) => r.project_id === id),
        contracts: ((conRes.data ?? []) as { project_id: string; status: string }[]).filter((r) => r.project_id === id),
        questionnaires: ((quesRes.data ?? []) as { project_id: string; submitted_at: string | null }[]).filter((r) => r.project_id === id),
      },
      today
    );
  }
  const clients: Record<string, string> = {};
  for (const pr of projects) if (pr.contact_id && contactNames.get(pr.contact_id)) clients[pr.id] = contactNames.get(pr.contact_id)!;

  const viewParam = isListView ? "list" : "board";
  const baseQuery = `view=${viewParam}${showArchived ? "&archived=1" : ""}`;

  return (
    <main>
      <div className="pagehead">
        <h1>Projects</h1>
        <div className="row">
          <nav className="seg" aria-label="View">
            <Link href={`/admin?view=board${showArchived ? "&archived=1" : ""}`} className={isListView ? undefined : "on"}>
              Board
            </Link>
            <Link href={`/admin?view=list${showArchived ? "&archived=1" : ""}`} className={isListView ? "on" : undefined}>
              List
            </Link>
          </nav>
          {showArchived ? (
            <Link href={`/admin?view=${viewParam}`} className="btn">
              Active
            </Link>
          ) : (
            <Link href={`/admin?view=${viewParam}&archived=1`} className="btn">
              Archived
            </Link>
          )}
          <Link href="/admin/projects/stages" className="btn">
            Manage stages
          </Link>
        </div>
      </div>

      <StatStrip overview={overview} />

      <form className="filters">
        <input type="hidden" name="view" value={viewParam} />
        {showArchived && <input type="hidden" name="archived" value="1" />}
        <input type="text" name="q" placeholder="Search title or location" defaultValue={q ?? ""} />
        <input type="text" name="type" placeholder="Filter by type" defaultValue={type ?? ""} />
        <button type="submit">Filter</button>
        {hasFilters && <Link href={`/admin?${baseQuery}`}>Clear</Link>}
      </form>

      {isListView ? (
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Client</th>
              <th>Stage</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((pr) => (
              <tr key={pr.id}>
                <td>
                  <Link href={`/admin/projects/${pr.id}`}>{pr.title}</Link>
                  {pr.type && <span className="chip" style={{ marginLeft: 8 }}>{pr.type}</span>}
                </td>
                <td>
                  {clients[pr.id] ? (
                    <span className="clientcell">{clients[pr.id]}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <span className="st grey">{stages.find((s) => s.id === pr.stage_id)?.name ?? "No stage"}</span>
                </td>
                <td>{pr.event_date ? <span className="chip">{formatDay(pr.event_date)}</span> : <span className="muted">TBD</span>}</td>
                <td>
                  <span className="pills">
                    {badges[pr.id].map((bd) => (
                      <span key={bd.label} className={`st ${bd.tone}`}>
                        {bd.label}
                      </span>
                    ))}
                    {badges[pr.id].length === 0 && <span className="muted">—</span>}
                  </span>
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={5}>No projects found.</td>
              </tr>
            )}
          </tbody>
        </table>
      ) : (
        <KanbanBoard stages={stages} projects={projects} clients={clients} badges={badges} />
      )}

      <OverviewWidgets overview={overview} />
    </main>
  );
}
