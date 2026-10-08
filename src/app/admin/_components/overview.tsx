// The at-a-glance numbers and lists shown on the main (Projects) page: a slim
// strip of counts above the board, and four short lists below it.
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { formatDay, todayISO } from "@/lib/dates";
import { one } from "./ui";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
// For timestamps (created_at). Date-only values go through formatDay instead.
const stamp = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

type Named = { name: string } | { name: string }[] | null;

export async function loadOverview() {
  const db = supabaseAdmin();
  const today = todayISO();
  const [leads, projects, sent, galleries, upcoming, inquiries, unpaid, activity] = await Promise.all([
    db.from("contacts").select("id", { count: "exact", head: true }).eq("kind", "lead"),
    db.from("projects").select("id", { count: "exact", head: true }).eq("archived", false),
    db.from("invoices").select("id", { count: "exact", head: true }).eq("status", "sent"),
    db.from("collections").select("id", { count: "exact", head: true }).eq("status", "published"),
    db.from("projects").select("id, title, event_date, contacts(name)").eq("archived", false).gte("event_date", today).order("event_date").limit(5),
    db.from("contacts").select("id, name, source, created_at").eq("kind", "lead").order("created_at", { ascending: false }).limit(5),
    db.from("invoices").select("id, total_cents, due_date, contacts(name)").eq("status", "sent").order("due_date", { nullsFirst: false }).limit(5),
    db.from("favorites").select("visitor_email, created_at, collection_id, collections(name)").order("created_at", { ascending: false }).limit(5),
  ]);

  return {
    stats: [
      { k: "Leads", v: leads.count ?? 0, href: "/admin/contacts" },
      { k: "Active projects", v: projects.count ?? 0, href: "/admin" },
      { k: "Awaiting payment", v: sent.count ?? 0, href: "/admin/invoices" },
      { k: "Published galleries", v: galleries.count ?? 0, href: "/admin/galleries" },
    ],
    upcoming: upcoming.data ?? [],
    inquiries: inquiries.data ?? [],
    unpaid: unpaid.data ?? [],
    activity: activity.data ?? [],
  };
}

export type Overview = Awaited<ReturnType<typeof loadOverview>>;

export function StatStrip({ overview }: { overview: Overview }) {
  return (
    <div className="statstrip">
      {overview.stats.map((s) => (
        <Link key={s.k} href={s.href} className="stat">
          <span className="k">{s.k}</span>
          <span className="v">{s.v}</span>
        </Link>
      ))}
    </div>
  );
}

export function OverviewWidgets({ overview }: { overview: Overview }) {
  const { upcoming, inquiries, unpaid, activity } = overview;
  return (
    <>
      <h2>At a glance</h2>
      <div className="widgets">
        <section className="card">
          <h3>Upcoming sessions</h3>
          <ul className="wlist">
            {upcoming.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/projects/${p.id}`}>{p.title}</Link>
                <span className="muted">
                  {one(p.contacts as Named)?.name ?? ""} · {formatDay(p.event_date, false)}
                </span>
              </li>
            ))}
            {upcoming.length === 0 && <li className="muted">Nothing scheduled.</li>}
          </ul>
        </section>

        <section className="card">
          <h3>Recent inquiries</h3>
          <ul className="wlist">
            {inquiries.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/contacts/${c.id}`}>{c.name}</Link>
                <span className="muted">
                  {c.source ? `${c.source} · ` : ""}
                  {stamp(c.created_at)}
                </span>
              </li>
            ))}
            {inquiries.length === 0 && <li className="muted">No leads yet.</li>}
          </ul>
        </section>

        <section className="card">
          <h3>Awaiting payment</h3>
          <ul className="wlist">
            {unpaid.map((i) => (
              <li key={i.id}>
                <Link href={`/admin/invoices/${i.id}`}>{one(i.contacts as Named)?.name ?? "Invoice"}</Link>
                <span className="muted">
                  {money(i.total_cents)}
                  {i.due_date ? ` · due ${formatDay(i.due_date, false)}` : ""}
                </span>
              </li>
            ))}
            {unpaid.length === 0 && <li className="muted">All paid up.</li>}
          </ul>
        </section>

        <section className="card">
          <h3>Gallery activity</h3>
          <ul className="wlist">
            {activity.map((a, n) => (
              <li key={n}>
                <Link href={`/admin/galleries/${a.collection_id}`}>{one(a.collections as Named)?.name ?? "Gallery"}</Link>
                <span className="muted">
                  {a.visitor_email} favorited a photo · {stamp(a.created_at)}
                </span>
              </li>
            ))}
            {activity.length === 0 && <li className="muted">No favorites yet.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
