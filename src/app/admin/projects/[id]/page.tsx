import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { deleteProject, updateProject } from "../actions";
import { ProjectFields } from "../project-fields";
import type { Project, ProjectStage } from "../types";
import { formatCents } from "../../invoices/money";
import type { Invoice } from "../../invoices/types";

export const dynamic = "force-dynamic";

type ProjectWithContact = Project & { contacts: { id: string; name: string } | null };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = supabaseAdmin();
  const [{ data, error }, { data: stages, error: stagesError }, { data: invoices, error: invoicesError }] =
    await Promise.all([
      db.from("projects").select("*, contacts(id, name)").eq("id", id).single(),
      db.from("project_stages").select("*").order("position", { ascending: true }),
      db.from("invoices").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    ]);
  if (error || !data) notFound();
  if (stagesError) throw stagesError;
  if (invoicesError) throw invoicesError;

  const project = data as ProjectWithContact;
  const updateThisProject = updateProject.bind(null, project.id);
  const deleteThisProject = deleteProject.bind(null, project.id, project.contact_id);

  return (
    <main>
      <h1>Edit project</h1>
      <p>
        {project.contacts ? (
          <Link href={`/admin/contacts/${project.contacts.id}`}>Back to {project.contacts.name}</Link>
        ) : (
          <Link href="/admin/contacts">Back to contacts</Link>
        )}
      </p>
      <form action={updateThisProject}>
        <ProjectFields project={project} stages={(stages ?? []) as ProjectStage[]} />
        <button type="submit">Save changes</button>
      </form>
      <form action={deleteThisProject}>
        <button type="submit">Delete project</button>
      </form>

      <h2>Invoices</h2>
      <p>
        <Link href={`/admin/invoices/new?project_id=${project.id}`}>+ New invoice</Link>
      </p>
      <ul>
        {((invoices ?? []) as Invoice[]).map((inv) => (
          <li key={inv.id}>
            <Link href={`/admin/invoices/${inv.id}`}>{formatCents(inv.total_cents, inv.currency)}</Link>
            {" — "}
            {inv.status}
          </li>
        ))}
        {(!invoices || invoices.length === 0) && <li>No invoices yet.</li>}
      </ul>
    </main>
  );
}
