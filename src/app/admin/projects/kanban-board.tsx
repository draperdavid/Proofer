"use client";

// Native HTML5 drag-and-drop (no extra dependency, matching the rest of the app).
// Optimistic local reorder on drop, then a server round-trip + refresh to reconcile
// with the canonical, resequenced positions actions.ts computes.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveProject } from "./actions";
import type { Project, ProjectStage } from "./types";
import type { Badge } from "@/lib/project-badges";
import { formatDay } from "@/lib/dates";
import { Avatar } from "../_components/ui";

function groupByStage(stages: ProjectStage[], projects: Project[]) {
  const columns = new Map<string, Project[]>();
  for (const s of stages) columns.set(s.id, []);
  for (const p of projects) {
    if (p.stage_id && columns.has(p.stage_id)) columns.get(p.stage_id)!.push(p);
  }
  for (const list of columns.values()) list.sort((a, b) => a.position - b.position);
  return columns;
}

export function KanbanBoard({
  stages,
  projects,
  clients,
  badges,
}: {
  stages: ProjectStage[];
  projects: Project[];
  clients: Record<string, string>;
  badges: Record<string, Badge[]>;
}) {
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
    <div className="board">
      {stages.map((stage) => {
        const cards = columns.get(stage.id) ?? [];
        return (
          <div
            key={stage.id}
            className="col"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(stage.id, cards.length);
            }}
          >
            <h3 className="colhead">
              {stage.name} <span className="count">{cards.length}</span>
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
                className="kcard"
              >
                <Link href={`/admin/projects/${p.id}`}>{p.title}</Link>
                {clients[p.id] && (
                  <div className="kclient">
                    <Avatar name={clients[p.id]} />
                    {clients[p.id]}
                  </div>
                )}
                <div className="pills">
                  {p.event_date && <span className="chip">{formatDay(p.event_date)}</span>}
                  {p.type && <span className="chip">{p.type}</span>}
                  {(badges[p.id] ?? []).map((bd) => (
                    <span key={bd.label} className={`st ${bd.tone}`}>
                      {bd.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {cards.length === 0 && <p className="hint">No cards.</p>}
          </div>
        );
      })}
    </div>
  );
}
