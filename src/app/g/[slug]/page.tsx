// Public gallery page — no auth middleware. Access is decided server-side by
// resolveGalleryAccess (draft → 404, public → open, password → unlock cookie,
// private → closed for now). Once granted: sets as tabs, photo grid, lightbox,
// and downloads (Phase 5.4), plus favorites under a visitor email (5.6).
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { presignGet, r2Configured } from "@/lib/r2";
import { resolveGalleryAccess, resolveVisitorEmail } from "@/lib/galleries/viewer-access";
import { GRID_SIZE, LIGHTBOX_SIZE, displayKey } from "@/lib/galleries/variants";
import { clearFavoritesEmail, setFavoritesEmail, toggleFavorite, unlockGallery } from "./actions";
import { GalleryGrid, type GridPhoto } from "./gallery-grid";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  wrong: "That password isn't right.",
  limited: "Too many attempts. Please wait a few minutes and try again.",
  unavailable: "This gallery can't be unlocked right now. Please contact your photographer.",
};

const FAV_ERRORS: Record<string, string> = {
  "bad-email": "Please enter a valid email address.",
  limited: "Too many attempts. Please wait a few minutes and try again.",
  unavailable: "Favorites aren't available right now.",
};

const FAVORITES_TAB = "favorites";

export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; set?: string; fav?: string }>;
}) {
  const { slug } = await params;
  const { error, set: setParam, fav } = await searchParams;

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
  // the open set's photos get URLs signed. ?set=favorites shows the visitor's
  // picks across every set.
  const db = supabaseAdmin();
  const visitorEmail = await resolveVisitorEmail(collection.id);
  const [setsRes, assetsRes, favsRes] = await Promise.all([
    db.from("photo_sets").select("id, name").eq("collection_id", collection.id).order("position"),
    db
      .from("media_assets")
      .select("id, collection_id, set_id, r2_key, variants, variants_ready")
      .eq("collection_id", collection.id)
      .eq("status", "uploaded")
      .order("position"),
    visitorEmail
      ? db.from("favorites").select("asset_id").eq("collection_id", collection.id).eq("visitor_email", visitorEmail)
      : Promise.resolve({ data: [] as { asset_id: string }[], error: null }),
  ]);
  if (setsRes.error) throw setsRes.error;
  if (assetsRes.error) throw assetsRes.error;
  if (favsRes.error) throw favsRes.error;
  const sets = setsRes.data ?? [];
  const assets = assetsRes.data ?? [];
  const favoriteIds = new Set((favsRes.data ?? []).map((f) => f.asset_id));

  const showFavorites = setParam === FAVORITES_TAB && visitorEmail !== null;
  const activeSet = showFavorites ? undefined : (sets.find((s) => s.id === setParam) ?? sets[0]);
  const activeTab = showFavorites ? FAVORITES_TAB : (activeSet?.id ?? "");
  const setAssets = showFavorites
    ? assets.filter((a) => favoriteIds.has(a.id))
    : activeSet
      ? assets.filter((a) => a.set_id === activeSet.id)
      : [];

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
        favorited: favoriteIds.has(a.id),
      }))
    );
  }

  const saveEmail = setFavoritesEmail.bind(null, collection.slug, activeTab);
  const forgetEmail = clearFavoritesEmail.bind(null, collection.slug);
  const toggle = toggleFavorite.bind(null, collection.slug);

  return (
    <main>
      <h1>{collection.name}</h1>
      {collection.event_date && <p>{collection.event_date}</p>}

      {visitorEmail ? (
        <form action={forgetEmail} style={{ fontSize: "0.85rem" }}>
          Saving favorites as <strong>{visitorEmail}</strong> <button type="submit">Not you?</button>
        </form>
      ) : (
        <form action={saveEmail} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <label htmlFor="fav-email">Enter your email to save favorites</label>
          <input id="fav-email" name="email" type="email" autoComplete="email" required />
          <button type="submit">Start favoriting</button>
        </form>
      )}
      {fav && FAV_ERRORS[fav] && <p role="alert">{FAV_ERRORS[fav]}</p>}

      {(sets.length > 1 || visitorEmail) && (
        <nav aria-label="Sets" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", margin: "1rem 0" }}>
          {sets.map((set) =>
            set.id === activeTab ? (
              <strong key={set.id} aria-current="page">
                {set.name}
              </strong>
            ) : (
              <Link key={set.id} href={`/g/${collection.slug}?set=${set.id}`}>
                {set.name}
              </Link>
            )
          )}
          {visitorEmail &&
            (showFavorites ? (
              <strong aria-current="page">Favorites ({favoriteIds.size})</strong>
            ) : (
              <Link href={`/g/${collection.slug}?set=${FAVORITES_TAB}`}>Favorites ({favoriteIds.size})</Link>
            ))}
        </nav>
      )}
      {setAssets.length > 0 && !r2Configured() ? (
        <p>Photos aren&apos;t available right now. Please try again later.</p>
      ) : (
        <GalleryGrid
          key={activeTab}
          photos={photos}
          toggleFavorite={visitorEmail ? toggle : null}
          emptyText={showFavorites ? "No favorites yet. Tap the heart on a photo to add it." : undefined}
        />
      )}
    </main>
  );
}
