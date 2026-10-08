import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { formatDay } from "@/lib/dates";

export const dynamic = "force-dynamic";

// A many-to-one embed comes back as an object (or occasionally a one-item array).
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default async function AdminHome() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const db = supabaseAdmin();
  const [leads, projects, sent, galleries] = await Promise.all([
    db.from("contacts").select("id", { count: "exact", head: true }).eq("kind", "lead"),
    db.from("projects").select("id", { count: "exact", head: true }).eq("archived", false),
    db.from("invoices").select("id", { count: "exact", head: true }).eq("status", "sent"),
    db.from("collections").select("id", { count: "exact", head: true }).eq("status", "published"),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const [upcoming, inquiries, unpaid, activity] = await Promise.all([
    db.from("projects").select("id, title, event_date, contacts(name)").eq("archived", false).gte("event_date", today).order("event_date").limit(5),
    db.from("contacts").select("id, name, source, created_at").eq("kind", "lead").order("created_at", { ascending: false }).limit(5),
    db.from("invoices").select("id, total_cents, due_date, contacts(name)").eq("status", "sent").order("due_date", { nullsFirst: false }).limit(5),
    db.from("favorites").select("visitor_email, created_at, collection_id, collections(name)").order("created_at", { ascending: false }).limit(5),
  ]);

  const stats = [
    { k: "Leads", v: leads.count ?? 0, href: "/admin/contacts" },
    { k: "Active projects", v: projects.count ?? 0, href: "/admin/projects" },
    { k: "Invoices awaiting payment", v: sent.count ?? 0, href: "/admin/invoices" },
    { k: "Published galleries", v: galleries.count ?? 0, href: "/admin/galleries" },
  ];

  return (
    <main>
      <div className="pagehead">
        <h1>Home</h1>
      </div>

      <div className="cards">
        {stats.map((s) => (
          <Link key={s.k} href={s.href} className="card">
            <div className="k">{s.k}</div>
            <div className="v">{s.v}</div>
          </Link>
        ))}
      </div>

      <div className="widgets">
        <section className="card">
          <h3>Upcoming sessions</h3>
          <ul className="wlist">
            {(upcoming.data ?? []).map((p) => (
              <li key={p.id}>
                <Link href={`/admin/projects/${p.id}`}>{p.title}</Link>
                <span className="muted">
                  {one(p.contacts as { name: string } | { name: string }[] | null)?.name ?? ""} · {formatDay(p.event_date, false)}
                </span>
              </li>
            ))}
            {(upcoming.data ?? []).length === 0 && <li className="muted">Nothing scheduled.</li>}
          </ul>
        </section>

        <section className="card">
          <h3>Recent inquiries</h3>
          <ul className="wlist">
            {(inquiries.data ?? []).map((c) => (
              <li key={c.id}>
                <Link href={`/admin/contacts/${c.id}`}>{c.name}</Link>
                <span className="muted">
                  {c.source ? `${c.source} · ` : ""}
                  {shortDate(c.created_at)}
                </span>
              </li>
            ))}
            {(inquiries.data ?? []).length === 0 && <li className="muted">No leads yet.</li>}
          </ul>
        </section>

        <section className="card">
          <h3>Awaiting payment</h3>
          <ul className="wlist">
            {(unpaid.data ?? []).map((i) => (
              <li key={i.id}>
                <Link href={`/admin/invoices/${i.id}`}>{one(i.contacts as { name: string } | { name: string }[] | null)?.name ?? "Invoice"}</Link>
                <span className="muted">
                  {money(i.total_cents)}
                  {i.due_date ? ` · due ${formatDay(i.due_date, false)}` : ""}
                </span>
              </li>
            ))}
            {(unpaid.data ?? []).length === 0 && <li className="muted">All paid up.</li>}
          </ul>
        </section>

        <section className="card">
          <h3>Gallery activity</h3>
          <ul className="wlist">
            {(activity.data ?? []).map((a, n) => (
              <li key={n}>
                <Link href={`/admin/galleries/${a.collection_id}`}>
                  {one(a.collections as { name: string } | { name: string }[] | null)?.name ?? "Gallery"}
                </Link>
                <span className="muted">
                  {a.visitor_email} favorited a photo · {shortDate(a.created_at)}
                </span>
              </li>
            ))}
            {(activity.data ?? []).length === 0 && <li className="muted">No favorites yet.</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}
