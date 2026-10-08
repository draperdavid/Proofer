// How the Inbox sorts sent emails into folders and labels them. Pure, so the
// rules can be tested. Every email belongs to exactly one folder (besides "all").

export const FOLDERS = [
  { key: "all", label: "All mail" },
  { key: "delivered", label: "Delivered" },
  { key: "sent", label: "Sent" },
  { key: "attention", label: "Needs attention" },
  { key: "skipped", label: "Not sent" },
] as const;

export type FolderKey = (typeof FOLDERS)[number]["key"];
export type MailState = { status: string; delivery_status: string | null };
export type Tone = "green" | "blue" | "amber" | "red" | "grey";

export const isFolderKey = (v: unknown): v is FolderKey => FOLDERS.some((f) => f.key === v);

// Failures and bad deliveries come first so they are never hidden under "Sent".
export function folderOf(m: MailState): Exclude<FolderKey, "all"> {
  if (m.status === "failed" || m.delivery_status === "bounced" || m.delivery_status === "complained") return "attention";
  if (m.status === "skipped") return "skipped";
  if (m.delivery_status === "delivered") return "delivered";
  return "sent"; // handed to the mail service, no delivery report yet (or delayed)
}

export const inFolder = (m: MailState, folder: FolderKey) => folder === "all" || folderOf(m) === folder;

export function countFolders(rows: MailState[]): Record<FolderKey, number> {
  const counts: Record<FolderKey, number> = { all: rows.length, delivered: 0, sent: 0, attention: 0, skipped: 0 };
  for (const r of rows) counts[folderOf(r)] += 1;
  return counts;
}

export function mailPill(m: MailState): { tone: Tone; label: string } {
  if (m.status === "failed") return { tone: "red", label: "Failed" };
  if (m.delivery_status === "bounced") return { tone: "red", label: "Bounced" };
  if (m.delivery_status === "complained") return { tone: "red", label: "Spam complaint" };
  if (m.status === "skipped") return { tone: "grey", label: "Not sent" };
  if (m.delivery_status === "delivered") return { tone: "green", label: "Delivered" };
  if (m.delivery_status === "delayed") return { tone: "amber", label: "Delayed" };
  if (m.status === "pending") return { tone: "grey", label: "Sending" };
  return { tone: "blue", label: "Sent" };
}
