"use server";

// Public contract signing (Phase 3.2) — no Supabase session reaches this
// route, so the only things trusted from the client are the typed name, the
// consent box, and the hash of the text they were shown. Everything else
// (the text, the timestamp, IP, browser) comes from the server. The actual
// status change happens in sign_contract() (migration 0020), which only signs
// a contract that's awaiting signature and whose stored text still hashes to
// what the client saw, and writes the audit row in the same transaction.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { isRateLimited } from "@/lib/rate-limit";
import { isUuid } from "@/lib/galleries/download";
import { buildSignedContractPdf } from "@/lib/contracts/pdf";
import { CONTRACT_COPY_SELECT, copyInput, currentClientName, currentTitle, type ContractForCopy, type Signature } from "@/lib/contracts/signed-copy";
import { MAX_IP, MAX_USER_AGENT, cleanHeader, cleanSignerName, isSha256Hex, sha256Hex } from "@/lib/contracts/signing";
import { onContractSigned } from "@/lib/email/triggers";

export async function signContract(contractId: string, formData: FormData) {
  if (!isUuid(contractId)) redirect("/");
  const target = `/sign/${contractId}`;

  const h = await headers();
  const ip = cleanHeader(h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0], MAX_IP);
  const userAgent = cleanHeader(h.get("user-agent"), MAX_USER_AGENT);
  if (isRateLimited(`sign:${contractId}:${ip}`)) redirect(`${target}?error=limited`);

  const name = cleanSignerName(String(formData.get("signer_name") ?? ""));
  if (!name) redirect(`${target}?error=name`);
  if (formData.get("consent") !== "yes") redirect(`${target}?error=consent`);
  const shownHash = String(formData.get("body_sha256") ?? "");
  if (!isSha256Hex(shownHash)) redirect(`${target}?error=changed`);

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("contracts")
    .select(CONTRACT_COPY_SELECT)
    .eq("id", contractId)
    .maybeSingle();
  if (error) throw error;
  if (!data) redirect("/");
  const row = data as unknown as ContractForCopy & { status: string };
  if (row.status !== "awaiting_signature") redirect(target);
  if ((await sha256Hex(row.filled_body)) !== shownHash) redirect(`${target}?error=changed`);

  const signature: Signature = {
    name,
    email: row.contacts?.email?.trim().toLowerCase() || null,
    signedAt: new Date().toISOString(),
    ip,
    userAgent,
    title: currentTitle(row),
    clientName: currentClientName(row),
    bodySha256: shownHash,
  };
  const pdfSha256 = await sha256Hex(buildSignedContractPdf(copyInput(row, signature)));

  const { data: signed, error: signError } = await db.rpc("sign_contract", {
    p_contract_id: contractId,
    p_signer_name: signature.name,
    p_signer_email: signature.email,
    p_signed_at: signature.signedAt,
    p_ip: signature.ip,
    p_user_agent: signature.userAgent,
    p_signed_title: signature.title,
    p_signed_client_name: signature.clientName,
    p_body_sha256: signature.bodySha256,
    p_pdf_sha256: pdfSha256,
  });
  if (signError) throw signError;
  // Someone else signed first, it was canceled, or the text changed.
  if (signed !== true) redirect(`${target}?error=changed`);

  await onContractSigned(contractId);
  revalidatePath(`/admin/contracts/${contractId}`);
  redirect(`${target}?signed=1`);
}
