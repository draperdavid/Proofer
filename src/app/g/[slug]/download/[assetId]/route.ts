// Client photo download (Phase 5.4). Runs the same resolveGalleryAccess check
// as the gallery page, confirms the photo belongs to that gallery, then
// redirects to a 60-second presigned R2 GET that downloads as an attachment.
// Download limits (who may download, how many) are task 5.5.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { presignDownload, r2Configured } from "@/lib/r2";
import { resolveGalleryAccess } from "@/lib/galleries/viewer-access";
import { assetPrefix } from "@/lib/galleries/media-rules";
import { DOWNLOAD_URL_TTL_SECONDS, attachmentDisposition, isUuid } from "@/lib/galleries/download";

export const dynamic = "force-dynamic";

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; assetId: string }> }) {
  const { slug, assetId } = await params;
  if (!isUuid(assetId)) return notFound();

  const result = await resolveGalleryAccess(slug);
  if (!result || result.access !== "granted") return notFound();
  if (!r2Configured()) {
    return new NextResponse("Downloads aren't available right now.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { data: asset, error } = await supabaseAdmin()
    .from("media_assets")
    .select("id, collection_id, r2_key, original_filename, status")
    .eq("id", assetId)
    .eq("collection_id", result.collection.id)
    .eq("status", "uploaded")
    .maybeSingle();
  if (error) throw error;
  // Only sign keys under this photo's own prefix, never whatever the row says.
  if (!asset || !asset.r2_key.startsWith(assetPrefix(result.collection.id, asset.id))) return notFound();

  const url = await presignDownload(
    asset.r2_key,
    attachmentDisposition(asset.original_filename),
    DOWNLOAD_URL_TTL_SECONDS
  );
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
