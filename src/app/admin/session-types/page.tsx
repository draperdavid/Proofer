import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { formatCents } from "../invoices/money";
import type { SessionType } from "./types";

export const dynamic = "force-dynamic";

export default async function SessionTypesPage() {
  const db = supabaseAdmin();
  const { data, error } = await db.from("session_types").select("*").order("name");
  if (error) throw error;
  const sessionTypes = (data ?? []) as SessionType[];

  return (
    <main>
      <h1>Session types</h1>
      <p>
        <Link href="/admin/session-types/new">+ New session type</Link>
      </p>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Duration</th>
            <th>Price</th>
            <th>Deposit</th>
            <th>Visibility</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {sessionTypes.map((s) => (
            <tr key={s.id}>
              <td>
                <Link href={`/admin/session-types/${s.id}`}>{s.name}</Link>
              </td>
              <td>{s.slug}</td>
              <td>{s.duration_minutes} min</td>
              <td>{formatCents(s.price_cents, s.currency)}</td>
              <td>{s.deposit_cents === null ? "—" : formatCents(s.deposit_cents, s.currency)}</td>
              <td>{s.is_public ? "Public" : "Private"}</td>
              <td>{s.active ? "Yes" : "No"}</td>
            </tr>
          ))}
          {sessionTypes.length === 0 && (
            <tr>
              <td colSpan={7}>No session types yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
