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
