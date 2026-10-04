// Size variants for gallery photos (Phase 5.2). No imports, so the app, the
// variants job (scripts/generate-variants.ts) and Node's test runner can all
// share it.

// Long-edge sizes in pixels, largest first. The original is kept as-is.
export const VARIANT_SIZES = [3600, 2048, 1024, 640] as const;
export type VariantSize = (typeof VARIANT_SIZES)[number];

// Grids use 640 (or 1024 on large screens), the lightbox uses 2048.
export const GRID_SIZE: VariantSize = 640;
export const LIGHTBOX_SIZE: VariantSize = 2048;

export type VariantInfo = { key: string; width: number; height: number };
export type Variants = Partial<Record<string, VariantInfo>>;

// A failing photo is retried on later runs, then left alone with its error.
export const MAX_VARIANT_ATTEMPTS = 3;

// Variants sit beside the original under the asset's prefix, so the existing
// prefix deletes in 5.1 remove them too.
export function variantKey(collectionId: string, assetId: string, size: VariantSize): string {
  return `collections/${collectionId}/${assetId}/${size}.jpg`;
}

type AssetVariantFields = {
  collection_id: string;
  id: string;
  r2_key: string;
  variants_ready: boolean;
  variants: Variants | null;
};

// The R2 key to show at a given size: the variant once the job has made it,
// otherwise the original. Only keys under this asset's own prefix are trusted.
export function displayKey(asset: AssetVariantFields, size: VariantSize): string {
  const v = asset.variants_ready ? asset.variants?.[String(size)] : undefined;
  if (v && v.key === variantKey(asset.collection_id, asset.id, size)) return v.key;
  return asset.r2_key;
}
