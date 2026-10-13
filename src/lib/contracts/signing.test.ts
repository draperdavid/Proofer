// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanHeader, cleanSignerName, formatSignedAt, isSha256Hex, sha256Hex } from "./signing.ts";
import { buildSignedContractPdf, textWidth, wrapText } from "./pdf.ts";

test("sha256Hex matches the known digest and handles UTF-8", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(await sha256Hex("café"), "850f7dc43910ff890f8879c0ed26fe697c93a067ad93a7d50f466a7028a9bf4e");
  assert.ok(isSha256Hex(await sha256Hex("")));
  assert.ok(!isSha256Hex("ABC"));
});

test("a typed signature needs a real name", () => {
  assert.equal(cleanSignerName("  Jordan   Ellis "), "Jordan Ellis");
  assert.equal(cleanSignerName("José\tGarcía"), "José García");
  assert.equal(cleanSignerName(""), null);
  assert.equal(cleanSignerName("   "), null);
  assert.equal(cleanSignerName("x"), null);
  assert.equal(cleanSignerName("12345"), null);
  assert.equal(cleanSignerName("a".repeat(201)), null);
});

test("header values are bounded and printable", () => {
  assert.equal(cleanHeader(null, 10), "unknown");
  assert.equal(cleanHeader("Mozilla\r\n/5.0", 100), "Mozilla  /5.0");
  assert.equal(cleanHeader("x".repeat(50), 10).length, 10);
});

test("signed-at reads in UTC", () => {
  assert.equal(formatSignedAt("2026-10-13T21:41:07.000Z"), "October 13, 2026 at 9:41:07 PM UTC");
});

test("wrapText keeps lines inside the width and breaks long words", () => {
  const lines = wrapText("word ".repeat(200) + "\n\n" + "x".repeat(400), 10, 468);
  for (const l of lines) assert.ok(textWidth(l, 10) <= 468, l);
  assert.ok(lines.includes(""));
  assert.equal(lines.filter((l) => /^x+$/.test(l)).join(""), "x".repeat(400));
});

const sample = {
  contractId: "3f2b8c1e-9a4d-4e7f-8b2a-1c0d9e8f7a6b",
  projectTitle: "Ellis Family Session",
  clientName: "Jordan Ellis",
  body: "This agreement (the “Contract”) is between David and Jordan — café (test) \\ 100%.\n\n".repeat(80),
  signerName: "Jordan Ellis",
  signerEmail: "jordan@example.com",
  signedAtText: "October 13, 2026 at 9:41:07 PM UTC",
  signedAtIso: "2026-10-13T21:41:07.000Z",
  signerIp: "203.0.113.7",
  signerUserAgent: "Mozilla/5.0 (test)",
  bodySha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
};

test("the signed PDF is deterministic, 7-bit and structurally sound", async () => {
  const a = buildSignedContractPdf(sample);
  const b = buildSignedContractPdf({ ...sample });
  assert.equal(await sha256Hex(a), await sha256Hex(b));

  const text = new TextDecoder().decode(a);
  assert.ok(text.startsWith("%PDF-1.4\n"));
  assert.ok(text.endsWith("%%EOF\n"));
  assert.ok([...a].every((byte) => byte < 128));
  // A long body spans several pages, and each page says so.
  const count = Number(/\/Count (\d+)/.exec(text)?.[1]);
  assert.ok(count > 1);
  assert.ok(text.includes(`(Page ${count} of ${count}) Tj`));
  // Parentheses and backslashes are escaped; smart quotes become WinAnsi octal.
  assert.ok(text.includes("\\(test\\) \\\\ 100%"));
  assert.ok(text.includes("\\223Contract\\224"));

  // Every xref offset points at its object.
  const xrefAt = Number(/startxref\n(\d+)/.exec(text)?.[1]);
  const entries = text.slice(xrefAt).split("\n").slice(3).filter((l) => / n $/.test(l));
  entries.forEach((entry, i) => {
    const offset = Number(entry.slice(0, 10));
    assert.ok(text.startsWith(`${i + 1} 0 obj`, offset), `object ${i + 1}`);
  });
});

test("changing any signed detail changes the PDF hash", async () => {
  const base = await sha256Hex(buildSignedContractPdf(sample));
  assert.notEqual(await sha256Hex(buildSignedContractPdf({ ...sample, signerIp: "203.0.113.8" })), base);
  assert.notEqual(await sha256Hex(buildSignedContractPdf({ ...sample, body: sample.body + "." })), base);
});
