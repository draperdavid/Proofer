"use client";

// Native HTML5 drag-and-drop (no extra dependency, matching the rest of the app).
// Optimistic local reorder on drop, then a server round-trip + refresh to reconcile
// with the canonical, resequenced positions actions.ts computes.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveProject } from "./actions";
import type { Project, ProjectStage } from "./types";

function groupByStage(stages: ProjectStage[], projects: Project[]) {
  const columns = new Map<string, Project[]>();
  for (const s of stages) columns.set(s.id, []);
  for (const p of projects) {
    if (p.stage_id && columns.has(p.stage_id)) columns.get(p.stage_id)!.push(p);
  }
  for (const list of columns.values()) list.sort((a, b) => a.position - b.position);
  return columns;
}

export function KanbanBoard({ stages, projects }: { stages: ProjectStage[]; projects: Project[] }) {
  const router = useRouter();
  const [columns, setColumns] = useState(() => groupByStage(stages, projects));
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    setColumns(groupByStage(stages, projects));
  }, [stages, projects]);

  function handleDrop(stageId: string, index: number) {
    if (!draggingId) return;
    const id = draggingId;
    setDraggingId(null);

    setColumns((prev) => {
      const next = new Map(prev);
      for (const [sid, list] of next) next.set(sid, list.filter((p) => p.id !== id));
      const moved = projects.find((p) => p.id === id);
      if (!moved) return prev;
      const dest = [...(next.get(stageId) ?? [])];
      dest.splice(Math.max(0, Math.min(index, dest.length)), 0, moved);
      next.set(stageId, dest);
      return next;
    });

    moveProject(id, stageId, index)
      .then(() => router.refresh())
      .catch((err) => {
        console.error(err);
        router.refresh();
      });
  }

  return (
    <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
      {stages.map((stage) => {
        const cards = columns.get(stage.id) ?? [];
        return (
          <div
            key={stage.id}
            style={{ minWidth: "220px", border: "1px solid #ccc", padding: "0.5rem" }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(stage.id, cards.length);
            }}
          >
            <h3>
              {stage.name} ({cards.length})
            </h3>
            {cards.map((p, i) => (
              <div
                key={p.id}
                draggable
                onDragStart={() => setDraggingId(p.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const before = e.clientY - rect.top < rect.height / 2;
                  handleDrop(stage.id, before ? i : i + 1);
                }}
                style={{
                  border: "1px solid #999",
                  padding: "0.5rem",
                  marginTop: "0.5rem",
                  background: "white",
                  cursor: "grab",
                }}
              >
                <Link href={`/admin/projects/${p.id}`}>{p.title}</Link>
                {p.event_date && <div>{p.event_date}</div>}
              </div>
            ))}
            {cards.length === 0 && <p>No cards.</p>}
          </div>
        );
      })}
    </div>
  );
}
