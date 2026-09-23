import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { createProject } from "../actions";
import { ProjectFields } from "../project-fields";
import type { ProjectStage } from "../types";

// A project is always created from its contact's detail page, so contact_id
// arrives pre-filled via query param rather than being picked from a list here.
export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ contact_id?: string }>;
}) {
  const { contact_id } = await searchParams;
  if (!contact_id) notFound();

  const db = supabaseAdmin();
  const [{ data: contact, error: contactError }, { data: stages, error: stagesError }] = await Promise.all([
    db.from("contacts").select("id, name").eq("id", contact_id).single(),
    db.from("project_stages").select("*").order("position", { ascending: true }),
  ]);
  if (contactError || !contact) notFound();
  if (stagesError) throw stagesError;

  return (
    <main>
      <h1>New project for {contact.name}</h1>
      <p>
        <Link href={`/admin/contacts/${contact.id}`}>Back to contact</Link>
      </p>
      <form action={createProject}>
        <ProjectFields stages={(stages ?? []) as ProjectStage[]} contactId={contact.id} />
        <button type="submit">Create project</button>
      </form>
    </main>
  );
}
