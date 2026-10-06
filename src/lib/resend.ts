// Resend email client. Used through src/lib/email/send.ts (Phase 8.1).
import { Resend } from "resend";
import { env } from "./env";

let _resend: Resend | null = null;
export function resend(): Resend {
  if (!_resend) _resend = new Resend(env.resendApiKey());
  return _resend;
}
