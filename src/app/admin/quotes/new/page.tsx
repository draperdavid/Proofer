import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { createQuote } from "../actions";
import { PackagesEditor } from "../packages-editor";

export const dynamic = "force-dynamic";

type ProjectRow = { id: string; title: string; contact_id: string | null };

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ project_id?: string }>;
}) {
  const { project_id: projectId } = await searchParams;
  if (!projectId) notFound();

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("projects")
    .select("id, title, contact_id")
    .eq("id", projectId)
    .single();
  if (error || !data) notFound();
  const project = data as ProjectRow;

  if (!project.contact_id) {
    return (
      <main>
        <h1>New quote</h1>
        <p>
          <Link className="back" href={`/admin/projects/${project.id}`}>← Back to {project.title}</Link>
        </p>
        <p>This project has no linked contact yet. Link a contact before creating a quote.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>New quote</h1>
      <p>
        <Link className="back" href={`/admin/projects/${project.id}`}>← Back to {project.title}</Link>
      </p>
      <form action={createQuote}>
        <input type="hidden" name="project_id" value={project.id} />
        <input type="hidden" name="contact_id" value={project.contact_id} />
        <div>
          <label htmlFor="title">Title</label>
          <input id="title" name="title" type="text" required />
        </div>
        <PackagesEditor packages={[]} taxRate={0} />
        <div>
          <label htmlFor="notes">Notes (shown to the client)</label>
          <textarea id="notes" name="notes" />
        </div>
        <button type="submit">Save draft</button>
      </form>
    </main>
  );
}
