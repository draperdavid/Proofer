// Builds the PDF input for a contract from its database row (Phase 3.2). The
// sign action uses it before signing to hash the copy; the PDF route uses it
// after, to rebuild the same bytes and check them against pdf_sha256.
import type { SignedContractPdfInput } from "./pdf";
import { formatSignedAt } from "./signing";

export type ContractForCopy = {
  id: string;
  filled_body: string;
  signer_name: string | null;
  signer_email: string | null;
  signed_at: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  body_sha256: string | null;
  signed_title: string | null;
  signed_client_name: string | null;
  projects: { title: string } | null;
  contacts: { name: string; email: string | null } | null;
};

export const CONTRACT_COPY_SELECT =
  "id, status, filled_body, signer_name, signer_email, signed_at, signer_ip, signer_user_agent, signed_title, signed_client_name, body_sha256, pdf_sha256, projects(title), contacts(name, email)";

export type Signature = {
  name: string;
  email: string | null;
  signedAt: string;
  ip: string;
  userAgent: string;
  title: string;
  clientName: string;
  bodySha256: string;
};

// Title and client name as they'll be locked in at signing.
export function currentTitle(c: ContractForCopy): string {
  return c.projects?.title?.trim() || "Contract";
}
export function currentClientName(c: ContractForCopy): string {
  return c.contacts?.name?.trim() ?? "";
}

// signed_at comes back from Postgres as e.g. "2026-10-13T21:41:07.123+00:00";
// normalising through Date gives the same ISO string the sign action hashed.
export function copyInput(
  c: ContractForCopy,
  signature: Signature
): SignedContractPdfInput {
  const signedAtIso = new Date(signature.signedAt).toISOString();
  return {
    contractId: c.id,
    projectTitle: signature.title,
    clientName: signature.clientName,
    body: c.filled_body,
    signerName: signature.name,
    signerEmail: signature.email,
    signedAtText: formatSignedAt(signedAtIso),
    signedAtIso,
    signerIp: signature.ip,
    signerUserAgent: signature.userAgent,
    bodySha256: signature.bodySha256,
  };
}

// The stored signature of a completed contract, or null if it isn't signed.
export function storedSignature(c: ContractForCopy): Signature | null {
  if (!c.signer_name || !c.signed_at || !c.signer_ip || !c.signer_user_agent || !c.body_sha256) return null;
  if (c.signed_title === null || c.signed_client_name === null) return null;
  return {
    name: c.signer_name,
    email: c.signer_email,
    signedAt: c.signed_at,
    ip: c.signer_ip,
    userAgent: c.signer_user_agent,
    title: c.signed_title,
    clientName: c.signed_client_name,
    bodySha256: c.body_sha256,
  };
}
