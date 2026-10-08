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
  setCover,
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
import { ClientLink } from "@/app/admin/_components/client-link";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export default async function CollectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; set?: string; section?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam, set: setParam, section: sectionParam } = await searchParams;

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
  // The cover is the chosen photo, else the first uploaded one (same rule as the Galleries list and client page).
  const coverId = collection.cover_asset_id ?? assets.find((a) => a.status === "uploaded")?.id ?? null;

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

  // ---- editor layout (Pixieset-style): top bar, left panel (cover + tabs), main area ----
  const tab = tabParam === "settings" || tabParam === "activity" ? tabParam : "photos";
  const section = sectionParam === "privacy" ? "privacy" : "general";
  const activeSet = sets.find((s) => s.id === setParam) ?? sets[0];
  const base = `/admin/galleries/${collection.id}`;
  const coverThumb = coverId ? thumbs.get(coverId) : undefined;
  const published = collection.status === "published";
  const dateLabel = collection.event_date ?? "No date";
  const uploadedCount = assets.filter((a) => a.status === "uploaded").length;

  const activeAssets = activeSet ? assets.filter((a) => a.set_id === activeSet.id) : [];
  const activeIndex = activeSet ? sets.findIndex((s) => s.id === activeSet.id) : -1;

  return (
    <main className="editor">
      <header className="ed-top">
        <Link href="/admin/galleries" className="ed-back" aria-label="Back to galleries">
          ←
        </Link>
        <div className="ed-title">
          <strong>{collection.name}</strong>
          <span>{dateLabel}</span>
        </div>

        <details className="menu">
          <summary className="menu-btn" aria-label="Change status">
            <span className={`st ${published ? "green" : "grey"}`}>{published ? "Published" : "Draft"}</span>
            <span className="caret">▾</span>
          </summary>
          <div className="menu-pop">
            <form action={toggleStatus}>
              <button type="submit">{published ? "Unpublish (back to draft)" : "Publish"}</button>
            </form>
          </div>
        </details>

        <div className="ed-actions">
          <Link
            href={`/g/${collection.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            title={published ? "Open the client gallery" : "Draft galleries aren't visible to clients yet"}
          >
            Preview
          </Link>

          <details className="menu">
            <summary className="btn primary">Share ▾</summary>
            <div className="menu-pop wide">
              <p className="hint" style={{ margin: "0 0 6px" }}>
                Client link
              </p>
              <ClientLink path={`/g/${collection.slug}`} />
              {!published && <p className="hint">Not viewable until published.</p>}
              {published && collection.visibility === "private" && (
                <p className="hint">Private: closed to everyone for now. Change this under Settings, Privacy.</p>
              )}
            </div>
          </details>

          <details className="menu">
            <summary className="btn">More ▾</summary>
            <div className="menu-pop">
              <form action={deleteThis}>
                <ConfirmButton message="Delete this gallery and every photo in it? This can't be undone.">
                  Delete collection
                </ConfirmButton>
              </form>
            </div>
          </details>
        </div>
      </header>

      <div className="ed-body">
        <aside className="ed-side">
          {coverThumb ? <img className="ed-cover" src={coverThumb} alt="" /> : <div className="ed-cover ph">No cover yet</div>}

          <nav className="ed-tabs" aria-label="Gallery sections">
            <Link href={`${base}?tab=photos`} className={tab === "photos" ? "on" : undefined}>
              Photos
            </Link>
            <Link href={`${base}?tab=settings`} className={tab === "settings" ? "on" : undefined}>
              Settings
            </Link>
            <Link href={`${base}?tab=activity`} className={tab === "activity" ? "on" : undefined}>
              Activity
            </Link>
          </nav>

          {tab === "photos" && (
            <div className="ed-sub">
              <div className="ed-subhead">
                <span>Sets</span>
              </div>
              {sets.map((s) => {
                const count = assets.filter((a) => a.set_id === s.id).length;
                return (
                  <Link
                    key={s.id}
                    href={`${base}?tab=photos&set=${s.id}`}
                    className={`ed-set${activeSet?.id === s.id ? " on" : ""}`}
                  >
                    <span>{s.name}</span>
                    <span className="muted">{count}</span>
                  </Link>
                );
              })}
              <form action={addSet} className="ed-addset">
                <input type="text" name="name" placeholder="New set name" required />
                <button type="submit">Add</button>
              </form>
            </div>
          )}

          {tab === "settings" && (
            <div className="ed-sub">
              <Link href={`${base}?tab=settings&section=general`} className={`ed-set${section === "general" ? " on" : ""}`}>
                General
              </Link>
              <Link href={`${base}?tab=settings&section=privacy`} className={`ed-set${section === "privacy" ? " on" : ""}`}>
                <span>Privacy</span>
                <span className="st grey" style={{ textTransform: "capitalize" }}>
                  {collection.visibility}
                </span>
              </Link>
            </div>
          )}

          {tab === "activity" && (
            <div className="ed-sub">
              <span className="ed-set on">Favorites</span>
            </div>
          )}
        </aside>

        <section className="ed-main">
          {tab === "photos" && activeSet && (
            <>
              <div className="ed-maintop">
                <h2>
                  {activeSet.name} <span className="muted">({activeAssets.length})</span>
                </h2>
                <details className="menu">
                  <summary className="btn">Set options ▾</summary>
                  <div className="menu-pop wide">
                    <form action={renameSet.bind(null, activeSet.id, collection.id)} className="row" style={{ marginBottom: 6 }}>
                      <input type="text" name="name" defaultValue={activeSet.name} required />
                      <button type="submit">Rename</button>
                    </form>
                    <form action={moveSet.bind(null, activeSet.id, "up")}>
                      <button type="submit" disabled={activeIndex === 0}>
                        Move set up
                      </button>
                    </form>
                    <form action={moveSet.bind(null, activeSet.id, "down")}>
                      <button type="submit" disabled={activeIndex === sets.length - 1}>
                        Move set down
                      </button>
                    </form>
                    <form action={deleteSet.bind(null, activeSet.id)}>
                      <ConfirmButton message="Delete this set and all its photos? This can't be undone.">
                        Delete set{activeAssets.length > 0 ? " and its photos" : ""}
                      </ConfirmButton>
                    </form>
                  </div>
                </details>
              </div>

              {storageReady ? (
                <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
                  <Uploader
                    collectionId={collection.id}
                    sets={[activeSet, ...sets.filter((s) => s.id !== activeSet.id)].map((s) => ({ id: s.id, name: s.name }))}
                  />
                </div>
              ) : (
                <p role="alert" className="notice">
                  Uploads are disabled: R2 isn&apos;t configured on this environment (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
                  R2_SECRET_ACCESS_KEY, R2_BUCKET).
                </p>
              )}

              <ul className="tiles">
                {activeAssets.map((asset, j) => {
                  const thumb = thumbs.get(asset.id);
                  const isCover = asset.id === coverId;
                  return (
                    <li key={asset.id} className="tile">
                      <div className="tile-img">
                        {thumb ? (
                          <img src={thumb} alt={asset.original_filename} loading="lazy" />
                        ) : (
                          <div className="ph">{asset.status === "pending" ? "Upload didn't finish" : "No preview"}</div>
                        )}
                        {isCover && <span className="pill tile-badge">Cover</span>}
                        <details className="menu tile-menu">
                          <summary aria-label="Photo options">⋮</summary>
                          <div className="menu-pop">
                            {!isCover && asset.status === "uploaded" && (
                              <form action={setCover.bind(null, collection.id, asset.id)}>
                                <button type="submit">Set as cover</button>
                              </form>
                            )}
                            <form action={moveAsset.bind(null, asset.id, "up")}>
                              <button type="submit" disabled={j === 0}>
                                Move earlier
                              </button>
                            </form>
                            <form action={moveAsset.bind(null, asset.id, "down")}>
                              <button type="submit" disabled={j === activeAssets.length - 1}>
                                Move later
                              </button>
                            </form>
                            <form action={deleteAsset.bind(null, asset.id)}>
                              <ConfirmButton message="Delete this photo? This can't be undone.">Delete</ConfirmButton>
                            </form>
                          </div>
                        </details>
                      </div>
                      <div className="name">
                        {asset.original_filename} · {formatBytes(asset.size_bytes)}
                      </div>
                      {asset.status === "uploaded" && !asset.variants_ready && (
                        <div className="hint" title={asset.variant_error ?? undefined}>
                          {asset.variant_attempts >= MAX_VARIANT_ATTEMPTS ? "Sizes failed — see error on hover" : "Sizes processing…"}
                        </div>
                      )}
                    </li>
                  );
                })}
                {activeAssets.length === 0 && <li className="muted">No photos in this set yet.</li>}
              </ul>
            </>
          )}

          {tab === "settings" && section === "general" && (
            <div className="ed-form">
              <h2>General</h2>
              <form action={updateThis}>
                <CollectionFields collection={collection} />
                <button type="submit" className="primary" style={{ marginTop: 12 }}>
                  Save details
                </button>
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
                <button type="submit" style={{ marginTop: 12 }}>
                  Save client link
                </button>
              </form>
              <p className="hint">
                {collection.project_id && <Link href={`/admin/projects/${collection.project_id}`}>Open project</Link>}
                {collection.project_id && collection.contact_id && " · "}
                {collection.contact_id && <Link href={`/admin/contacts/${collection.contact_id}`}>Open contact</Link>}
                {!collection.project_id && !collection.contact_id && "Picking only a project also links its contact."}
              </p>
            </div>
          )}

          {tab === "settings" && section === "privacy" && (
            <div className="ed-form">
              <h2>Privacy</h2>
              <p className="muted">
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
                <button type="submit" className="primary" style={{ marginTop: 12 }}>
                  Save access
                </button>
              </form>
              {collection.visibility === "private" && (
                <p className="notice">
                  Private galleries can&apos;t be opened by clients until client sign-in for galleries is set up.
                </p>
              )}
              {collection.visibility === "password" && !accessSecretSet && (
                <p role="alert" className="notice">
                  Clients can&apos;t unlock password galleries yet: GALLERY_ACCESS_SECRET isn&apos;t set on this environment.
                </p>
              )}
              <p className="hint">Changing visibility or the password signs every visitor out.</p>
            </div>
          )}

          {tab === "activity" && (
            <div className="ed-form wide">
              <h2>Favorites</h2>
              {favoritesByVisitor.size === 0 && <p className="muted">No favorites yet.</p>}
              {[...favoritesByVisitor].map(([email, picks]) => {
                const contact = contactByEmail.get(email);
                return (
                  <section key={email}>
                    <h3>
                      {contact ? <Link href={`/admin/contacts/${contact.id}`}>{contact.name}</Link> : email}
                      {contact && ` (${email})`} · {picks.length} favorite{picks.length === 1 ? "" : "s"}
                    </h3>
                    <ul className="tiles">
                      {picks.map((asset) => {
                        const thumb = thumbs.get(asset.id);
                        return (
                          <li key={asset.id} className="tile">
                            <div className="tile-img">
                              {thumb ? <img src={thumb} alt={asset.original_filename} loading="lazy" /> : <div className="ph" />}
                            </div>
                            <div className="name">{asset.original_filename}</div>
                          </li>
                        );
                      })}
                    </ul>
                    <details>
                      <summary>Filenames to copy</summary>
                      <textarea readOnly rows={3} defaultValue={picks.map((a) => a.original_filename).join(", ")} />
                    </details>
                  </section>
                );
              })}
              <p className="hint">Clients name themselves by email when they favorite; the email isn&apos;t verified.</p>
              <p className="hint">
                {uploadedCount} photo{uploadedCount === 1 ? "" : "s"} in this gallery.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
