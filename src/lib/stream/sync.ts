// Keeps media_assets in step with Stream (Phase 6.3). The webhook is the main
// path; syncPendingVideos is the fallback for a missed or unregistered
// webhook (Stream allows one webhook per account, so staging and production
// can't both have one). It runs from the gallery admin page and the hourly
// cron, a few videos at a time.
import { supabaseAdmin } from "@/lib/supabase";
import { getStreamVideo, streamConfigured } from "./client";
import type { StreamState } from "./webhook";

// Matches on stream_uid only, so a payload can't point at another asset.
// Returns whether a video of ours was updated.
export async function applyStreamState(state: StreamState): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("media_assets")
    .update({
      stream_status: state.status,
      stream_error: state.status === "error" ? state.error : null,
      stream_checked_at: new Date().toISOString(),
      ...(state.durationSeconds !== null ? { duration_seconds: state.durationSeconds } : {}),
      ...(state.width !== null ? { width: Math.round(state.width) } : {}),
      ...(state.height !== null ? { height: Math.round(state.height) } : {}),
    })
    .eq("kind", "video")
    .eq("stream_uid", state.uid)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

// Asks Stream about videos still queued or processing that nobody has
// checked in the last `minAgeSeconds`. Capped so a page view or cron run
// costs at most `limit` subrequests.
export async function syncPendingVideos(opts: { collectionId?: string; limit: number; minAgeSeconds: number }) {
  if (!streamConfigured()) return { checked: 0 };
  const cutoff = new Date(Date.now() - opts.minAgeSeconds * 1000).toISOString();
  let q = supabaseAdmin()
    .from("media_assets")
    .select("id, stream_uid")
    .eq("kind", "video")
    .in("stream_status", ["queued", "processing"])
    .not("stream_uid", "is", null)
    .or(`stream_checked_at.is.null,stream_checked_at.lt.${cutoff}`)
    .order("stream_checked_at", { ascending: true, nullsFirst: true })
    .limit(opts.limit);
  if (opts.collectionId) q = q.eq("collection_id", opts.collectionId);
  const { data, error } = await q;
  if (error) throw error;

  let checked = 0;
  for (const row of data ?? []) {
    try {
      const state = await getStreamVideo(row.stream_uid as string);
      if (state) await applyStreamState(state);
      else {
        await supabaseAdmin()
          .from("media_assets")
          .update({ stream_status: "error", stream_error: "Stream no longer has this video. Retry the transcode.", stream_checked_at: new Date().toISOString() })
          .eq("id", row.id);
      }
      checked++;
    } catch (err) {
      console.error("stream status check failed", err);
      // Don't hammer Stream about this one on the next page view.
      await supabaseAdmin().from("media_assets").update({ stream_checked_at: new Date().toISOString() }).eq("id", row.id);
    }
  }
  return { checked };
}
