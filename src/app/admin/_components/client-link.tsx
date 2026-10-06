// The full, sendable URL of a client-facing page, with a copy button.
import { appBaseUrl } from "@/lib/email/triggers";
import { absoluteUrl } from "@/lib/email/events";
import { CopyButton } from "./copy-button";

export async function ClientLink({ path }: { path: string }) {
  const url = absoluteUrl(await appBaseUrl(), path);
  return (
    <span style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all" }}>
        {url}
      </a>
      <CopyButton text={url} />
    </span>
  );
}
