"use server";

// Product images (Phase 7.2). Same flow as gallery photos: the browser PUTs
// straight to R2 with a short-lived presigned URL; the key is built here from
// server-generated ids only (migration 0025 checks its shape too), and the
// image is saved on the product only after R2 confirms the object exists.
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deletePrefix, headObjectSize, presignPut, r2Configured } from "@/lib/r2";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 15 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type StartResult = { ok: true; url: string; key: string } | { ok: false; error: string };

export async function startProductImageUpload(productId: string, file: { type: string; size: number }): Promise<StartResult> {
  await requireAdmin();
  if (!UUID.test(productId)) return { ok: false, error: "Unknown product" };
  if (!r2Configured()) return { ok: false, error: "R2 isn't configured yet, uploads are disabled" };
  const ext = TYPES[file?.type];
  if (!ext) return { ok: false, error: "Use a JPEG, PNG or WebP image" };
  if (!(file.size > 0 && file.size <= MAX_BYTES)) return { ok: false, error: "Images can be up to 15 MB" };
  const key = `products/${productId}/${crypto.randomUUID()}.${ext}`;
  return { ok: true, url: await presignPut(key, file.type), key };
}

export async function saveProductImage(productId: string, key: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const prefix = `products/${productId}/`;
  if (!UUID.test(productId) || typeof key !== "string" || !key.startsWith(prefix)) return { ok: false, error: "Bad image" };
  if ((await headObjectSize(key)) === null) return { ok: false, error: "The upload didn't arrive. Please try again." };
  const { error } = await supabaseAdmin().from("products").update({ image_key: key }).eq("id", productId);
  if (error) return { ok: false, error: error.message };
  // Drop any earlier image for this product.
  await deletePrefix(prefix, (k) => k !== key);
  revalidatePath(`/admin/store/${productId}`);
  return { ok: true };
}

export async function removeProductImage(productId: string) {
  await requireAdmin();
  if (!UUID.test(productId)) return;
  const { error } = await supabaseAdmin().from("products").update({ image_key: null }).eq("id", productId);
  if (error) throw error;
  await deletePrefix(`products/${productId}/`);
  revalidatePath(`/admin/store/${productId}`);
}
