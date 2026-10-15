// Brand color helpers (Phase 9.2). Pure, so the test runner can load them.

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && HEX.test(value);
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Text color for a button filled with the accent: whichever of near-white
// and near-black reads better on it.
export function inkFor(accent: string): string {
  return contrast(accent, "#ffffff") >= contrast(accent, "#141414") ? "#ffffff" : "#141414";
}
