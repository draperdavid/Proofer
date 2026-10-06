// Run with `npm test` (Node's built-in runner + type stripping, Node >= 22.18).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSubject, isSendableEmail, renderEmail, textToHtml, unknownFields } from "./render.ts";
import { TEMPLATES, TEMPLATE_KEYS, isTemplateKey } from "./templates.ts";

test("fields fill in, missing allowed fields render blank", () => {
  const out = renderEmail(
    { subject: "Hi {{contact.first_name}}", body: "Hello {{ contact.first_name }}.\n\n{{gallery.password}}\n\nBye" },
    { "contact.first_name": "Jordan" }
  );
  assert.equal(out.subject, "Hi Jordan");
  // The blank password paragraph disappears instead of leaving a gap.
  assert.equal(out.text, "Hello Jordan.\n\nBye");
});

test("unknown or malformed fields are caught at save time", () => {
  const allowed = ["contact.first_name", "gallery.link"];
  assert.deepEqual(unknownFields("Hi {{contact.first_name}} {{gallery.link}}", allowed), []);
  assert.deepEqual(unknownFields("Hi {{contact.firstname}}", allowed), ["{{contact.firstname}}"]);
  assert.deepEqual(unknownFields("{{ Contact Name }} and {{}}", allowed), ["{{ Contact Name }}", "{{}}"]);
});

test("HTML escapes values and template text, and links only http(s) URLs", () => {
  const out = renderEmail(
    { subject: "x", body: "Hi {{contact.first_name}},\n\nSee {{gallery.link}}.\n\n<b>bold?</b> javascript:alert(1)" },
    { "contact.first_name": `<script>alert("x")</script>`, "gallery.link": "https://example.com/g/a?x=1&y=2" }
  );
  assert.ok(!out.html.includes("<script>"));
  assert.ok(out.html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
  assert.ok(out.html.includes(`<a href="https://example.com/g/a?x=1&amp;y=2">https://example.com/g/a?x=1&amp;y=2</a>.`));
  assert.ok(out.html.includes("&lt;b&gt;bold?&lt;/b&gt;"));
  assert.ok(!out.html.includes(`href="javascript`));
  // Plain text keeps the raw value; it's never interpreted as markup.
  assert.ok(out.text.includes(`<script>alert("x")</script>`));
});

test("paragraphs and line breaks", () => {
  assert.match(textToHtml("one\ntwo\n\nthree"), /<p>one<br>two<\/p><p>three<\/p>/);
});

test("subjects can't inject headers", () => {
  assert.equal(cleanSubject("Hello\r\nBcc: evil@example.com"), "Hello Bcc: evil@example.com");
  assert.equal(cleanSubject("  a   b  "), "a b");
});

test("sendable emails", () => {
  assert.equal(isSendableEmail("jordan@example.com"), true);
  assert.equal(isSendableEmail("a@b"), false);
  assert.equal(isSendableEmail("x@example.com, y@example.com"), false);
  assert.equal(isSendableEmail("Name <x@example.com>"), false);
});

test("every built-in template only uses its own fields, and samples fill them all", () => {
  for (const key of TEMPLATE_KEYS) {
    const t = TEMPLATES[key];
    assert.equal(t.key, key);
    assert.deepEqual(unknownFields(t.subject + t.body, t.fields), [], key);
    for (const field of t.fields) assert.ok(field in t.sample, `${key} sample is missing ${field}`);
    // Voice rule: no dashes in client copy.
    assert.ok(!/[–—]/.test(t.subject + t.body), `${key} has a dash`);
  }
  assert.equal(isTemplateKey("gallery_ready"), true);
  assert.equal(isTemplateKey("toString"), false);
});
