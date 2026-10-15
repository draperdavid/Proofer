// Client photo download (Phase 5.4, limits 5.5). Runs the same
// resolveGalleryAccess check as the gallery page, confirms the photo belongs
// to that gallery and exists at the gallery's download size, then asks
// claim_download() (migration 0021) for a credit. Only an "ok" from the
// database gets a 60-second presigned R2 GET; anything else redirects back to
// the gallery with the reason. The browser never decides what's allowed.
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { presignDownload, r2Configured } from "@/lib/r2";
import { resolveGalleryAccess, resolveVisitorEmail } from "@/lib/galleries/viewer-access";
import { assetPrefix } from "@/lib/galleries/media-rules";
import {
  DOWNLOAD_URL_TTL_SECONDS,
  attachmentDisposition,
  downloadFilename,
  downloadKeyFor,
  isClaimRefusal,
  isDownloadSize,
  isUuid,
} from "@/lib/galleries/download";
import { MAX_IP, MAX_USER_AGENT, cleanHeader } from "@/lib/contracts/signing";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: NO_STORE });
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string; assetId: string }> }) {
  const { slug, assetId } = await params;
  if (!isUuid(assetId)) return notFound();

  const result = await resolveGalleryAccess(slug);
  if (!result || result.access !== "granted") return notFound();
  if (!r2Configured()) {
    return new NextResponse("Downloads aren't available right now.", { status: 503, headers: NO_STORE });
  }

  const db = supabaseAdmin();
  const [{ data: asset, error }, { data: settings, error: settingsErr }] = await Promise.all([
    db
      .from("media_assets")
      // "*" so this keeps working before migration 0029 adds media kinds.
      .select("*")
      .eq("id", assetId)
      .eq("collection_id", result.collection.id)
      .eq("status", "uploaded")
      .maybeSingle(),
    db.from("collections").select("download_size").eq("id", result.collection.id).single(),
  ]);
  if (error) throw error;
  if (settingsErr) throw settingsErr;
  if (!asset) return notFound();

  // Back to the photo's set with a message the gallery page shows.
  const back = (reason: string) =>
    NextResponse.redirect(new URL(`/g/${result.collection.slug}?set=${asset.set_id}&dl=${reason}`, req.url), {
      status: 303,
      headers: NO_STORE,
    });

  // A video always goes out as its original (no size variants), and is
  // logged that way. It still uses one download credit, like a photo.
  const size = asset.kind === "video" ? "original" : String(settings.download_size);
  if (!isDownloadSize(size)) return notFound();
  const key = downloadKeyFor(asset, size);
  // Only sign keys under this photo's own prefix, never whatever the row says.
  if (key && !key.startsWith(assetPrefix(result.collection.id, asset.id))) return notFound();
  // The chosen size isn't made yet; refuse before spending a credit.
  if (!key) return back("not_ready");

  const h = await headers();
  const { data: claim, error: claimErr } = await db.rpc("claim_download", {
    p_collection_id: result.collection.id,
    p_asset_id: asset.id,
    p_visitor_key: (await resolveVisitorEmail(result.collection.id)) ?? "",
    p_size: size,
    p_ip: cleanHeader(h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0], MAX_IP),
    p_user_agent: cleanHeader(h.get("user-agent"), MAX_USER_AGENT),
  });
  if (claimErr) throw claimErr;
  if (claim !== "ok") return isClaimRefusal(String(claim)) ? back(String(claim)) : notFound();

  const url = await presignDownload(
    key,
    attachmentDisposition(downloadFilename(asset.original_filename, size)),
    DOWNLOAD_URL_TTL_SECONDS
  );
  return NextResponse.redirect(url, { status: 302, headers: NO_STORE });
}
