import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { presignGet, r2Configured } from "@/lib/r2";
import { GRID_SIZE, MAX_VARIANT_ATTEMPTS, displayKey } from "@/lib/galleries/variants";
import {
  createSet,
  deleteAsset,
  deleteCollection,
  deleteSet,
  moveAsset,
  moveSet,
  renameSet,
  setCollectionStatus,
  updateCollection,
} from "../actions";
import { CollectionFields } from "../collection-fields";
import { Uploader } from "../uploader";
import type { Collection, MediaAsset, PhotoSet } from "../types";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const db = supabaseAdmin();
  const [collectionRes, setsRes, assetsRes] = await Promise.all([
    db.from("collections").select("*").eq("id", id).single(),
    db.from("photo_sets").select("*").eq("collection_id", id).order("position"),
    db.from("media_assets").select("*").eq("collection_id", id).order("position"),
  ]);
  if (collectionRes.error || !collectionRes.data) notFound();
  if (setsRes.error) throw setsRes.error;
  if (assetsRes.error) throw assetsRes.error;

  const collection = collectionRes.data as Collection;
  const sets = (setsRes.data ?? []) as PhotoSet[];
  const assets = (assetsRes.data ?? []) as MediaAsset[];
  const storageReady = r2Configured();

  // Thumbnails are short-lived presigned GETs of the 640 variant, or of the
  // original until the variants job has made it. Signing is local crypto, no
  // request to R2 per photo.
  const thumbs = new Map<string, string>();
  if (storageReady) {
    await Promise.all(
      assets
        .filter((a) => a.status === "uploaded")
        .map(async (a) => thumbs.set(a.id, await presignGet(displayKey(a, GRID_SIZE))))
    );
  }

  const updateThis = updateCollection.bind(null, collection.id);
  const toggleStatus = setCollectionStatus.bind(
    null,
    collection.id,
    collection.status === "published" ? "draft" : "published"
  );
  const deleteThis = deleteCollection.bind(null, collection.id);
  const addSet = createSet.bind(null, collection.id);

  return (
    <main>
      <h1>{collection.name}</h1>
      <p>
        <Link href="/admin/galleries">Back to galleries</Link>
      </p>

      <div>
        Status: <strong>{collection.status === "published" ? "Published" : "Draft"}</strong>{" "}
        <form action={toggleStatus} style={{ display: "inline" }}>
          <button type="submit">{collection.status === "published" ? "Unpublish (back to draft)" : "Publish"}</button>
        </form>
      </div>

      <h2>Details</h2>
      <form action={updateThis}>
        <CollectionFields collection={collection} />
        <button type="submit">Save details</button>
      </form>

      <h2>Upload photos</h2>
      {storageReady ? (
        <Uploader collectionId={collection.id} sets={sets.map((s) => ({ id: s.id, name: s.name }))} />
      ) : (
        <p role="alert">
          Uploads are disabled: R2 isn&apos;t configured on this environment (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
          R2_SECRET_ACCESS_KEY, R2_BUCKET).
        </p>
      )}

      <h2>Sets</h2>
      {sets.map((set, i) => {
        const setAssets = assets.filter((a) => a.set_id === set.id);
        const rename = renameSet.bind(null, set.id, collection.id);
        const moveUp = moveSet.bind(null, set.id, "up");
        const moveDown = moveSet.bind(null, set.id, "down");
        const remove = deleteSet.bind(null, set.id);

        return (
          <section key={set.id}>
            <h3>
              {set.name} ({setAssets.length})
            </h3>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <form action={rename} style={{ display: "flex", gap: "0.5rem" }}>
                <input type="text" name="name" defaultValue={set.name} required />
                <button type="submit">Rename</button>
              </form>
              <form action={moveUp}>
                <button type="submit" disabled={i === 0}>
                  ↑
                </button>
              </form>
              <form action={moveDown}>
                <button type="submit" disabled={i === sets.length - 1}>
                  ↓
                </button>
              </form>
              <form action={remove}>
                <button type="submit" disabled={sets.length <= 1}>
                  Delete set{setAssets.length > 0 ? " and its photos" : ""}
                </button>
              </form>
            </div>

            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexWrap: "wrap", gap: "1rem" }}>
              {setAssets.map((asset, j) => {
                const up = moveAsset.bind(null, asset.id, "up");
                const down = moveAsset.bind(null, asset.id, "down");
                const del = deleteAsset.bind(null, asset.id);
                const thumb = thumbs.get(asset.id);

                return (
                  <li key={asset.id} style={{ width: "10rem" }}>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={asset.original_filename}
                        loading="lazy"
                        style={{ width: "10rem", height: "10rem", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{ width: "10rem", height: "10rem", background: "#eee" }}>
                        {asset.status === "pending" ? "Upload didn't finish" : "No preview"}
                      </div>
                    )}
                    <div style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>
                      {asset.original_filename} · {formatBytes(asset.size_bytes)}
                    </div>
                    {asset.status === "uploaded" && !asset.variants_ready && (
                      <div style={{ fontSize: "0.8rem" }} title={asset.variant_error ?? undefined}>
                        {asset.variant_attempts >= MAX_VARIANT_ATTEMPTS
                          ? "Sizes failed — see error on hover"
                          : "Sizes processing…"}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      <form action={up}>
                        <button type="submit" disabled={j === 0}>
                          ←
                        </button>
                      </form>
                      <form action={down}>
                        <button type="submit" disabled={j === setAssets.length - 1}>
                          →
                        </button>
                      </form>
                      <form action={del}>
                        <button type="submit">Delete</button>
                      </form>
                    </div>
                  </li>
                );
              })}
              {setAssets.length === 0 && <li>No photos in this set yet.</li>}
            </ul>
          </section>
        );
      })}

      <h3>Add a set</h3>
      <form action={addSet} style={{ display: "flex", gap: "0.5rem" }}>
        <input type="text" name="name" placeholder="Set name" required />
        <button type="submit">Add set</button>
      </form>

      <h2>Danger zone</h2>
      <form action={deleteThis}>
        <button type="submit">Delete collection and all its photos</button>
      </form>
    </main>
  );
}
