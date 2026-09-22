import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Contact } from "./types";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; tag?: string; kind?: string };

// PostgREST's .or() filter syntax treats "," and "()" as structural, so strip
// them from user input rather than letting a search term reshape the filter.
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()]/g, "").trim();
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q, tag, kind } = await searchParams;

  const db = supabaseAdmin();
  let query = db.from("contacts").select("*").order("created_at", { ascending: false });

  const term = q ? sanitizeSearchTerm(q) : "";
  if (term) {
    query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  if (kind === "lead" || kind === "client") {
    query = query.eq("kind", kind);
  }
  if (tag) {
    query = query.contains("tags", [tag]);
  }

  const { data, error } = await query;
  if (error) throw error;
  const contacts = (data ?? []) as Contact[];
  const hasFilters = Boolean(q || kind || tag);

  return (
    <main>
      <h1>Contacts</h1>
      <p>
        <Link href="/admin">Back to admin</Link>
      </p>

      <form>
        <input type="text" name="q" placeholder="Search name, email, phone" defaultValue={q ?? ""} />
        <select name="kind" defaultValue={kind ?? ""}>
          <option value="">All kinds</option>
          <option value="lead">Lead</option>
          <option value="client">Client</option>
        </select>
        <input type="text" name="tag" placeholder="Filter by tag" defaultValue={tag ?? ""} />
        <button type="submit">Filter</button>
        {hasFilters && <Link href="/admin/contacts">Clear</Link>}
      </form>

      <p>
        <Link href="/admin/contacts/new">+ New contact</Link>
      </p>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Kind</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id}>
              <td>
                <Link href={`/admin/contacts/${c.id}`}>{c.name}</Link>
              </td>
              <td>{c.kind}</td>
              <td>{c.email ?? "—"}</td>
              <td>{c.phone ?? "—"}</td>
              <td>{c.tags.length > 0 ? c.tags.join(", ") : "—"}</td>
            </tr>
          ))}
          {contacts.length === 0 && (
            <tr>
              <td colSpan={5}>No contacts found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
