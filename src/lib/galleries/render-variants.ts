// Resizes one original into JPEG size variants (Phase 5.2). Uses sharp, a
// native module, so this only runs in the GitHub Actions variants job — it is
// never imported by the app or bundled into the Worker.
import sharp from "sharp";

export type RenderedVariant = { size: number; width: number; height: number; data: Buffer };

export async function renderVariants(input: Buffer, sizes: readonly number[]): Promise<RenderedVariant[]> {
  const out: RenderedVariant[] = [];
  for (const size of sizes) {
    // rotate() applies the EXIF orientation; output strips metadata (camera,
    // GPS) and converts to sRGB, which is what browsers expect.
    const { data, info } = await sharp(input)
      .rotate()
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    out.push({ size, width: info.width, height: info.height, data });
  }
  return out;
}
