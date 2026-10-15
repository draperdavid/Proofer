// Gallery video (Phase 6, free version). No imports, so the app, the
// variants job and Node's test runner can all share it.
//
// The original stays on R2 untouched. The hourly variants job makes a
// web copy beside it (H.264/AAC MP4, at most 1920px on the long edge,
// "faststart" so it starts playing before it's fully downloaded) plus a
// poster frame. They're recorded in the same `variants` column photos use:
// {"web": {...}, "poster": {...}}, with variants_ready once both exist.

export function webVideoKey(collectionId: string, assetId: string): string {
  return `collections/${collectionId}/${assetId}/web.mp4`;
}

export function posterKey(collectionId: string, assetId: string): string {
  return `collections/${collectionId}/${assetId}/poster.jpg`;
}

type VideoAsset = {
  collection_id: string;
  id: string;
  variants_ready: boolean;
  variants: Partial<Record<string, { key: string }>> | null;
};

// The keys to play, or null until the job has made them. Only keys under
// this asset's own prefix are trusted, never whatever the row says.
export function playableKeys(asset: VideoAsset): { web: string; poster: string } | null {
  if (!asset.variants_ready) return null;
  const web = asset.variants?.web?.key;
  const poster = asset.variants?.poster?.key;
  if (web !== webVideoKey(asset.collection_id, asset.id) || poster !== posterKey(asset.collection_id, asset.id)) return null;
  return { web, poster };
}

// A playing video makes range requests for as long as it plays, and every
// one of them needs the presigned URL to still be valid. Six hours covers a
// long film or a paused tab; photo URLs stay short.
export const VIDEO_URL_TTL_SECONDS = 6 * 60 * 60;

// ffmpeg arguments for the web copy. CRF 23 with a 6 Mbit/s cap looks clean
// at 1080p and keeps a 10-minute film under about 450 MB. yuv420p and the
// high profile play on every current browser and phone.
export function webCopyArgs(input: string, output: string): string[] {
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", input,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-maxrate", "6M", "-bufsize", "12M", "-profile:v", "high",
    "-c:a", "aac", "-b:a", "160k", "-ac", "2",
    "-movflags", "+faststart",
    output,
  ];
}

// One frame, a second in (or halfway through a very short clip).
export function posterArgs(input: string, output: string, durationSeconds: number): string[] {
  const at = Math.max(0, Math.min(1, durationSeconds / 2));
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", at.toFixed(2), "-i", input,
    "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3",
    output,
  ];
}

// "1:05:09", "4:07", "0:12"
export function formatDuration(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
