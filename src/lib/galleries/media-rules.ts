// Upload validation + R2 key layout for gallery media (Phase 5.1).
// No imports, so it can be unit-tested with Node's runner directly.

// JPEG/PNG/WebP only: these are the formats variant generation (5.2) can
// resize. HEIC/RAW would need a conversion step first.
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export type UploadRequest = { name: string; type: string; size: number };

// Returns the file extension to store under, or throws a readable error.
export function validateUpload(file: UploadRequest): string {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new Error(`${file.name}: only JPEG, PNG and WebP images can be uploaded`);
  if (!Number.isInteger(file.size) || file.size <= 0) throw new Error(`${file.name}: file is empty`);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name}: larger than the 100 MB limit`);
  return ext;
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
