import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { KanbanBoard } from "./kanban-board";
import type { Project, ProjectStage } from "./types";

export const dynamic = "force-dynamic";

type SearchParams = { view?: string; archived?: string; q?: string; type?: string };

// PostgREST's .or() filter syntax treats "," and "()" as structural, so strip
// them from user input rather than letting a search term reshape the filter.
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()]/g, "").trim();
}

export default async function ProjectsPage({
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
  ] = await Promise.all([
    query,
    db.from("project_stages").select("*").order("position", { ascending: true }),
    db.from("contacts").select("id, name"),
  ]);
  if (projectsError) throw projectsError;
  if (stagesError) throw stagesError;
  if (contactsError) throw contactsError;

  const projects = (projectsData ?? []) as Project[];
  const stages = (stagesData ?? []) as ProjectStage[];
  const contactNames = new Map((contactsData ?? []).map((c) => [c.id as string, c.name as string]));
  const hasFilters = Boolean(q || type);

  const viewParam = isListView ? "list" : "board";
  const baseQuery = `view=${viewParam}${showArchived ? "&archived=1" : ""}`;

  return (
    <main>
      <h1>Projects</h1>
      <p>
        <Link href="/admin">Back to admin</Link>
      </p>

      <p>
        <Link href={`/admin/projects?view=board${showArchived ? "&archived=1" : ""}`}>Board</Link>
        {" | "}
        <Link href={`/admin/projects?view=list${showArchived ? "&archived=1" : ""}`}>List</Link>
        {" | "}
        {showArchived ? (
          <Link href={`/admin/projects?view=${viewParam}`}>Active</Link>
        ) : (
          <Link href={`/admin/projects?view=${viewParam}&archived=1`}>Archived</Link>
        )}
        {" | "}
        <Link href="/admin/projects/stages">Manage stages</Link>
      </p>

      <form>
        <input type="hidden" name="view" value={viewParam} />
        {showArchived && <input type="hidden" name="archived" value="1" />}
        <input type="text" name="q" placeholder="Search title or location" defaultValue={q ?? ""} />
        <input type="text" name="type" placeholder="Filter by type" defaultValue={type ?? ""} />
        <button type="submit">Filter</button>
        {hasFilters && <Link href={`/admin/projects?${baseQuery}`}>Clear</Link>}
      </form>

      {isListView ? (
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Contact</th>
              <th>Stage</th>
              <th>Type</th>
              <th>Event date</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/admin/projects/${p.id}`}>{p.title}</Link>
                </td>
                <td>{p.contact_id ? (contactNames.get(p.contact_id) ?? "—") : "—"}</td>
                <td>{stages.find((s) => s.id === p.stage_id)?.name ?? "—"}</td>
                <td>{p.type ?? "—"}</td>
                <td>{p.event_date ?? "—"}</td>
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
        <KanbanBoard stages={stages} projects={projects} />
      )}
    </main>
  );
}
