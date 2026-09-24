import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { createStage, deleteStage, moveStage, renameStage } from "./actions";
import type { ProjectStage } from "../types";

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
                    <button type="submit" disabled={!canDelete}>
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!canDelete && <p>At least one stage must remain — add another before deleting this one.</p>}
      <p>Deleting a stage moves its projects to the remaining stage with the lowest position.</p>

      <h2>Add a stage</h2>
      <form action={createStage} style={{ display: "flex", gap: "0.5rem" }}>
        <input type="text" name="name" placeholder="Stage name" required />
        <input type="text" name="color" placeholder="#hex" style={{ width: "6rem" }} />
        <button type="submit">Add stage</button>
      </form>
    </main>
  );
}
