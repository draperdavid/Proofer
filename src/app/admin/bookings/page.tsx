// Online bookings (Phase 4.4): upcoming confirmed sessions and live holds,
// then recent past and canceled ones.
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { isMissingTable } from "@/lib/db-errors";
import { formatSessionWhen } from "@/lib/booking/book";
import { ConfirmButton } from "@/app/admin/_components/confirm-button";
import { cancelBooking } from "./actions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  status: "pending_payment" | "confirmed" | "canceled";
  starts_at: string;
  timezone: string;
  hold_expires_at: string;
  project_id: string | null;
  invoice_id: string | null;
  session_types: { name: string } | null;
  contacts: { name: string; email: string | null } | null;
};

export default async function BookingsPage() {
  const { data, error } = await supabaseAdmin()
    .from("bookings")
    .select("id, status, starts_at, timezone, hold_expires_at, project_id, invoice_id, session_types(name), contacts(name, email)")
    .order("starts_at", { ascending: true })
    .limit(200);
  if (isMissingTable(error)) {
    return (
      <main>
        <h1>Bookings</h1>
        <p>Run migration 0024 to turn on online booking.</p>
      </main>
    );
  }
  if (error) throw error;

  const now = Date.now();
  const rows = (data ?? []) as unknown as Row[];
  // A pending booking with money already in: its time was taken before the
  // payment landed (0027 refuses to confirm an overlap). David sorts it out.
  const pendingInvoiceIds = rows.filter((r) => r.status === "pending_payment" && r.invoice_id).map((r) => r.invoice_id as string);
  const paidPending = new Set<string>();
  if (pendingInvoiceIds.length > 0) {
    const [{ data: paidInv }, { data: paidInst }] = await Promise.all([
      supabaseAdmin().from("invoices").select("id").in("id", pendingInvoiceIds).eq("status", "paid"),
      supabaseAdmin().from("invoice_installments").select("invoice_id").in("invoice_id", pendingInvoiceIds).eq("status", "paid"),
    ]);
    for (const r of paidInv ?? []) paidPending.add(r.id as string);
    for (const r of paidInst ?? []) paidPending.add(r.invoice_id as string);
  }
  const conflicted = (r: Row) => r.status === "pending_payment" && !!r.invoice_id && paidPending.has(r.invoice_id);
  const live = (r: Row) => r.status === "confirmed" || (r.status === "pending_payment" && new Date(r.hold_expires_at).getTime() > now);
  const upcoming = rows.filter((r) => (live(r) || conflicted(r)) && new Date(r.starts_at).getTime() >= now);
  const other = rows.filter((r) => !upcoming.includes(r) && r.contacts).reverse().slice(0, 30);

  const table = (list: Row[], showCancel: boolean) => (
    <table>
      <thead>
        <tr>
          <th>When</th>
          <th>Session</th>
          <th>Client</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.id}>
            <td>{formatSessionWhen(new Date(r.starts_at), r.timezone)}</td>
            <td>{r.session_types?.name ?? "—"}</td>
            <td>
              {r.project_id ? <Link href={`/admin/projects/${r.project_id}`}>{r.contacts?.name ?? "—"}</Link> : r.contacts?.name ?? "—"}
            </td>
            <td>
              {conflicted(r) ? (
                <span className="st red">Paid, but the time was taken</span>
              ) : r.status === "pending_payment" ? (
                live(r) ? (
                  <span className="st amber">Held, awaiting payment</span>
                ) : (
                  <span className="st grey">Hold expired</span>
                )
              ) : r.status === "confirmed" ? (
                <span className="st green">Booked</span>
              ) : (
                <span className="st grey">Canceled</span>
              )}
              {r.invoice_id && (
                <>
                  {" · "}
                  <Link href={`/admin/invoices/${r.invoice_id}`}>invoice</Link>
                </>
              )}
            </td>
            <td>
              {showCancel && r.status !== "canceled" && (
                <form action={cancelBooking.bind(null, r.id)}>
                  <ConfirmButton message="Cancel this booking? The time opens up again. Refund any payment in Stripe yourself.">
                    Cancel
                  </ConfirmButton>
                </form>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <main>
      <h1>Bookings</h1>
      <p>
        Public booking page: <Link href="/book">/book</Link>
      </p>
      <h2>Upcoming</h2>
      {upcoming.length === 0 ? <p>No upcoming bookings.</p> : table(upcoming, true)}
      <h2>Past, expired and canceled</h2>
      {other.length === 0 ? <p>Nothing yet.</p> : table(other, false)}
    </main>
  );
}
