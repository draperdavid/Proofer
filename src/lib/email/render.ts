// Email rendering (Phase 8.1). Pure, no imports, so Node's test runner can
// load it. Templates are plain text with {{field}} tokens; the HTML version is
// built here so nothing a client typed (or a template edit) becomes markup.

const TOKEN = /\{\{\s*([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)\s*\}\}/g;
const ANY_BRACES = /\{\{[^}]*\}\}/g;

// Every {{...}} in the text that isn't one of `allowed`, as written.
// Malformed tokens (e.g. "{{ Contact Name }}") count as unknown too.
export function unknownFields(text: string, allowed: readonly string[]): string[] {
  const bad = new Set<string>();
  for (const match of text.matchAll(ANY_BRACES)) {
    const inner = /^\{\{\s*([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)\s*\}\}$/.exec(match[0]);
    if (!inner || !allowed.includes(inner[1])) bad.add(match[0]);
  }
  return [...bad];
}

// Allowed fields with no value render as empty, the same as contract smart
// fields: a blank is better than a literal token in a client's inbox.
export function fillFields(text: string, fields: Record<string, string | null | undefined>): string {
  return text.replace(TOKEN, (_, name: string) => fields[name] ?? "");
}

// Header injection guard plus tidy whitespace.
export function cleanSubject(subject: string): string {
  return subject.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 200);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Bare http(s) URLs become links. Runs on already-escaped text, so the URL
// can't carry markup; trailing punctuation stays outside the link.
function linkify(escaped: string): string {
  return escaped.replace(/\bhttps?:\/\/[^\s<]+/g, (raw) => {
    const url = raw.replace(/[.,;:!?)]+$/, "");
    const rest = raw.slice(url.length);
    return `<a href="${url}">${url}</a>${rest}`;
  });
}

// Blank-line separated blocks → paragraphs; single newlines → <br>. Empty
// paragraphs (e.g. a blank optional field on its own line) are dropped.
export function textToHtml(text: string): string {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${linkify(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`);
  return `<div style="font-family: Georgia, serif; font-size: 16px; line-height: 1.5; color: #222; max-width: 560px;">${paragraphs.join("")}</div>`;
}

// Same blank-paragraph cleanup for the plain-text part.
export function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join("\n\n");
}

export type RenderedEmail = { subject: string; text: string; html: string };

export function renderEmail(
  template: { subject: string; body: string },
  fields: Record<string, string | null | undefined>
): RenderedEmail {
  const text = tidyText(fillFields(template.body, fields));
  return { subject: cleanSubject(fillFields(template.subject, fields)), text, html: textToHtml(text) };
}

const EMAIL_PATTERN = /^[^@\s<>",;]+@[^@\s<>",;]+\.[^@\s<>",;]+$/;

export function isSendableEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

// Brand frame around an email's HTML part (Phase 9.2): the logo (or the
// business name) on top, an optional footer line underneath. The logo URL is
// the stable public /brand/logo route, never a short-lived signed link.
export function wrapBranded(
  innerHtml: string,
  brand: { businessName: string; logoUrl: string | null; footer: string | null }
): string {
  const name = escapeHtml(brand.businessName);
  const head = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${name}" style="max-height: 56px; max-width: 220px; display: block; border: 0;">`
    : `<div style="font-family: Georgia, serif; font-size: 18px; color: #222;">${name}</div>`;
  const foot = brand.footer
    ? `<div style="font-family: Georgia, serif; font-size: 13px; line-height: 1.5; color: #666; margin-top: 28px; padding-top: 14px; border-top: 1px solid #e5e5e5;">${escapeHtml(brand.footer)}</div>`
    : "";
  return `<div style="max-width: 560px;"><div style="margin-bottom: 24px;">${head}</div>${innerHtml}${foot}</div>`;
}
