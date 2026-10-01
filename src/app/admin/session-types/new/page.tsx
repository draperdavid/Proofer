import Link from "next/link";
import { createSessionType } from "../actions";
import { SessionTypeFields } from "../session-type-fields";
import { loadIntakeTemplates } from "../templates";

export const dynamic = "force-dynamic";

export default async function NewSessionTypePage() {
  const templates = await loadIntakeTemplates();

  return (
    <main>
      <h1>New session type</h1>
      <p>
        <Link href="/admin/session-types">Back to session types</Link>
      </p>
      <form action={createSessionType}>
        <SessionTypeFields {...templates} />
        <button type="submit">Create session type</button>
      </form>
    </main>
  );
}
