// Public gallery page — no auth middleware. Access is decided server-side by
// resolveGalleryAccess (draft → 404, public → open, password → unlock cookie,
// private → closed for now). Once granted: sets as tabs, photo grid, lightbox,
// and downloads (Phase 5.4).
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { presignGet, r2Configured } from "@/lib/r2";
import { resolveGalleryAccess } from "@/lib/galleries/viewer-access";
import { GRID_SIZE, LIGHTBOX_SIZE, displayKey } from "@/lib/galleries/variants";
import { unlockGallery } from "./actions";
import { GalleryGrid, type GridPhoto } from "./gallery-grid";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  wrong: "That password isn't right.",
  limited: "Too many attempts. Please wait a few minutes and try again.",
  unavailable: "This gallery can't be unlocked right now. Please contact your photographer.",
};

export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; set?: string }>;
}) {
  const { slug } = await params;
  const { error, set: setParam } = await searchParams;

  const result = await resolveGalleryAccess(slug);
  if (!result) notFound();
  const { collection, access } = result;

  if (access === "private") {
    return (
      <main>
        <h1>{collection.name}</h1>
        <p>This gallery is private. Please contact your photographer for access.</p>
      </main>
    );
  }

  if (access === "needs_password") {
    const unlock = unlockGallery.bind(null, collection.slug);
    return (
      <main>
        <h1>{collection.name}</h1>
        <p>This gallery is password protected.</p>
        {error && ERRORS[error] && <p role="alert">{ERRORS[error]}</p>}
        <form action={unlock}>
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <button type="submit">View gallery</button>
        </form>
      </main>
    );
  }

  // Granted. Only uploaded photos are shown. Sets are tabs via ?set=, so only
  // the open set's photos get URLs signed.
  const db = supabaseAdmin();
  const [setsRes, assetsRes] = await Promise.all([
    db.from("photo_sets").select("id, name").eq("collection_id", collection.id).order("position"),
    db
      .from("media_assets")
      .select("id, collection_id, set_id, r2_key, variants, variants_ready")
      .eq("collection_id", collection.id)
      .eq("status", "uploaded")
      .order("position"),
  ]);
  if (setsRes.error) throw setsRes.error;
  if (assetsRes.error) throw assetsRes.error;
  const sets = setsRes.data ?? [];
  const assets = assetsRes.data ?? [];

  const activeSet = sets.find((s) => s.id === setParam) ?? sets[0];
  const setAssets = activeSet ? assets.filter((a) => a.set_id === activeSet.id) : [];

  // Presigned GETs are local signing, no request to R2 per photo. The grid
  // uses the 640 variant, the lightbox 2048 (original until variants exist).
  let photos: GridPhoto[] = [];
  if (r2Configured()) {
    photos = await Promise.all(
      setAssets.map(async (a, i) => ({
        id: a.id,
        label: `Photo ${i + 1}`,
        gridUrl: await presignGet(displayKey(a, GRID_SIZE)),
        largeUrl: await presignGet(displayKey(a, LIGHTBOX_SIZE)),
        downloadHref: `/g/${collection.slug}/download/${a.id}`,
      }))
    );
  }

  return (
    <main>
      <h1>{collection.name}</h1>
      {collection.event_date && <p>{collection.event_date}</p>}
      {sets.length > 1 && (
        <nav aria-label="Sets" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {sets.map((set) =>
            set.id === activeSet?.id ? (
              <strong key={set.id} aria-current="page">
                {set.name}
              </strong>
            ) : (
              <Link key={set.id} href={`/g/${collection.slug}?set=${set.id}`}>
                {set.name}
              </Link>
            )
          )}
        </nav>
      )}
      {setAssets.length > 0 && !r2Configured() ? (
        <p>Photos aren&apos;t available right now. Please try again later.</p>
      ) : (
        <GalleryGrid key={activeSet?.id} photos={photos} />
      )}
    </main>
  );
}
