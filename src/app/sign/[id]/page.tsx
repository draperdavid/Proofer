// Public contract signing page (Phase 3.2) — no auth, reached via the link
// David sends. Reads through supabaseAdmin() server-side, same as /quote and
// /questionnaire. A draft contract isn't visible to anyone with the link; a
// signed one shows the locked copy and its PDF.
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/galleries/download";
import { CONTRACT_COPY_SELECT, currentTitle, storedSignature, type ContractForCopy } from "@/lib/contracts/signed-copy";
import { formatSignedAt, sha256Hex } from "@/lib/contracts/signing";
import { signContract } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  name: "Type your full name to sign.",
  consent: "Tick the box to agree to sign electronically.",
  changed: "This contract changed or was already signed. Here's the current version.",
  limited: "Too many attempts. Wait a few minutes and try again.",
};

export default async function SignContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; signed?: string }>;
}) {
  const { id } = await params;
  const { error: errorKey, signed: justSigned } = await searchParams;
  if (!isUuid(id)) notFound();

  const { data, error } = await supabaseAdmin().from("contracts").select(CONTRACT_COPY_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  const contract = data as unknown as ContractForCopy & { status: string };
  if (contract.status === "draft") notFound();

  const title = contract.signed_title ?? currentTitle(contract);

  if (contract.status === "canceled") {
    return (
      <main>
        <h1>{title}</h1>
        <p>This contract was canceled and can no longer be signed. If that&apos;s a surprise, reply to the email it came in.</p>
      </main>
    );
  }

  const signature = contract.status === "completed" ? storedSignature(contract) : null;
  const sign = signContract.bind(null, contract.id);
  const bodyHash = await sha256Hex(contract.filled_body);
  const errorText = errorKey ? ERRORS[errorKey] : undefined;

  return (
    <main>
      <h1>{title}</h1>
      {justSigned && signature && <p className="notice">Signed. A copy is on its way to your inbox.</p>}
      {errorText && <p className="err">{errorText}</p>}

      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{contract.filled_body}</pre>

      {signature ? (
        <section>
          <h2>Signed</h2>
          <p>
            Signed by <strong>{signature.name}</strong> on {formatSignedAt(signature.signedAt)}.
          </p>
          <p>
            <a className="btn" href={`/sign/${contract.id}/pdf`}>
              Download the signed copy (PDF)
            </a>
          </p>
        </section>
      ) : (
        <form action={sign}>
          <h2>Sign</h2>
          <input type="hidden" name="body_sha256" value={bodyHash} />
          <div>
            <label htmlFor="signer_name">Type your full name</label>
            <input id="signer_name" name="signer_name" type="text" required maxLength={200} autoComplete="name" />
          </div>
          <div>
            <label>
              <input type="checkbox" name="consent" value="yes" required /> I&apos;ve read this contract and agree to
              sign it electronically. My typed name is my signature.
            </label>
          </div>
          <button type="submit">Sign contract</button>
          <p className="hint">
            When you sign, the time, your IP address and your browser are recorded with your signature, and the contract
            is locked.
          </p>
        </form>
      )}
    </main>
  );
}
