import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { deleteContact, updateContact } from "../actions";
import { ContactFields } from "../contact-fields";
import type { Contact } from "../types";
import type { Project } from "../../projects/types";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = supabaseAdmin();
  const [{ data, error }, { data: projects, error: projectsError }] = await Promise.all([
    db.from("contacts").select("*").eq("id", id).single(),
    db.from("projects").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
  ]);
  if (error || !data) notFound();
  if (projectsError) throw projectsError;
  const contact = data as Contact;

  const updateThisContact = updateContact.bind(null, contact.id);
  const deleteThisContact = deleteContact.bind(null, contact.id);

  return (
    <main>
      <h1>Edit contact</h1>
      <p>
        <Link href="/admin/contacts">Back to contacts</Link>
      </p>
      <form action={updateThisContact}>
        <ContactFields contact={contact} />
        <button type="submit">Save changes</button>
      </form>
      <form action={deleteThisContact}>
        <button type="submit">Delete contact</button>
      </form>

      <h2>Projects</h2>
      <p>
        <Link href={`/admin/projects/new?contact_id=${contact.id}`}>+ New project</Link>
      </p>
      <ul>
        {((projects ?? []) as Project[]).map((p) => (
          <li key={p.id}>
            <Link href={`/admin/projects/${p.id}`}>{p.title}</Link>
            {p.archived ? " (archived)" : ""}
          </li>
        ))}
        {(!projects || projects.length === 0) && <li>No projects yet.</li>}
      </ul>
    </main>
  );
}
