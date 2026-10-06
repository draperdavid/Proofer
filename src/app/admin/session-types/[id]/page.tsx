import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { deleteSessionType, updateSessionType } from "../actions";
import { SessionTypeFields } from "../session-type-fields";
import { loadIntakeTemplates } from "../templates";
import type { SessionType } from "../types";
import { ConfirmButton } from "@/app/admin/_components/confirm-button";

export const dynamic = "force-dynamic";

export default async function SessionTypeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = supabaseAdmin();
  const [{ data, error }, templates] = await Promise.all([
    db.from("session_types").select("*").eq("id", id).single(),
    loadIntakeTemplates(),
  ]);
  if (error || !data) notFound();
  const sessionType = data as SessionType;

  const updateThis = updateSessionType.bind(null, sessionType.id);
  const deleteThis = deleteSessionType.bind(null, sessionType.id);

  return (
    <main>
      <h1>Edit session type</h1>
      <p>
        <Link href="/admin/session-types">Back to session types</Link>
      </p>
      <form action={updateThis}>
        <SessionTypeFields sessionType={sessionType} {...templates} />
        <button type="submit">Save changes</button>
      </form>
      <form action={deleteThis}>
        <ConfirmButton message="Delete this session type?">Delete session type</ConfirmButton>
      </form>
    </main>
  );
}
