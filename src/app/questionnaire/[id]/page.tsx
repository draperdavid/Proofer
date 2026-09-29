// Public questionnaire page — no auth, reached via a link David sends the
// client. Reads through supabaseAdmin() (service-role) same as /inquire,
// /pay, and the rest of Phase 3's client-facing routes: safe because this
// runs server-side only, never exposing the service-role key to the browser.
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import type { Questionnaire } from "@/app/admin/questionnaires/types";
import { submitAnswers } from "./actions";

export const dynamic = "force-dynamic";

type QuestionnaireWithProject = Questionnaire & { projects: { title: string } | null };

export default async function FillQuestionnairePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string }>;
}) {
  const { id } = await params;
  const { success } = await searchParams;

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("questionnaires")
    .select("*, projects(title)")
    .eq("id", id)
    .single();
  if (error || !data) notFound();

  const questionnaire = data as unknown as QuestionnaireWithProject;
  const fields = questionnaire.fields.slice().sort((a, b) => a.position - b.position);
  const submit = submitAnswers.bind(null, questionnaire.id);
  const alreadySubmitted = Boolean(questionnaire.submitted_at) || success === "1";

  return (
    <main>
      <h1>{questionnaire.projects?.title ?? "Questionnaire"}</h1>

      {alreadySubmitted && <p>Thanks — your answers have been received.</p>}

      {!alreadySubmitted && (
        <form action={submit}>
          {fields.map((field) => (
            <div key={field.id}>
              <label htmlFor={`field_${field.id}`}>
                {field.label}
                {field.required ? " *" : ""}
              </label>

              {field.type === "short_text" && (
                <input id={`field_${field.id}`} name={`field_${field.id}`} type="text" required={field.required} />
              )}
              {field.type === "long_text" && (
                <textarea id={`field_${field.id}`} name={`field_${field.id}`} required={field.required} />
              )}
              {field.type === "email" && (
                <input id={`field_${field.id}`} name={`field_${field.id}`} type="email" required={field.required} />
              )}
              {field.type === "date" && (
                <input id={`field_${field.id}`} name={`field_${field.id}`} type="date" required={field.required} />
              )}
              {field.type === "checkbox" && (
                <input id={`field_${field.id}`} name={`field_${field.id}`} type="checkbox" />
              )}
              {field.type === "multiple_choice" && (
                <div>
                  {field.options.map((option) => (
                    <label key={option}>
                      <input
                        type="radio"
                        name={`field_${field.id}`}
                        value={option}
                        required={field.required}
                      />
                      {option}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          <button type="submit">Submit</button>
        </form>
      )}
    </main>
  );
}
