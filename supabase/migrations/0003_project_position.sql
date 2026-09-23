-- Kanban card ordering within a stage (Phase 1.3).
alter table projects add column if not exists position int not null default 0;
create index if not exists projects_stage_position_idx on projects (stage_id, position);
