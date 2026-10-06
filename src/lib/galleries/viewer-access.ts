// Server-side access check for the public gallery routes (Phase 5.3). Reads
// the collection through supabaseAdmin() â€” same validated service-role read as
// /quote and /questionnaire â€” and the visitor's unlock cookie. Task 5.4's
// gallery UI and downloads call this before showing or signing anything.
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { env } from "@/lib/env";
import {
  MIN_SECRET_LENGTH,
  decideAccess,
  unlockCookieName,
  verifyUnlockToken,
  type AccessDecision,
  type Visibility,
} from "./access";
import { verifyVisitorToken, visitorCookieName } from "./favorites";

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type ViewerCollection = {
  id: string;
  name: string;
  slug: string;
  event_date: string | null;
  visibility: Visibility;
};

export function accessSecret(): string | null {
  const secret = env.galleryAccessSecret();
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export async function resolveGalleryAccess(
  slug: string
): Promise<{ collection: ViewerCollection; access: AccessDecision } | null> {
  if (!SLUG_PATTERN.test(slug)) return null;

  const { data, error } = await supabaseAdmin()
    .from("collections")
    .select("id, name, slug, event_date, status, visibility, access_version")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  let unlocked = false;
  const secret = accessSecret();
  const token = (await cookies()).get(unlockCookieName(data.id))?.value;
  if (data.visibility === "password" && secret && token) {
    unlocked = await verifyUnlockToken(secret, token, {
      collectionId: data.id,
      accessVersion: data.access_version,
      now: Math.floor(Date.now() / 1000),
    });
  }

  const access = decideAccess(data, unlocked);
  if (access === "not_found") return null;

  const { id, name, event_date, visibility } = data;
  return { collection: { id, name, slug: data.slug, event_date, visibility }, access };
}

// The email this visitor gave for favorites in this gallery (5.6), or null.
// Identity only; callers must already have a "granted" access decision.
export async function resolveVisitorEmail(collectionId: string): Promise<string | null> {
  const secret = accessSecret();
  const token = (await cookies()).get(visitorCookieName(collectionId))?.value;
  if (!secret || !token) return null;
  return verifyVisitorToken(secret, token, { collectionId, now: Math.floor(Date.now() / 1000) });
}