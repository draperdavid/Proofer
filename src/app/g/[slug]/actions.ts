"use server";

// Public gallery unlock — no Supabase session reaches this route. The slug is
// re-validated (bound args are client-controllable), the password is checked
// against the stored PBKDF2 hash, and only then is a signed httpOnly cookie
// scoped to this one collection set. Attempts are throttled per IP + gallery.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { isRateLimited } from "@/lib/rate-limit";
import {
  MAX_PASSWORD_LENGTH,
  UNLOCK_TTL_SECONDS,
  normalizePassword,
  signUnlockToken,
  unlockCookieName,
  verifyPassword,
} from "@/lib/galleries/access";
import { SLUG_PATTERN, accessSecret, resolveGalleryAccess, resolveVisitorEmail } from "@/lib/galleries/viewer-access";
import { VISITOR_TTL_SECONDS, normalizeEmail, signVisitorToken, visitorCookieName } from "@/lib/galleries/favorites";
import { isUuid } from "@/lib/galleries/download";

export async function unlockGallery(slug: string, formData: FormData) {
  if (!SLUG_PATTERN.test(slug)) redirect("/");
  const target = `/g/${slug}`;

  const secret = accessSecret();
  if (!secret) redirect(`${target}?error=unavailable`);

  const { data: collection, error } = await supabaseAdmin()
    .from("collections")
    .select("id, status, visibility, password_hash, access_version")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  // The page itself decides what a missing/draft/non-password gallery shows.
  if (!collection || collection.status !== "published" || collection.visibility !== "password") redirect(target);
  if (!collection.password_hash) redirect(target);

  const h = await headers();
  const ip = h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`gallery-unlock:${collection.id}:${ip}`)) redirect(`${target}?error=limited`);

  const password = normalizePassword(String(formData.get("password") ?? "").slice(0, MAX_PASSWORD_LENGTH + 50));
  if (!password || !(await verifyPassword(password, collection.password_hash))) {
    redirect(`${target}?error=wrong`);
  }

  const expiresAt = Math.floor(Date.now() / 1000) + UNLOCK_TTL_SECONDS;
  const token = await signUnlockToken(secret, {
    collectionId: collection.id,
    accessVersion: collection.access_version,
    expiresAt,
  });
  (await cookies()).set(unlockCookieName(collection.id), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: UNLOCK_TTL_SECONDS,
  });

  redirect(target);
}

// ----------------------------------------------------------------- favorites
// Phase 5.6. The visitor names themselves by email once per gallery; a signed
// httpOnly cookie remembers it. Every action re-runs the full gallery access
// check first, so the cookie alone never opens anything.

function clientIp(h: Headers): string {
  return h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function setFavoritesEmail(slug: string, returnTo: string, formData: FormData) {
  const result = await resolveGalleryAccess(slug);
  if (!result || result.access !== "granted") redirect(SLUG_PATTERN.test(slug) ? `/g/${slug}` : "/");
  const { collection } = result;
  // returnTo is only ever a set id or "favorites"; anything else is dropped.
  const back = `/g/${collection.slug}${isUuid(returnTo) || returnTo === "favorites" ? `?set=${returnTo}` : ""}`;
  const sep = back.includes("?") ? "&" : "?";

  const secret = accessSecret();
  if (!secret) redirect(`${back}${sep}fav=unavailable`);

  if (isRateLimited(`gallery-email:${collection.id}:${clientIp(await headers())}`)) {
    redirect(`${back}${sep}fav=limited`);
  }

  const email = normalizeEmail(String(formData.get("email") ?? "").slice(0, 300));
  if (!email) redirect(`${back}${sep}fav=bad-email`);

  const expiresAt = Math.floor(Date.now() / 1000) + VISITOR_TTL_SECONDS;
  const token = await signVisitorToken(secret, { collectionId: collection.id, email, expiresAt });
  (await cookies()).set(visitorCookieName(collection.id), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VISITOR_TTL_SECONDS,
  });

  redirect(back);
}

export async function clearFavoritesEmail(slug: string) {
  const result = await resolveGalleryAccess(slug);
  if (!result) redirect("/");
  (await cookies()).delete(visitorCookieName(result.collection.id));
  redirect(`/g/${result.collection.slug}`);
}

type ToggleResult = { ok: true; favorited: boolean } | { ok: false; error: string };

// Called from the grid. Returns errors instead of throwing so the heart can
// roll back its optimistic state and say why.
export async function toggleFavorite(slug: string, assetId: string): Promise<ToggleResult> {
  if (typeof assetId !== "string" || !isUuid(assetId)) return { ok: false, error: "Unknown photo" };

  const result = await resolveGalleryAccess(slug);
  if (!result || result.access !== "granted") return { ok: false, error: "This gallery isn't available" };
  const { collection } = result;

  const email = await resolveVisitorEmail(collection.id);
  if (!email) return { ok: false, error: "Enter your email to save favorites" };

  const db = supabaseAdmin();
  const { data: asset, error: assetErr } = await db
    .from("media_assets")
    .select("id")
    .eq("id", assetId)
    .eq("collection_id", collection.id)
    .eq("status", "uploaded")
    .maybeSingle();
  if (assetErr) throw assetErr;
  if (!asset) return { ok: false, error: "Unknown photo" };

  const { data: existing, error: findErr } = await db
    .from("favorites")
    .select("id")
    .eq("asset_id", asset.id)
    .eq("visitor_email", email)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    const { error } = await db.from("favorites").delete().eq("id", existing.id);
    if (error) throw error;
    return { ok: true, favorited: false };
  }

  const { error } = await db
    .from("favorites")
    .insert({ collection_id: collection.id, asset_id: asset.id, visitor_email: email });
  // unique_violation = a double click already added it; that's still "favorited".
  if (error && error.code !== "23505") throw error;
  return { ok: true, favorited: true };
}