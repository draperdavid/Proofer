// Central, typed access to environment variables. Throws early if a required one is missing.
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  stripeSecret: () => required("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: () => required("STRIPE_WEBHOOK_SECRET"),
  resendApiKey: () => required("RESEND_API_KEY"),
  resendFrom: () => required("RESEND_FROM_EMAIL"),
  r2: () => ({
    accountId: required("R2_ACCOUNT_ID"),
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    bucket: required("R2_BUCKET"),
    publicBaseUrl: optional("R2_PUBLIC_BASE_URL"),
  }),
  // Sentry DSNs are not secret (Sentry's own docs say they're safe in client code),
  // so this is NEXT_PUBLIC_ like the Supabase URL/anon key, not a plain secret.
  sentryDsn: () => optional("NEXT_PUBLIC_SENTRY_DSN"),
  appBaseUrl: () => process.env.APP_BASE_URL || "http://localhost:3000",
};
