// Signed-contract PDF (Phase 3.2). A tiny hand-written PDF 1.4 writer: Letter
// pages, built-in Helvetica, plain wrapped text. No dependencies and no
// headless browser, so it runs on Workers. The output is deterministic (no
// creation date, fixed object order), which is what lets the download route
// rebuild a signed copy from the database and check it against the hash
// stored at signing. No imports beyond siblings, so Node's test runner can
// load it.

export type SignedContractPdfInput = {
  contractId: string;
  projectTitle: string;
  clientName: string;
  body: string;
  signerName: string;
  signerEmail: string | null;
  signedAtText: string;
  signedAtIso: string;
  signerIp: string;
  signerUserAgent: string;
  bodySha256: string;
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 72;
const TEXT_W = PAGE_W - MARGIN * 2;

// Helvetica advance widths (1/1000 em) for ASCII 32..126, from the standard
// Adobe font metrics.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
];
// Helvetica-Bold, same range.
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611,
  556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389,
  280, 389, 584,
];

// Characters outside ASCII that WinAnsiEncoding can show, mapped to their
// byte. Anything else prints as "?" (the database copy keeps the original).
const WIN_ANSI: Record<string, number> = {
  "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "…": 0x85, "€": 0x80, "™": 0x99,
};

function toWinAnsi(ch: string): number {
  const code = ch.codePointAt(0) ?? 63;
  if (code >= 32 && code <= 126) return code;
  if (WIN_ANSI[ch] !== undefined) return WIN_ANSI[ch];
  if (code >= 0xa0 && code <= 0xff) return code;
  return 63;
}

function charWidth(byte: number, bold: boolean): number {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  if (byte >= 32 && byte <= 126) return table[byte - 32];
  return 556;
}

export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of text) w += charWidth(toWinAnsi(ch), bold);
  return (w * size) / 1000;
}

// Greedy word wrap to `maxWidth` points. Words longer than a line (a URL, a
// hash) are broken by character. Blank input gives one empty line.
export function wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n")) {
    const words = para.split(/ +/).filter((w) => w.length > 0);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (let word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, bold) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      line = "";
      while (textWidth(word, size, bold) > maxWidth) {
        let cut = 1;
        const chars = [...word];
        while (cut < chars.length && textWidth(chars.slice(0, cut + 1).join(""), size, bold) <= maxWidth) cut++;
        out.push(chars.slice(0, cut).join(""));
        word = chars.slice(cut).join("");
      }
      line = word;
    }
    out.push(line);
  }
  return out;
}

// A PDF string literal: WinAnsi bytes, with \ ( ) escaped and non-ASCII as
// octal so the content stream stays 7-bit.
function pdfString(text: string): string {
  let s = "(";
  for (const ch of text) {
    const b = toWinAnsi(ch);
    if (b === 0x5c || b === 0x28 || b === 0x29) s += "\\" + String.fromCharCode(b);
    else if (b < 32 || b > 126) s += "\\" + b.toString(8).padStart(3, "0");
    else s += String.fromCharCode(b);
  }
  return s + ")";
}

type Line = { text: string; size: number; bold: boolean; gapBefore: number };

function layout(input: SignedContractPdfInput): Line[] {
  const lines: Line[] = [];
  const add = (text: string, size: number, bold = false, gapBefore = 0) => {
    wrapText(text, size, TEXT_W, bold).forEach((t, i) => lines.push({ text: t, size, bold, gapBefore: i === 0 ? gapBefore : 0 }));
  };

  add(input.projectTitle || "Contract", 16, true);
  add(`Client: ${input.clientName}`, 10, false, 4);
  add(input.body, 10.5, false, 14);

  add("Electronic signature", 12, true, 24);
  add(`Signed by: ${input.signerName}`, 10, false, 6);
  if (input.signerEmail) add(`Email on file: ${input.signerEmail}`, 10);
  add(`Signed: ${input.signedAtText} (${input.signedAtIso})`, 10);
  add(`IP address: ${input.signerIp}`, 10);
  add(`Browser: ${input.signerUserAgent}`, 10);
  add(`Contract ID: ${input.contractId}`, 10);
  add(`SHA-256 of the contract text as signed: ${input.bodySha256}`, 10);
  add(
    "The signer typed their name above and agreed to sign electronically. This copy was locked at the moment of signing and can't be edited.",
    9,
    false,
    8
  );
  return lines;
}

function paginate(lines: Line[]): Line[][] {
  const pages: Line[][] = [[]];
  let y = PAGE_H - MARGIN;
  for (const line of lines) {
    const step = line.size * 1.4 + line.gapBefore;
    if (y - step < MARGIN && pages[pages.length - 1].length > 0) {
      pages.push([]);
      y = PAGE_H - MARGIN;
      pages[pages.length - 1].push({ ...line, gapBefore: 0 });
      y -= line.size * 1.4;
      continue;
    }
    pages[pages.length - 1].push(line);
    y -= step;
  }
  return pages;
}

function pageStream(lines: Line[], pageNo: number, pageCount: number): string {
  const ops: string[] = [];
  let y = PAGE_H - MARGIN;
  for (const line of lines) {
    y -= line.size * 1.4 + line.gapBefore;
    if (line.text === "") continue;
    ops.push(`BT /${line.bold ? "F2" : "F1"} ${line.size} Tf ${MARGIN} ${y.toFixed(2)} Td ${pdfString(line.text)} Tj ET`);
  }
  const footer = `Page ${pageNo} of ${pageCount}`;
  ops.push(`BT /F1 8 Tf ${(PAGE_W - MARGIN - textWidth(footer, 8)).toFixed(2)} 40 Td ${pdfString(footer)} Tj ET`);
  return ops.join("\n");
}

export function buildSignedContractPdf(input: SignedContractPdfInput): Uint8Array {
  const pages = paginate(layout(input));
  const objects: string[] = [];
  // 1 catalog, 2 pages, 3 F1, 4 F2, 5 info, then a page + content pair per page.
  const pageIds = pages.map((_, i) => 6 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[5] = `<< /Title ${pdfString(`Signed contract ${input.contractId}`)} /Producer (Proofer) >>`;
  pages.forEach((lines, i) => {
    const stream = pageStream(lines, i + 1, pages.length);
    objects[pageIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  // Every byte is ASCII, so string length = byte length for the xref offsets.
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
