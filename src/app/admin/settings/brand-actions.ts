"use server";

// Brand settings (Phase 9.2). Images use the same presigned-PUT flow as
// gallery photos, under brand/<kind>/<uuid>.<ext> (key shape enforced by 0028).
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deletePrefix, headObjectSize, presignPut, r2Configured } from "@/lib/r2";
import { isHexColor } from "@/lib/brand/colors";
import { BRAND_IMAGE_KINDS, type BrandImageKind } from "@/lib/brand/brand";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };
const MAX_BYTES = 10 * 1024 * 1024;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const COLUMN: Record<BrandImageKind, string> = { logo: "logo_key", cover_logo: "cover_logo_key", default_cover: "default_cover_key" };

function text(formData: FormData, name: string, max: number): string | null {
  const v = String(formData.get(name) ?? "").trim().slice(0, max);
  return v.length > 0 ? v : null;
}

export async function updateBrand(formData: FormData) {
  await requireAdmin();
  const businessName = text(formData, "business_name", 120);
  if (!businessName) throw new Error("Business name is required");
  const accent = text(formData, "accent_color", 7);
  const replyTo = text(formData, "reply_to_email", 254);
  if (replyTo && !EMAIL.test(replyTo)) throw new Error("Reply-to must be an email address");
  const { error } = await supabaseAdmin()
    .from("brand_settings")
    .upsert({
      id: 1,
      business_name: businessName,
      accent_color: formData.get("use_accent") === "on" && isHexColor(accent) ? accent.toLowerCase() : null,
      reply_to_email: replyTo,
      footer_text: text(formData, "footer_text", 300),
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
  revalidatePath("/admin/settings");
}

type StartResult = { ok: true; url: string; key: string } | { ok: false; error: string };

export async function startBrandUpload(kind: string, file: { type: string; size: number }): Promise<StartResult> {
  await requireAdmin();
  if (!BRAND_IMAGE_KINDS.includes(kind as BrandImageKind)) return { ok: false, error: "Unknown image" };
  if (!r2Configured()) return { ok: false, error: "R2 isn't configured yet, uploads are disabled" };
  const ext = TYPES[file?.type];
  if (!ext || (kind === "default_cover" && ext === "svg")) return { ok: false, error: "Use a PNG, JPEG, WebP (or SVG for logos)" };
  if (!(file.size > 0 && file.size <= MAX_BYTES)) return { ok: false, error: "Images can be up to 10 MB" };
  const key = `brand/${kind}/${crypto.randomUUID()}.${ext}`;
  return { ok: true, url: await presignPut(key, file.type), key };
}

export async function saveBrandImage(kind: string, key: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!BRAND_IMAGE_KINDS.includes(kind as BrandImageKind)) return { ok: false, error: "Unknown image" };
  const prefix = `brand/${kind}/`;
  if (typeof key !== "string" || !key.startsWith(prefix)) return { ok: false, error: "Bad image" };
  if ((await headObjectSize(key)) === null) return { ok: false, error: "The upload didn't arrive. Please try again." };
  const { error } = await supabaseAdmin()
    .from("brand_settings")
    .upsert({ id: 1, [COLUMN[kind as BrandImageKind]]: key, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };
  await deletePrefix(prefix, (k) => k !== key);
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function removeBrandImage(kind: string) {
  await requireAdmin();
  if (!BRAND_IMAGE_KINDS.includes(kind as BrandImageKind)) return;
  const { error } = await supabaseAdmin()
    .from("brand_settings")
    .upsert({ id: 1, [COLUMN[kind as BrandImageKind]]: null, updated_at: new Date().toISOString() });
  if (error) throw error;
  await deletePrefix(`brand/${kind}/`);
  revalidatePath("/admin/settings");
}
