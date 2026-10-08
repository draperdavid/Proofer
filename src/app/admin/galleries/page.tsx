import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { presignGet, r2Configured } from "@/lib/r2";
import { GRID_SIZE, displayKey, type Variants } from "@/lib/galleries/variants";
import type { Collection } from "./types";

export const dynamic = "force-dynamic";

type Card = { collection_id: string; photo_count: number; cover_id: string | null };
type CoverAsset = { id: string; collection_id: string; r2_key: string; variants: Variants | null; variants_ready: boolean };

export default async function GalleriesPage() {
  const db = supabaseAdmin();
  const { data, error } = await db.from("collections").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const collections = (data ?? []) as Collection[];

  // Photo counts + cover choice come from the collection_cards view (0019). If
  // that migration hasn't been run yet, the list still works, just without covers.
  const cards = new Map<string, Card>();
  const coverUrls = new Map<string, string>();
  const { data: cardRows, error: cardErr } = await db.from("collection_cards").select("collection_id, photo_count, cover_id");
  if (!cardErr) {
    for (const r of (cardRows ?? []) as Card[]) cards.set(r.collection_id, r);

    const coverIds = [...cards.values()].map((c) => c.cover_id).filter((id): id is string => !!id);
    if (coverIds.length > 0 && r2Configured()) {
      const { data: covers } = await db
        .from("media_assets")
        .select("id, collection_id, r2_key, variants, variants_ready")
        .in("id", coverIds);
      for (const a of (covers ?? []) as CoverAsset[]) {
        coverUrls.set(a.collection_id, await presignGet(displayKey(a, GRID_SIZE)));
      }
    }
  }

  return (
    <main>
      <div className="pagehead">
        <h1>Galleries</h1>
        <Link href="/admin/galleries/new" className="btn primary">
          New gallery
        </Link>
      </div>

      {collections.length === 0 ? (
        <p className="muted">No galleries yet.</p>
      ) : (
        <ul className="gcards">
          {collections.map((c) => {
            const card = cards.get(c.id);
            const cover = coverUrls.get(c.id);
            const count = Number(card?.photo_count ?? 0);
            return (
              <li key={c.id}>
                <Link href={`/admin/galleries/${c.id}`} className="gcard">
                  {cover ? <img src={cover} alt="" loading="lazy" /> : <div className="ph">No photos yet</div>}
                  <div className="meta">
                    <div className="title">{c.name}</div>
                    <div className="sub">
                      {c.event_date ?? "No date"} · {count} photo{count === 1 ? "" : "s"}
                    </div>
                    <span className={`pill${c.status === "published" ? "" : " off"}`}>
                      {c.status === "published" ? "Published" : "Draft"}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
