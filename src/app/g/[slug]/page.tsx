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
import { CLAIM_REFUSALS, isClaimRefusal, remainingDownloads } from "@/lib/galleries/download";
import { addToCart, checkoutCart, clearFavoritesEmail, setCartQty, setFavoritesEmail, toggleFavorite, unlockGallery } from "./actions";
import { Shop } from "./shop";
import { pricedCart } from "@/lib/store/cart";
import { loadCatalog, readCart } from "@/lib/store/gallery-store";
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

const DOWNLOAD_NOT_READY = "This photo isn't ready to download yet. Try again in a few minutes.";

const FAVORITES_TAB = "favorites";
const SHOP_TAB = "shop";

export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; set?: string; fav?: string; dl?: string; cart?: string }>;
}) {
  const { slug } = await params;
  const { error, set: setParam, fav, dl, cart: cartMessage } = await searchParams;

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
    db.from("photo_sets").select("id, name, downloadable").eq("collection_id", collection.id).order("position"),
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
  const { data: coverRow, error: coverErr } = await db
    .from("collections")
    .select("cover_asset_id, downloads_enabled, download_limit, per_person_download_limit")
    .eq("id", collection.id)
    .maybeSingle();
  if (coverErr) throw coverErr;
  const coverAsset = assets.find((a) => a.id === coverRow?.cover_asset_id) ?? assets[0];
  const heroUrl = coverAsset && r2Configured() ? await presignGet(displayKey(coverAsset, LIGHTBOX_SIZE)) : null;
  const favoriteIds = new Set((favsRes.data ?? []).map((f) => f.asset_id));

  // Downloads (5.5). The download route enforces all of this again; here it
  // only decides which buttons to show and what to tell the visitor.
  const downloadsOn = coverRow?.downloads_enabled !== false;
  const downloadableSets = new Set(sets.filter((s) => s.downloadable !== false).map((s) => s.id));
  const galleryLimit = (coverRow?.download_limit as number | null) ?? null;
  const personLimit = (coverRow?.per_person_download_limit as number | null) ?? null;
  let remaining: number | null = null;
  if (downloadsOn && (galleryLimit !== null || personLimit !== null)) {
    const { data: grants, error: grantsErr } = await db
      .from("download_grants")
      .select("asset_id, visitor_key")
      .eq("collection_id", collection.id);
    if (grantsErr) throw grantsErr;
    const rows = grants ?? [];
    remaining = remainingDownloads({
      galleryLimit,
      galleryUsed: new Set(rows.map((g) => g.asset_id)).size,
      personLimit,
      personUsed: visitorEmail ? rows.filter((g) => g.visitor_key === visitorEmail).length : 0,
    });
  }
  const needsEmailToDownload = downloadsOn && personLimit !== null && !visitorEmail;
  const dlMessage = dl === "not_ready" ? DOWNLOAD_NOT_READY : dl && isClaimRefusal(dl) ? CLAIM_REFUSALS[dl] : null;

  // Store (7.2): a Shop tab when David has turned the store on. Read on its
  // own so the gallery still works before migration 0025 adds the column.
  const { data: storeRow } = await db.from("collections").select("store_enabled").eq("id", collection.id).maybeSingle();
  const storeOn = storeRow?.store_enabled === true;
  const showShop = storeOn && setParam === SHOP_TAB;

  const showFavorites = setParam === FAVORITES_TAB && visitorEmail !== null;
  const activeSet = showFavorites ? undefined : (sets.find((s) => s.id === setParam) ?? sets[0]);
  const activeTab = showShop ? SHOP_TAB : showFavorites ? FAVORITES_TAB : (activeSet?.id ?? "");
  const setAssets = showShop
    ? []
    : showFavorites
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
        downloadHref:
          downloadsOn && downloadableSets.has(a.set_id) && !needsEmailToDownload
            ? `/g/${collection.slug}/download/${a.id}`
            : null,
        favorited: favoriteIds.has(a.id),
      }))
    );
  }

  let shop: React.ReactNode = null;
  if (showShop) {
    const { products, variants } = await loadCatalog(db);
    const imageUrls = new Map<string, string>();
    if (r2Configured()) {
      for (const p of products) if (p.image_key) imageUrls.set(p.id, await presignGet(p.image_key));
    }
    shop = (
      <Shop
        products={products}
        variants={variants}
        imageUrls={imageUrls}
        lines={pricedCart(await readCart(collection.id), products, variants)}
        message={cartMessage}
        addToCart={addToCart.bind(null, collection.slug)}
        setCartQty={setCartQty.bind(null, collection.slug)}
        checkout={checkoutCart.bind(null, collection.slug)}
      />
    );
  }

  const saveEmail = setFavoritesEmail.bind(null, collection.slug, activeTab === SHOP_TAB ? "" : activeTab);
  const forgetEmail = clearFavoritesEmail.bind(null, collection.slug);
  const toggle = toggleFavorite.bind(null, collection.slug);

  return (
    <>
    {heroUrl && (
      <header className="hero">
        <img src={heroUrl} alt="" />
        <div className="inner">
          <h1>{collection.name}</h1>
          {collection.event_date && <p className="date">{collection.event_date}</p>}
          <a href="#photos" className="go">View gallery</a>
        </div>
      </header>
    )}
    <main className="wide" id="photos">
      {!heroUrl && <h1 className="gtitle">{collection.name}</h1>}
      {!heroUrl && collection.event_date && <p className="gdate">{collection.event_date}</p>}

      {visitorEmail ? (
        <form action={forgetEmail} className="hint">
          Saving favorites as <strong>{visitorEmail}</strong> <button type="submit">Not you?</button>
        </form>
      ) : (
        <form action={saveEmail} className="row">
          <label htmlFor="fav-email">
            {personLimit !== null && downloadsOn
              ? "Enter your email to save favorites and download"
              : "Enter your email to save favorites"}
          </label>
          <input id="fav-email" name="email" type="email" autoComplete="email" required />
          <button type="submit">Start favoriting</button>
        </form>
      )}
      {fav && FAV_ERRORS[fav] && <p role="alert">{FAV_ERRORS[fav]}</p>}
      {dlMessage && (
        <p role="alert" className="notice">
          {dlMessage}
        </p>
      )}
      {remaining !== null && !needsEmailToDownload && (
        <p className="hint">
          {remaining === 0
            ? "No downloads left. Photos you've already downloaded can be downloaded again."
            : `${remaining} download${remaining === 1 ? "" : "s"} left. Downloading a photo again doesn't use one.`}
        </p>
      )}

      {(sets.length > 1 || visitorEmail || storeOn) && (
        <nav aria-label="Sets" className="settabs">
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
          {storeOn &&
            (showShop ? (
              <strong aria-current="page">Shop</strong>
            ) : (
              <Link href={`/g/${collection.slug}?set=${SHOP_TAB}`}>Shop</Link>
            ))}
        </nav>
      )}
      {showShop ? (
        shop
      ) : setAssets.length > 0 && !r2Configured() ? (
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
    </>
  );
}
