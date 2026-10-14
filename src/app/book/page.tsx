// Public list of bookable sessions (Phase 4.4). Only active, public session
// types; private ones are reachable by direct link (/book/[slug]) only.
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { formatCents } from "@/app/admin/invoices/money";
import type { SessionType } from "@/app/admin/session-types/types";

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const { data, error } = await supabaseAdmin()
    .from("session_types")
    .select("*")
    .eq("active", true)
    .eq("is_public", true)
    .gt("price_cents", 0)
    .order("name");
  if (error) throw error;
  const types = (data ?? []) as SessionType[];

  return (
    <main>
      <h1>Book a session</h1>
      {types.length === 0 ? (
        <p>There&apos;s nothing open for booking right now. <Link href="/inquire">Get in touch</Link> instead.</p>
      ) : (
        <ul>
          {types.map((t) => (
            <li key={t.id}>
              <Link href={`/book/${t.slug}`}>
                <strong>{t.name}</strong>
              </Link>{" "}
              · {t.duration_minutes} min · {formatCents(t.price_cents, t.currency)}
              {t.deposit_cents !== null && t.deposit_cents < t.price_cents
                ? ` (${formatCents(t.deposit_cents, t.currency)} deposit to book)`
                : ""}
              {t.description && <p>{t.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
