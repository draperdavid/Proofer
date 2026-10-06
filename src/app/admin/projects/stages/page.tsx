import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { addStageEmail, createStage, deleteStage, moveStage, removeStageEmail, renameStage } from "./actions";
import { STAGE_TEMPLATE_KEYS, TEMPLATES, isTemplateKey } from "@/lib/email/templates";
import type { ProjectStage } from "../types";
import { ConfirmButton } from "@/app/admin/_components/confirm-button";

export const dynamic = "force-dynamic";

export default async function StagesPage() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("project_stages")
    .select("*")
    .order("position", { ascending: true });
  if (error) throw error;

  const stages = (data ?? []) as ProjectStage[];
  const canDelete = stages.length > 1;

  const { data: ruleRows, error: rulesErr } = await db
    .from("automation_rules")
    .select("id, stage_id, template_key")
    .order("created_at", { ascending: true });
  // Stage emails are an add-on to this page: before migration 0017 runs, the
  // stage editor still works and the email section says why it's missing.
  const rules = (ruleRows ?? []) as { id: string; stage_id: string; template_key: string }[];

  return (
    <main>
      <h1>Manage stages</h1>
      <p>
        <Link href="/admin/projects">Back to projects</Link>
      </p>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Color</th>
            <th>Reorder</th>
            <th>Delete</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((stage, i) => {
            const rename = renameStage.bind(null, stage.id);
            const moveUp = moveStage.bind(null, stage.id, "up");
            const moveDown = moveStage.bind(null, stage.id, "down");
            const remove = deleteStage.bind(null, stage.id);

            return (
              <tr key={stage.id}>
                <td colSpan={2}>
                  <form action={rename} style={{ display: "flex", gap: "0.5rem" }}>
                    <input type="text" name="name" defaultValue={stage.name} required />
                    <input
                      type="text"
                      name="color"
                      defaultValue={stage.color ?? ""}
                      placeholder="#hex"
                      style={{ width: "6rem" }}
                    />
                    <button type="submit">Save</button>
                  </form>
                </td>
                <td>
                  <form action={moveUp} style={{ display: "inline" }}>
                    <button type="submit" disabled={i === 0}>
                      ↑
                    </button>
                  </form>
                  <form action={moveDown} style={{ display: "inline" }}>
                    <button type="submit" disabled={i === stages.length - 1}>
                      ↓
                    </button>
                  </form>
                </td>
                <td>
                  <form action={remove}>
                    {canDelete ? (
                      <ConfirmButton message={`Delete the ${stage.name} stage? Its projects move to the first stage.`}>
                        Delete
                      </ConfirmButton>
                    ) : (
                      <button type="submit" disabled>
                        Delete
                      </button>
                    )}
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!canDelete && <p>At least one stage must remain — add another before deleting this one.</p>}
      <p>Deleting a stage moves its projects to the remaining stage with the lowest position.</p>

      <h2>Stage emails</h2>
      {rulesErr && <p role="alert">Stage emails need migration 0017 on this database.</p>}
      <p>
        When a project enters a stage, its contact gets these emails. Each goes out once per project, even if the card
        moves back and forth. Edit the wording under <Link href="/admin/emails">Emails</Link>.
      </p>
      <table>
        <thead>
          <tr>
            <th>Stage</th>
            <th>Sends</th>
            <th>Add</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((stage) => {
            const stageRules = rules.filter((r) => r.stage_id === stage.id);
            const available = STAGE_TEMPLATE_KEYS.filter((k) => !stageRules.some((r) => r.template_key === k));
            const add = addStageEmail.bind(null, stage.id);
            return (
              <tr key={stage.id}>
                <td>{stage.name}</td>
                <td>
                  {stageRules.length === 0 && "Nothing"}
                  {stageRules.map((r) => (
                    <form key={r.id} action={removeStageEmail.bind(null, r.id)} style={{ display: "flex", gap: "0.5rem" }}>
                      <span>{isTemplateKey(r.template_key) ? TEMPLATES[r.template_key].name : r.template_key}</span>
                      <button type="submit">Remove</button>
                    </form>
                  ))}
                </td>
                <td>
                  {available.length > 0 && (
                    <form action={add} style={{ display: "flex", gap: "0.5rem" }}>
                      <select name="template_key" aria-label={`Email to add for ${stage.name}`}>
                        {available.map((k) => (
                          <option key={k} value={k}>
                            {TEMPLATES[k].name}
                          </option>
                        ))}
                      </select>
                      <button type="submit">Add</button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Add a stage</h2>
      <form action={createStage} style={{ display: "flex", gap: "0.5rem" }}>
        <input type="text" name="name" placeholder="Stage name" required />
        <input type="text" name="color" placeholder="#hex" style={{ width: "6rem" }} />
        <button type="submit">Add stage</button>
      </form>
    </main>
  );
}
