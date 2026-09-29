import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import type { Questionnaire } from "../types";

export const dynamic = "force-dynamic";

type QuestionnaireWithRelations = Questionnaire & {
  projects: { id: string; title: string } | null;
  contacts: { id: string; name: string } | null;
};

function formatAnswer(value: string | undefined, type: string): string {
  if (value === undefined || value === "") return "(no answer)";
  if (type === "checkbox") return value === "true" ? "Yes" : "No";
  return value;
}

export default async function QuestionnaireDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("questionnaires")
    .select("*, projects(id, title), contacts(id, name)")
    .eq("id", id)
    .single();
  if (error || !data) notFound();

  const questionnaire = data as unknown as QuestionnaireWithRelations;
  const fields = questionnaire.fields.slice().sort((a, b) => a.position - b.position);

  return (
    <main>
      <h1>Questionnaire</h1>
      <p>
        {questionnaire.projects ? (
          <Link href={`/admin/projects/${questionnaire.projects.id}`}>Back to {questionnaire.projects.title}</Link>
        ) : (
          <Link href="/admin/contacts">Back to contacts</Link>
        )}
      </p>
      <p>
        Status: <strong>{questionnaire.submitted_at ? "Submitted" : "Awaiting response"}</strong>
        {questionnaire.contacts ? ` · ${questionnaire.contacts.name}` : ""}
      </p>

      {!questionnaire.submitted_at && (
        <p>
          Send this link to the client to fill out:
          <br />
          <code>/questionnaire/{questionnaire.id}</code>
        </p>
      )}

      {questionnaire.submitted_at && (
        <table>
          <tbody>
            {fields.map((f) => (
              <tr key={f.id}>
                <td>{f.label}</td>
                <td>{formatAnswer(questionnaire.answers[f.id], f.type)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
