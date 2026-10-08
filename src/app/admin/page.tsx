import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const sections = [
  { href: "/admin/contacts", name: "Contacts", note: "Leads and clients" },
  { href: "/admin/projects", name: "Projects", note: "Kanban board and list" },
  { href: "/admin/invoices", name: "Invoices", note: "Build and track" },
  { href: "/admin/galleries", name: "Galleries", note: "Client photo delivery" },
  { href: "/admin/session-types", name: "Session types", note: "What clients can book" },
  { href: "/admin/availability", name: "Availability", note: "Hours and booking rules" },
  { href: "/admin/contracts/templates", name: "Contract templates", note: "Smart-field contracts" },
  { href: "/admin/questionnaires/templates", name: "Questionnaires", note: "Intake forms" },
  { href: "/admin/store", name: "Store", note: "Products and prints" },
  { href: "/admin/emails", name: "Emails", note: "Templates and send log" },
];

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

      <h2>Everything</h2>
      <div className="cards">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="card">
            <div style={{ fontWeight: 650 }}>{s.name}</div>
            <div className="d">{s.note}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
