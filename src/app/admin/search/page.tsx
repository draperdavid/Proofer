import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { Avatar, shortDate } from "../_components/ui";

export const dynamic = "force-dynamic";

// PostgREST's .or() filter syntax treats "," and "()" as structural, so strip them.
function sanitize(term: string): string {
  return term.replace(/[,()]/g, "").trim().slice(0, 80);
}

type Contact = { id: string; name: string; email: string | null; kind: string };
type Project = { id: string; title: string; event_date: string | null };
type Gallery = { id: string; name: string; event_date: string | null };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const term = q ? sanitize(q) : "";

  let contacts: Contact[] = [];
  let projects: Project[] = [];
  let galleries: Gallery[] = [];

  if (term.length >= 2) {
    const db = supabaseAdmin();
    const [c, p, g] = await Promise.all([
      db
        .from("contacts")
        .select("id, name, email, kind")
        .or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
        .order("name")
        .limit(8),
      db
        .from("projects")
        .select("id, title, event_date")
        .or(`title.ilike.%${term}%,location.ilike.%${term}%`)
        .order("created_at", { ascending: false })
        .limit(8),
      db.from("collections").select("id, name, event_date").ilike("name", `%${term}%`).order("created_at", { ascending: false }).limit(8),
    ]);
    if (c.error) throw c.error;
    if (p.error) throw p.error;
    if (g.error) throw g.error;
    contacts = (c.data ?? []) as Contact[];
    projects = (p.data ?? []) as Project[];
    galleries = (g.data ?? []) as Gallery[];
  }

  const total = contacts.length + projects.length + galleries.length;

  return (
    <main>
      <div className="pagehead">
        <h1>Search</h1>
      </div>

      {term.length < 2 ? (
        <p className="muted">Type at least two letters in the search box above.</p>
      ) : total === 0 ? (
        <p className="muted">Nothing found for &ldquo;{term}&rdquo;.</p>
      ) : (
        <>
          {contacts.length > 0 && (
            <>
              <h2>Contacts</h2>
              <ul className="results">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <Avatar name={c.name} />
                    <Link href={`/admin/contacts/${c.id}`}>{c.name}</Link>
                    <span className="muted">{c.email ?? ""}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {projects.length > 0 && (
            <>
              <h2>Projects</h2>
              <ul className="results">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/admin/projects/${p.id}`}>{p.title}</Link>
                    <span className="muted">{p.event_date ? shortDate(p.event_date) : ""}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {galleries.length > 0 && (
            <>
              <h2>Galleries</h2>
              <ul className="results">
                {galleries.map((g) => (
                  <li key={g.id}>
                    <Link href={`/admin/galleries/${g.id}`}>{g.name}</Link>
                    <span className="muted">{g.event_date ? shortDate(g.event_date) : ""}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}
