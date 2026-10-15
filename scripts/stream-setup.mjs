// One-off Cloudflare Stream setup (task 6.1). Run it yourself, from app/:
//
//   node scripts/stream-setup.mjs staging
//   node scripts/stream-setup.mjs production https://your-proofer-address
//
// It asks for the Stream API token (Stream: Edit) and your account's Stream
// customer code, then:
//   1. checks the token works (lists videos),
//   2. points Stream's webhook at this environment's /api/stream/webhook,
//   3. creates a signing key for playback tokens,
//   4. saves every value as a Worker secret with `wrangler secret put`.
// Values go straight from Cloudflare into wrangler; nothing is printed.
//
// Stream allows one webhook per account. Running this for production later
// moves the webhook there; staging then relies on the status check (the
// gallery admin page and the hourly cron), which is fine for testing.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

const STAGING_URL = "https://proofer-staging.proofer.workers.dev";

const envName = process.argv[2];
if (envName !== "staging" && envName !== "production") {
  console.error("Usage: node scripts/stream-setup.mjs staging | production <https://proofer-address>");
  process.exit(1);
}
const baseUrl = (envName === "staging" ? STAGING_URL : process.argv[3] || "").replace(/\/+$/, "");
if (!/^https:\/\/[^/]+$/.test(baseUrl)) {
  console.error("Give production's https:// address, e.g. https://proofer.example.com");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const accountId = (process.env.CF_STREAM_ACCOUNT_ID || (await rl.question("Cloudflare account ID: "))).trim();
const apiToken = (process.env.CF_STREAM_API_TOKEN || (await rl.question("Stream API token (Stream: Edit): "))).trim();
const customerCode = (await rl.question("Stream customer code (the customer-xxxx part, from the Stream page): "))
  .trim()
  .replace(/^https?:\/\//, "")
  .replace(/^customer-/, "")
  .replace(/\.cloudflarestream\.com.*$/, "");
rl.close();
if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new Error("That account ID doesn't look right (32 hex characters).");
if (!/^[a-z0-9]{8,64}$/i.test(customerCode)) throw new Error("That customer code doesn't look right.");

async function api(method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const msg = (json.errors || []).map((e) => e.message).join("; ");
    throw new Error(`${method} ${path || "/"} failed (${res.status}) ${msg}`);
  }
  return json.result;
}

function putSecret(name, value) {
  return new Promise((resolve, reject) => {
    // Production is wrangler.toml's top-level Worker; staging is [env.staging].
    const args = ["wrangler", "secret", "put", name, ...(envName === "staging" ? ["--env", "staging"] : [])];
    const child = spawn("npx", args, {
      stdio: ["pipe", "ignore", "inherit"],
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`wrangler secret put ${name} exited ${code}`))));
    child.stdin.end(value);
  });
}

console.log("1/4 Checking the token...");
await api("GET", "?limit=1");

console.log(`2/4 Pointing the webhook at ${baseUrl}/api/stream/webhook ...`);
const hook = await api("PUT", "/webhook", { notificationUrl: `${baseUrl}/api/stream/webhook` });
if (!hook?.secret) throw new Error("Stream didn't return a webhook secret.");

console.log("3/4 Creating a playback signing key...");
const key = await api("POST", "/keys");
if (!key?.id || !key?.jwk) throw new Error("Stream didn't return a signing key.");

console.log(`4/4 Saving secrets to the ${envName} Worker...`);
const secrets = {
  CF_STREAM_ACCOUNT_ID: accountId,
  CF_STREAM_API_TOKEN: apiToken,
  CF_STREAM_CUSTOMER_CODE: customerCode,
  CF_STREAM_WEBHOOK_SECRET: hook.secret,
  CF_STREAM_SIGNING_KEY_ID: key.id,
  CF_STREAM_SIGNING_JWK: key.jwk,
};
for (const [name, value] of Object.entries(secrets)) {
  await putSecret(name, value);
  console.log(`   saved ${name}`);
}
console.log("Done. Upload a short test video to a gallery to try it.");
