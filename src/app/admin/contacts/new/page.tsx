import Link from "next/link";
import { createContact } from "../actions";
import { ContactFields } from "../contact-fields";

export default function NewContactPage() {
  return (
    <main>
      <h1>New contact</h1>
      <p>
        <Link href="/admin/contacts">Back to contacts</Link>
      </p>
      <form action={createContact}>
        <ContactFields />
        <button type="submit">Create contact</button>
      </form>
    </main>
  );
}
