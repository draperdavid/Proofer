import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { TEMPLATES, isTemplateKey } from "@/lib/email/templates";
import { renderEmail } from "@/lib/email/render";
import { loadTemplate } from "@/lib/email/send";
import { resetTemplate, saveTemplate, sendTestEmail } from "../actions";

export const dynamic = "force-dynamic";

const TEST_MESSAGES: Record<string, string> = {
  sent: "Test sent to your sign-in email. Check your inbox (and spam, until the domain is verified).",
  skipped: "Not sent: Resend isn't configured on this environment. It's in the send log as skipped.",
  failed: "The test failed. The error is in the send log.",
};

export default async function EmailTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ test?: string }>;
}) {
  const { key } = await params;
  const { test } = await searchParams;
  if (!isTemplateKey(key)) notFound();

  const def = TEMPLATES[key];
  const template = await loadTemplate(key);
  const preview = renderEmail(template, def.sample);

  const save = saveTemplate.bind(null, key);
  const reset = resetTemplate.bind(null, key);
  const sendTest = sendTestEmail.bind(null, key);

  return (
    <main>
      <h1>{def.name}</h1>
      <p>
        <Link href="/admin/emails">Back to emails</Link>
      </p>
      <p>{def.description}</p>
      {test && TEST_MESSAGES[test] && <p role="status">{TEST_MESSAGES[test]}</p>}

      <form action={save}>
        <div>
          <label htmlFor="subject">Subject</label>
          <input id="subject" name="subject" type="text" required defaultValue={template.subject} style={{ width: "100%" }} />
        </div>
        <div>
          <label htmlFor="body">Body (plain text; a blank line starts a new paragraph, links become clickable)</label>
          <textarea id="body" name="body" rows={14} required defaultValue={template.body} style={{ width: "100%" }} />
        </div>
        <p style={{ fontSize: "0.85rem" }}>
          Fields you can use: {def.fields.map((f) => <code key={f}>{`{{${f}}}`} </code>)}
          <br />A field with no value is left out, and a line that ends up empty disappears.
        </p>
        <button type="submit">Save template</button>
      </form>
      {template.edited && (
        <form action={reset}>
          <button type="submit">Reset to default</button>
        </form>
      )}

      <h2>Preview (sample values)</h2>
      <p>
        <strong>Subject:</strong> {preview.subject}
      </p>
      {/* renderEmail escapes every value and the template text; this is the exact HTML a client receives. */}
      <div
        style={{ border: "1px solid #ccc", padding: "1rem", background: "#fff" }}
        dangerouslySetInnerHTML={{ __html: preview.html }}
      />

      <h2>Test</h2>
      <form action={sendTest}>
        <button type="submit" disabled={!env.resendConfigured()}>
          Send a test to my sign-in email
        </button>
      </form>
      {!env.resendConfigured() && <p style={{ fontSize: "0.8rem" }}>Sending is off until Resend is configured.</p>}
    </main>
  );
}
