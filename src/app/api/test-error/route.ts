// Temporary Phase 0.5 verification route: confirms Sentry server-side capture works.
// Delete once David has confirmed a hit lands in Sentry.
export const dynamic = "force-dynamic";

export async function GET() {
  throw new Error("Proofer Sentry wiring test (Phase 0.5) — safe to ignore.");
}
