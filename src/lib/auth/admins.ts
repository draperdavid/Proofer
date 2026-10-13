// Who may use /admin (task 0.7). An email address isn't a secret, so this is a
// committed constant rather than an env var. Add an address here to grant admin.
export const ADMIN_EMAILS: readonly string[] = ["david.draper86@gmail.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
