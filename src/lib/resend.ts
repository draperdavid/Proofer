// Resend email client. Wired but not exercised until Phase 8.
import { Resend } from "resend";
import { env } from "./env";

let _resend: Resend | null = null;
export function resend(): Resend {
  if (!_resend) _resend = new Resend(env.resendApiKey());
  return _resend;
}
