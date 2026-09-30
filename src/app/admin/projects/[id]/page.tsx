import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { deleteProject, updateProject } from "../actions";
import { ProjectFields } from "../project-fields";
import type { Project, ProjectStage } from "../types";
import { formatCents } from "../../invoices/money";
import type { Invoice } from "../../invoices/types";
import { generateContract } from "../../contracts/actions";
import type { Contract, ContractTemplate } from "../../contracts/types";
import { sendQuestionnaire } from "../../questionnaires/actions";
import type { Questionnaire, QuestionnaireTemplate } from "../../questionnaires/types";
import type { Quote } from "../../quotes/types";

export const dynamic = "force-dynamic";

type ProjectWithContact = Project & { contacts: { id: string; name: string } | null };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = supabaseAdmin();
  const [
    { data, error },
    { data: stages, error: stagesError },
    { data: invoices, error: invoicesError },
    { data: contracts, error: contractsError },
    { data: templates, error: templatesError },
    { data: questionnaires, error: questionnairesError },
    { data: questionnaireTemplates, error: questionnaireTemplatesError },
    { data: quotes, error: quotesError },
  ] = await Promise.all([
    db.from("projects").select("*, contacts(id, name)").eq("id", id).single(),
    db.from("project_stages").select("*").order("position", { ascending: true }),
    db.from("invoices").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    db.from("contracts").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    db.from("contract_templates").select("*").order("name", { ascending: true }),
    db.from("questionnaires").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    db.from("questionnaire_templates").select("*").order("name", { ascending: true }),
    db.from("quotes").select("*").eq("project_id", id).order("created_at", { ascending: false }),
  ]);
  if (error || !data) notFound();
  if (stagesError) throw stagesError;
  if (invoicesError) throw invoicesError;
  if (contractsError) throw contractsError;
  if (templatesError) throw templatesError;
  if (questionnairesError) throw questionnairesError;
  if (questionnaireTemplatesError) throw questionnaireTemplatesError;
  if (quotesError) throw quotesError;

  const project = data as ProjectWithContact;
  const updateThisProject = updateProject.bind(null, project.id);
  const deleteThisProject = deleteProject.bind(null, project.id, project.contact_id);
  const generateThisContract = generateContract.bind(null, project.id);
  const sendThisQuestionnaire = sendQuestionnaire.bind(null, project.id);

  return (
    <main>
      <h1>Edit project</h1>
      <p>
        {project.contacts ? (
          <Link href={`/admin/contacts/${project.contacts.id}`}>Back to {project.contacts.name}</Link>
        ) : (
          <Link href="/admin/contacts">Back to contacts</Link>
        )}
      </p>
      <form action={updateThisProject}>
        <ProjectFields project={project} stages={(stages ?? []) as ProjectStage[]} />
        <button type="submit">Save changes</button>
      </form>
      <form action={deleteThisProject}>
        <button type="submit">Delete project</button>
      </form>

      <h2>Invoices</h2>
      <p>
        <Link href={`/admin/invoices/new?project_id=${project.id}`}>+ New invoice</Link>
      </p>
      <ul>
        {((invoices ?? []) as Invoice[]).map((inv) => (
          <li key={inv.id}>
            <Link href={`/admin/invoices/${inv.id}`}>{formatCents(inv.total_cents, inv.currency)}</Link>
            {" — "}
            {inv.status}
          </li>
        ))}
        {(!invoices || invoices.length === 0) && <li>No invoices yet.</li>}
      </ul>

      <h2>Quotes</h2>
      <p>
        <Link href={`/admin/quotes/new?project_id=${project.id}`}>+ New quote</Link>
      </p>
      <ul>
        {((quotes ?? []) as Quote[]).map((q) => (
          <li key={q.id}>
            <Link href={`/admin/quotes/${q.id}`}>{q.title}</Link>
            {" — "}
            {q.status}
          </li>
        ))}
        {(!quotes || quotes.length === 0) && <li>No quotes yet.</li>}
      </ul>

      <h2>Contracts</h2>
      <ul>
        {((contracts ?? []) as Contract[]).map((c) => (
          <li key={c.id}>
            <Link href={`/admin/contracts/${c.id}`}>{c.status}</Link>
          </li>
        ))}
        {(!contracts || contracts.length === 0) && <li>No contracts yet.</li>}
      </ul>
      {project.contacts && (
        <form action={generateThisContract}>
          <label htmlFor="template_id">Generate contract from template</label>
          <select id="template_id" name="template_id" required>
            {((templates ?? []) as ContractTemplate[]).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="submit">Generate</button>
        </form>
      )}
      {!project.contacts && <p>Link a contact to this project before generating a contract.</p>}
      <p>
        <Link href="/admin/contracts/templates">Manage contract templates</Link>
      </p>

      <h2>Questionnaires</h2>
      <ul>
        {((questionnaires ?? []) as Questionnaire[]).map((q) => (
          <li key={q.id}>
            <Link href={`/admin/questionnaires/${q.id}`}>{q.submitted_at ? "Submitted" : "Awaiting response"}</Link>
          </li>
        ))}
        {(!questionnaires || questionnaires.length === 0) && <li>No questionnaires sent yet.</li>}
      </ul>
      {project.contacts && (
        <form action={sendThisQuestionnaire}>
          <label htmlFor="template_id">Send questionnaire from template</label>
          <select id="template_id" name="template_id" required>
            {((questionnaireTemplates ?? []) as QuestionnaireTemplate[]).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="submit">Send</button>
        </form>
      )}
      {!project.contacts && <p>Link a contact to this project before sending a questionnaire.</p>}
      <p>
        <Link href="/admin/questionnaires/templates">Manage questionnaire templates</Link>
      </p>
    </main>
  );
}
