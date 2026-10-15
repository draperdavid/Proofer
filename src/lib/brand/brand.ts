// The client-facing brand (Phase 9.2): business name, logos, accent, footer,
// reply-to. One row in brand_settings (0028), read once per request.
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase";
import { isMissingTable } from "@/lib/db-errors";
import { presignGet, r2Configured } from "@/lib/r2";
import { inkFor, isHexColor } from "./colors";

export type BrandImageKind = "logo" | "cover_logo" | "default_cover";
export const BRAND_IMAGE_KINDS: BrandImageKind[] = ["logo", "cover_logo", "default_cover"];

export type Brand = {
  businessName: string;
  logoKey: string | null;
  coverLogoKey: string | null;
  defaultCoverKey: string | null;
  accent: string | null;
  accentInk: string | null;
  replyTo: string | null;
  footer: string | null;
};

const DEFAULT_BRAND: Brand = {
  businessName: "David Monroe Photography",
  logoKey: null,
  coverLogoKey: null,
  defaultCoverKey: null,
  accent: null,
  accentInk: null,
  replyTo: null,
  footer: null,
};

export const getBrand = cache(async (): Promise<Brand> => {
  const { data, error } = await supabaseAdmin().from("brand_settings").select("*").eq("id", 1).maybeSingle();
  if (isMissingTable(error) || !data) return DEFAULT_BRAND;
  if (error) throw error;
  const accent = isHexColor(data.accent_color) ? (data.accent_color as string) : null;
  return {
    businessName: (data.business_name as string) || DEFAULT_BRAND.businessName,
    logoKey: (data.logo_key as string | null) ?? null,
    coverLogoKey: (data.cover_logo_key as string | null) ?? null,
    defaultCoverKey: (data.default_cover_key as string | null) ?? null,
    accent,
    accentInk: accent ? inkFor(accent) : null,
    replyTo: (data.reply_to_email as string | null) ?? null,
    footer: (data.footer_text as string | null) ?? null,
  };
});

export function brandKey(brand: Brand, kind: BrandImageKind): string | null {
  return kind === "logo" ? brand.logoKey : kind === "cover_logo" ? brand.coverLogoKey : brand.defaultCoverKey;
}

// A short-lived signed URL for showing a brand image on a page.
export async function brandImageUrl(brand: Brand, kind: BrandImageKind): Promise<string | null> {
  const key = brandKey(brand, kind);
  if (!key || !r2Configured()) return null;
  return presignGet(key, 3600);
}
