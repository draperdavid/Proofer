// Public brand images (9.2): /brand/logo, /brand/cover_logo,
// /brand/default_cover. Emails need a stable logo URL (a signed link would
// expire in the inbox), and a logo isn't secret. Streams the current image
// from R2 with a day of caching; 404 when none is set.
import { NextResponse } from "next/server";
import { BRAND_IMAGE_KINDS, brandKey, getBrand, type BrandImageKind } from "@/lib/brand/brand";
import { presignGet, r2Configured } from "@/lib/r2";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!BRAND_IMAGE_KINDS.includes(kind as BrandImageKind) || !r2Configured()) return new NextResponse("Not found", { status: 404 });
  const key = brandKey(await getBrand(), kind as BrandImageKind);
  if (!key) return new NextResponse("Not found", { status: 404 });
  const upstream = await fetch(await presignGet(key, 60));
  if (!upstream.ok || !upstream.body) return new NextResponse("Not found", { status: 404 });
  const ext = key.split(".").pop() ?? "";
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=86400",
      // An SVG logo must never run script when opened directly.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
