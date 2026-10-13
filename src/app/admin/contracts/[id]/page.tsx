import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { ClientLink } from "@/app/admin/_components/client-link";
import { ConfirmButton } from "@/app/admin/_components/confirm-button";
import { formatSignedAt } from "@/lib/contracts/signing";
import { cancelContract, sendForSignature } from "../actions";
import type { Contract, ContractEvent } from "../types";

export const dynamic = "force-dynamic";

type ContractWithRelations = Contract & {
  projects: { id: string; title: string } | null;
  contacts: { id: string; name: string; email: string | null } | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  awaiting_signature: "Awaiting signature",
  in_progress: "In progress",
  completed: "Signed",
  canceled: "Canceled",
};

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = supabaseAdmin();
  const [{ data, error }, { data: eventRows, error: eventsError }] = await Promise.all([
    db.from("contracts").select("*, projects(id, title), contacts(id, name, email)").eq("id", id).single(),
    db.from("contract_events").select("*").eq("contract_id", id).order("created_at", { ascending: true }),
  ]);
  if (error || !data) notFound();
  if (eventsError) throw eventsError;

  const contract = data as unknown as ContractWithRelations;
  const events = (eventRows ?? []) as ContractEvent[];
  const send = sendForSignature.bind(null, contract.id);
  const cancel = cancelContract.bind(null, contract.id);

  return (
    <main>
      <h1>Contract</h1>
      <p>
        {contract.projects ? (
          <Link className="back" href={`/admin/projects/${contract.projects.id}`}>← Back to {contract.projects.title}</Link>
        ) : (
          <Link className="back" href="/admin/contacts">← Back to contacts</Link>
        )}
      </p>
      <p>
        Status: <strong>{STATUS_LABEL[contract.status] ?? contract.status}</strong>
        {contract.contacts ? ` · ${contract.contacts.name}` : ""}
      </p>

      {contract.status === "draft" && (
        <>
          <p className="hint">
            Once sent, the text is locked. If something&apos;s wrong, fix the template and generate a new contract first.
          </p>
          <form action={send}>
            <button type="submit">
              Send for signature{contract.contacts?.email ? ` and email ${contract.contacts.email}` : ""}
            </button>
          </form>
        </>
      )}

      {contract.status === "awaiting_signature" && (
        <>
          <p>
            Signing link: <ClientLink path={`/sign/${contract.id}`} />
          </p>
          <form action={cancel}>
            <ConfirmButton message="Cancel this contract? The signing link will stop working. This can't be undone.">
              Cancel contract
            </ConfirmButton>
          </form>
        </>
      )}

      {contract.status === "completed" && contract.signed_at && (
        <section>
          <h2>Signature</h2>
          <table>
            <tbody>
              <tr><td>Signed by</td><td>{contract.signer_name}</td></tr>
              <tr><td>Email on file</td><td>{contract.signer_email ?? "—"}</td></tr>
              <tr><td>Signed</td><td>{formatSignedAt(contract.signed_at)}</td></tr>
              <tr><td>IP address</td><td>{contract.signer_ip}</td></tr>
              <tr><td>Browser</td><td style={{ wordBreak: "break-all" }}>{contract.signer_user_agent}</td></tr>
              <tr><td>Text SHA-256</td><td><code style={{ wordBreak: "break-all" }}>{contract.body_sha256}</code></td></tr>
              <tr><td>PDF SHA-256</td><td><code style={{ wordBreak: "break-all" }}>{contract.pdf_sha256}</code></td></tr>
            </tbody>
          </table>
          <p>
            <a className="btn" href={`/sign/${contract.id}/pdf`}>Download signed PDF</a>{" "}
            <span className="hint">Client&apos;s copy: </span>
            <ClientLink path={`/sign/${contract.id}`} />
          </p>
        </section>
      )}

      <h2>Audit trail</h2>
      <ul>
        <li>Generated {new Date(contract.created_at).toLocaleString()}</li>
        {events.map((e) => (
          <li key={e.id}>
            <strong>{e.event}</strong> {new Date(e.created_at).toLocaleString()}
            {e.ip ? ` · ${e.ip}` : ""}
            {e.detail ? ` · ${e.detail}` : ""}
          </li>
        ))}
      </ul>

      <h2>Text</h2>
      <pre style={{ whiteSpace: "pre-wrap" }}>{contract.filled_body}</pre>
    </main>
  );
}
