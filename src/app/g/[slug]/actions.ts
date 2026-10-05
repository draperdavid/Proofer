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
import { SLUG_PATTERN, accessSecret } from "@/lib/galleries/viewer-access";

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
