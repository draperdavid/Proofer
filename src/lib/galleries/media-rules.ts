// Upload validation + R2 key layout for gallery media (Phase 5.1).
// No imports, so it can be unit-tested with Node's runner directly.

// JPEG/PNG/WebP only: these are the formats variant generation (5.2) can
// resize. HEIC/RAW would need a conversion step first.
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Videos (Phase 6): what phones and editors commonly export and browsers hand
// over. The original is stored as-is; the variants job makes the web copy.
const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
// One presigned PUT to R2 tops out at 5 GiB. Larger needs multipart, which
// is out of scope until a film needs it.
export const MAX_VIDEO_BYTES = 5_000_000_000;

export const ACCEPTED_UPLOAD_TYPES = [...Object.keys(PHOTO_TYPES), ...Object.keys(VIDEO_TYPES)];

export type MediaKind = "photo" | "video";
export type UploadRequest = { name: string; type: string; size: number };

export function mediaKind(type: string): MediaKind | null {
  if (Object.prototype.hasOwnProperty.call(PHOTO_TYPES, type)) return "photo";
  if (Object.prototype.hasOwnProperty.call(VIDEO_TYPES, type)) return "video";
  return null;
}

// Returns the file extension to store under, or throws a readable error.
export function validateUpload(file: UploadRequest): string {
  const kind = mediaKind(file.type);
  if (!kind) throw new Error(`${file.name}: only JPEG, PNG and WebP photos or MP4, MOV and WebM videos can be uploaded`);
  if (!Number.isInteger(file.size) || file.size <= 0) throw new Error(`${file.name}: file is empty`);
  if (kind === "photo" && file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name}: larger than the 100 MB limit for photos`);
  if (kind === "video" && file.size > MAX_VIDEO_BYTES) throw new Error(`${file.name}: larger than the 5 GB limit for videos`);
  return kind === "photo" ? PHOTO_TYPES[file.type] : VIDEO_TYPES[file.type];
}

export function collectionPrefix(collectionId: string): string {
  return `collections/${collectionId}/`;
}

// Everything for one photo (original now, size variants from 5.2) lives under
// this prefix, so deleting the photo is one prefix delete.
export function assetPrefix(collectionId: string, assetId: string): string {
  return `${collectionPrefix(collectionId)}${assetId}/`;
}

export function originalKey(collectionId: string, assetId: string, ext: string): string {
  return `${assetPrefix(collectionId, assetId)}original.${ext}`;
}
