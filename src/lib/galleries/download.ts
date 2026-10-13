// Client download helpers (Phase 5.4). No imports, so Node's test runner can
// load it directly.

// Download links are short-lived: the client is redirected straight to R2, so
// the URL only needs to outlive that redirect.
export const DOWNLOAD_URL_TTL_SECONDS = 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Route params are client-controlled; a malformed id would make Postgres throw
// on the uuid column, so it 404s here instead.
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

// Content-Disposition for R2 to send back. The stored filename came from the
// uploader's browser, so the plain `filename` keeps only safe ASCII (no quotes,
// slashes or control characters) and `filename*` carries the full UTF-8 name.
export function attachmentDisposition(filename: string): string {
  const name = filename.split(/[\\/]/).pop()?.trim() || "photo";
  const ascii = name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 150) || "photo";
  const encoded = encodeURIComponent(name.slice(0, 150)).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// ------------------------------------------------------- limits (Phase 5.5)
// The database decides (claim_download in 0021); these shape what goes in
// and what the client is told.

export const DOWNLOAD_SIZES = ["original", "3600", "2048", "1024"] as const;
export type DownloadSize = (typeof DOWNLOAD_SIZES)[number];

export function isDownloadSize(value: string): value is DownloadSize {
  return (DOWNLOAD_SIZES as readonly string[]).includes(value);
}

export const DOWNLOAD_SIZE_LABELS: Record<DownloadSize, string> = {
  original: "Original (full resolution)",
  "3600": "High resolution (3600px)",
  "2048": "Web size (2048px)",
  "1024": "Small (1024px)",
};

type DownloadableAsset = {
  collection_id: string;
  id: string;
  r2_key: string;
  variants_ready: boolean;
  variants: Partial<Record<string, { key: string }>> | null;
};

// The R2 key to hand out at the gallery's download size, or null if that size
// doesn't exist yet. Never falls back to the original for a smaller size:
// that would give away the full-resolution file David chose not to.
export function downloadKeyFor(asset: DownloadableAsset, size: DownloadSize): string | null {
  if (size === "original") return asset.r2_key;
  const v = asset.variants_ready ? asset.variants?.[size] : undefined;
  const expected = `collections/${asset.collection_id}/${asset.id}/${size}.jpg`;
  return v && v.key === expected ? v.key : null;
}

// "IMG_0042.jpg" at 2048 -> "IMG_0042-2048.jpg" (variants are always JPEG).
export function downloadFilename(original: string, size: DownloadSize): string {
  if (size === "original") return original;
  const base = original.split(/[\/]/).pop()?.replace(/\.[^.]*$/, "") || "photo";
  return `${base}-${size}.jpg`;
}

// A limit field from the admin form: blank = no limit, else a whole number >= 0.
export function parseLimit(raw: string | null | undefined): number | null {
  const v = (raw ?? "").trim();
  if (v === "") return null;
  if (!/^\d{1,6}$/.test(v)) throw new Error("A download limit must be a whole number, or blank for no limit");
  return Number(v);
}

export type ClaimResult =
  | "ok"
  | "not_found"
  | "disabled"
  | "set_not_downloadable"
  | "need_email"
  | "gallery_limit"
  | "person_limit";

export const CLAIM_REFUSALS: Record<Exclude<ClaimResult, "ok" | "not_found">, string> = {
  disabled: "Downloads are turned off for this gallery.",
  set_not_downloadable: "Photos in this set can't be downloaded.",
  need_email: "Enter your email above to download.",
  gallery_limit: "This gallery has reached its download limit. Contact your photographer for more.",
  person_limit: "You've reached your download limit. Contact your photographer for more.",
};

export function isClaimRefusal(value: string): value is keyof typeof CLAIM_REFUSALS {
  return Object.prototype.hasOwnProperty.call(CLAIM_REFUSALS, value);
}

// Photos this visitor can still newly download: the tighter of the gallery's
// and their own remaining credits. null = unlimited.
export function remainingDownloads(opts: {
  galleryLimit: number | null;
  galleryUsed: number;
  personLimit: number | null;
  personUsed: number;
}): number | null {
  const left = [
    opts.galleryLimit === null ? null : opts.galleryLimit - opts.galleryUsed,
    opts.personLimit === null ? null : opts.personLimit - opts.personUsed,
  ].filter((n): n is number => n !== null);
  return left.length === 0 ? null : Math.max(0, Math.min(...left));
}
