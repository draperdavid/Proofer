import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { createCollection } from "../actions";
import { CollectionFields } from "../collection-fields";

export const dynamic = "force-dynamic";

// Opened from a project page as ?project_id=…, the new gallery is linked to
// that project (and its contact) and named after it by default.
export default async function NewCollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ project_id?: string }>;
}) {
  const { project_id: projectId } = await searchParams;

  let project: { id: string; title: string; event_date: string | null } | null = null;
  if (projectId) {
    const { data, error } = await supabaseAdmin()
      .from("projects")
      .select("id, title, event_date")
      .eq("id", projectId)
      .maybeSingle();
    if (!error) project = data;
  }

  return (
    <main>
      <h1>New collection</h1>
      <p>
        {project ? (
          <Link className="back" href={`/admin/projects/${project.id}`}>← Back to {project.title}</Link>
        ) : (
          <Link className="back" href="/admin/galleries">← Back to galleries</Link>
        )}
      </p>
      <form action={createCollection}>
        {project && (
          <>
            <input type="hidden" name="project_id" value={project.id} />
            <p>For project: {project.title}</p>
          </>
        )}
        <CollectionFields
          collection={project ? { name: project.title, event_date: project.event_date } : undefined}
        />
        <button type="submit">Create collection</button>
      </form>
    </main>
  );
}
