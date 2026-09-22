import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { deleteContact, updateContact } from "../actions";
import { ContactFields } from "../contact-fields";
import type { Contact } from "../types";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = supabaseAdmin();
  const { data, error } = await db.from("contacts").select("*").eq("id", id).single();
  if (error || !data) notFound();
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
    </main>
  );
}
