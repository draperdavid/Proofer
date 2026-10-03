import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Collection } from "./types";

export const dynamic = "force-dynamic";

export default async function GalleriesPage() {
  const db = supabaseAdmin();
  const { data, error } = await db.from("collections").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const collections = (data ?? []) as Collection[];

  return (
    <main>
      <h1>Galleries</h1>
      <p>
        <Link href="/admin">Back to admin</Link>
      </p>
      <p>
        <Link href="/admin/galleries/new">+ New collection</Link>
      </p>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Event date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {collections.map((c) => (
            <tr key={c.id}>
              <td>
                <Link href={`/admin/galleries/${c.id}`}>{c.name}</Link>
              </td>
              <td>{c.slug}</td>
              <td>{c.event_date ?? "—"}</td>
              <td>{c.status === "published" ? "Published" : "Draft"}</td>
            </tr>
          ))}
          {collections.length === 0 && (
            <tr>
              <td colSpan={4}>No collections yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
