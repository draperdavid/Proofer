// Public inquiry form (Phase 1.5). Plain HTML form posting to /api/inquire so
// it works with no client JS; success/error state comes back via query params
// after the API route's redirect.
export const dynamic = "force-dynamic";

export default async function InquirePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { success, error } = await searchParams;

  return (
    <main>
      <h1>Get in touch</h1>
      {success && <p>Thanks — your inquiry has been sent. We&apos;ll be in touch soon.</p>}
      {error && <p>{error}</p>}
      <form action="/api/inquire" method="POST">
        {/* Honeypot: hidden from real visitors, bots tend to fill every field. */}
        <div style={{ position: "absolute", left: "-9999px" }} aria-hidden="true">
          <label htmlFor="company">Company</label>
          <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" required maxLength={200} />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" maxLength={200} />
        </div>
        <div>
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" type="text" maxLength={50} />
        </div>
        <div>
          <label htmlFor="type">Project type</label>
          <input id="type" name="type" type="text" maxLength={100} placeholder="Wedding, portrait, event..." />
        </div>
        <div>
          <label htmlFor="event_date">Event date</label>
          <input id="event_date" name="event_date" type="date" />
        </div>
        <div>
          <label htmlFor="message">Tell us about your project</label>
          <textarea id="message" name="message" maxLength={5000} />
        </div>
        <button type="submit">Send inquiry</button>
      </form>
    </main>
  );
}
