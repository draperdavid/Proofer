// Signed contract PDF (Phase 3.2). Rebuilt from the locked database row on
// every download, then checked against the hash stored at signing: if a byte
// differs (the row was tampered with, or the PDF code changed), it refuses
// rather than hand out a copy that isn't what was signed.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/galleries/download";
import { buildSignedContractPdf } from "@/lib/contracts/pdf";
import { CONTRACT_COPY_SELECT, copyInput, storedSignature, type ContractForCopy } from "@/lib/contracts/signed-copy";
import { sha256Hex } from "@/lib/contracts/signing";

export const dynamic = "force-dynamic";

function text(body: string, status: number) {
  return new NextResponse(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return text("Not found", 404);

  const { data, error } = await supabaseAdmin().from("contracts").select(CONTRACT_COPY_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  const contract = data as unknown as (ContractForCopy & { status: string; pdf_sha256: string | null }) | null;
  const signature = contract?.status === "completed" ? storedSignature(contract) : null;
  if (!contract || !signature) return text("Not found", 404);

  const pdf = buildSignedContractPdf(copyInput(contract, signature));
  if ((await sha256Hex(pdf)) !== contract.pdf_sha256) {
    console.error(`signed contract ${id}: rebuilt PDF doesn't match the hash stored at signing`);
    return text("This signed copy couldn't be verified. Please contact David.", 500);
  }

  return new NextResponse(pdf as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="signed-contract-${id.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
