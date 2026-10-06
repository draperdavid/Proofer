import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { deleteContact, updateContact } from "../actions";
import { ContactFields } from "../contact-fields";
import type { Contact } from "../types";
import type { Project } from "../../projects/types";
import { clearSuppression } from "../../emails/actions";

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

  // Phase 8.4: warn when this contact's address can't be mailed.
  const { data: blocked } = contact.email
    ? await db
        .from("email_suppressions")
        .select("reason, detail, created_at")
        .eq("email", contact.email.trim().toLowerCase())
        .maybeSingle()
    : { data: null };

  const updateThisContact = updateContact.bind(null, contact.id);
  const deleteThisContact = deleteContact.bind(null, contact.id);

  return (
    <main>
      <h1>Edit contact</h1>
      <p>
        <Link href="/admin/contacts">Back to contacts</Link>
      </p>
      {blocked && contact.email && (
        <form
          role="alert"
          action={clearSuppression.bind(null, contact.email, `/admin/contacts/${contact.id}`)}
          style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
        >
          <span>
            Emails to {contact.email} are blocked: it{" "}
            {blocked.reason === "complained" ? "marked an email as spam" : "bounced"} on{" "}
            {String(blocked.created_at).slice(0, 10)}
            {blocked.detail ? ` (${blocked.detail as string})` : ""}. Fix the address, or clear the block if it works
            again.
          </span>
          <button type="submit">Clear block</button>
        </form>
      )}
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
