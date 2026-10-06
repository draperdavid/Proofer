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
  updateCollectionAccess,
  updateCollectionLink,
} from "../actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/galleries/access";
import { accessSecret } from "@/lib/galleries/viewer-access";
import { CollectionFields } from "../collection-fields";
import { Uploader } from "../uploader";
import type { Collection, MediaAsset, PhotoSet } from "../types";
import { ConfirmButton } from "@/app/admin/_components/confirm-button";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const db = supabaseAdmin();
  const [collectionRes, setsRes, assetsRes, contactsRes, projectsRes, favsRes] = await Promise.all([
    db.from("collections").select("*").eq("id", id).single(),
    db.from("photo_sets").select("*").eq("collection_id", id).order("position"),
    db.from("media_assets").select("*").eq("collection_id", id).order("position"),
    db.from("contacts").select("id, name, email").order("name"),
    db.from("projects").select("id, title, contact_id").eq("archived", false).order("created_at", { ascending: false }),
    db.from("favorites").select("asset_id, visitor_email, created_at").eq("collection_id", id).order("created_at"),
  ]);
  if (collectionRes.error || !collectionRes.data) notFound();
  if (setsRes.error) throw setsRes.error;
  if (assetsRes.error) throw assetsRes.error;
  if (contactsRes.error) throw contactsRes.error;
  if (projectsRes.error) throw projectsRes.error;
  if (favsRes.error) throw favsRes.error;

  const collection = collectionRes.data as Collection;
  const sets = (setsRes.data ?? []) as PhotoSet[];
  const assets = (assetsRes.data ?? []) as MediaAsset[];
  const contacts = (contactsRes.data ?? []) as { id: string; name: string; email: string | null }[];
  const projects = (projectsRes.data ?? []) as { id: string; title: string; contact_id: string | null }[];
  // The linked project may be archived; keep it selectable so saving the
  // form doesn't silently unlink it.
  if (collection.project_id && !projects.some((p) => p.id === collection.project_id)) {
    const { data } = await db
      .from("projects")
      .select("id, title, contact_id")
      .eq("id", collection.project_id)
      .maybeSingle();
    if (data) projects.unshift({ ...data, title: `${data.title} (archived)` });
  }

  // Favorites grouped by the visitor's email, labelled with the contact who
  // has that email (if any). The email is self-reported, not verified.
  const contactByEmail = new Map(
    contacts.filter((c) => c.email).map((c) => [c.email!.trim().toLowerCase(), c] as const)
  );
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const favoritesByVisitor = new Map<string, MediaAsset[]>();
  for (const f of favsRes.data ?? []) {
    const asset = assetById.get(f.asset_id);
    if (!asset) continue;
    favoritesByVisitor.set(f.visitor_email, [...(favoritesByVisitor.get(f.visitor_email) ?? []), asset]);
  }
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
  const updateAccess = updateCollectionAccess.bind(null, collection.id);
  const updateLink = updateCollectionLink.bind(null, collection.id);
  const accessSecretSet = accessSecret() !== null;
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

      <h2>Client</h2>
      <form action={updateLink}>
        <div>
          <label htmlFor="contact_id">Contact</label>
          <select id="contact_id" name="contact_id" defaultValue={collection.contact_id ?? ""}>
            <option value="">None</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.email ? ` (${c.email})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="project_id">Project</label>
          <select id="project_id" name="project_id" defaultValue={collection.project_id ?? ""}>
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Save client link</button>
      </form>
      <p style={{ fontSize: "0.8rem" }}>
        {collection.project_id && <Link href={`/admin/projects/${collection.project_id}`}>Open project</Link>}
        {collection.project_id && collection.contact_id && " · "}
        {collection.contact_id && <Link href={`/admin/contacts/${collection.contact_id}`}>Open contact</Link>}
        {!collection.project_id && !collection.contact_id && "Picking only a project also links its contact."}
      </p>

      <h2>Access</h2>
      <p>
        Client link: <Link href={`/g/${collection.slug}`}>/g/{collection.slug}</Link>
        {collection.status === "draft" && " (not viewable until published)"}
      </p>
      <form action={updateAccess}>
        <div>
          <label htmlFor="visibility">Visibility</label>
          <select id="visibility" name="visibility" defaultValue={collection.visibility}>
            <option value="public">Public: anyone with the link</option>
            <option value="password">Password: anyone with the link and password</option>
            <option value="private">Private: closed to everyone for now</option>
          </select>
        </div>
        <div>
          <label htmlFor="password">
            Gallery password ({collection.password_hash ? "set; blank keeps it" : "not set"}, min{" "}
            {MIN_PASSWORD_LENGTH} characters)
          </label>
          <input id="password" name="password" type="password" autoComplete="new-password" />
        </div>
        <button type="submit">Save access</button>
      </form>
      {collection.visibility === "private" && (
        <p>Private galleries can&apos;t be opened by clients until client sign-in for galleries is set up.</p>
      )}
      {collection.visibility === "password" && !accessSecretSet && (
        <p role="alert">
          Clients can&apos;t unlock password galleries yet: GALLERY_ACCESS_SECRET isn&apos;t set on this environment.
        </p>
      )}
      <p style={{ fontSize: "0.8rem" }}>Changing visibility or the password signs every visitor out.</p>

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

      <h2>Favorites</h2>
      {favoritesByVisitor.size === 0 && <p>No favorites yet.</p>}
      {[...favoritesByVisitor].map(([email, picks]) => {
        const contact = contactByEmail.get(email);
        return (
          <section key={email}>
            <h3>
              {contact ? <Link href={`/admin/contacts/${contact.id}`}>{contact.name}</Link> : email}
              {contact && ` (${email})`} · {picks.length} favorite{picks.length === 1 ? "" : "s"}
            </h3>
            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {picks.map((asset) => {
                const thumb = thumbs.get(asset.id);
                return (
                  <li key={asset.id} style={{ width: "6rem", fontSize: "0.7rem", wordBreak: "break-all" }}>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={asset.original_filename}
                        loading="lazy"
                        style={{ width: "6rem", height: "6rem", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{ width: "6rem", height: "6rem", background: "#eee" }} />
                    )}
                    {asset.original_filename}
                  </li>
                );
              })}
            </ul>
            <details>
              <summary>Filenames to copy</summary>
              <textarea
                readOnly
                rows={3}
                style={{ width: "100%" }}
                defaultValue={picks.map((a) => a.original_filename).join(", ")}
              />
            </details>
          </section>
        );
      })}
      <p style={{ fontSize: "0.8rem" }}>
        Clients name themselves by email when they favorite; the email isn&apos;t verified.
      </p>

      <h2>Danger zone</h2>
      <form action={deleteThis}>
        <ConfirmButton message="Delete this gallery and every photo in it? This can't be undone.">Delete collection and all its photos</ConfirmButton>
      </form>
    </main>
  );
}
