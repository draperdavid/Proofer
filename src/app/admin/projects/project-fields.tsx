import type { Project, ProjectStage } from "./types";

// Shared form fields for the new-project and edit-project pages. The contact
// link is fixed (set at creation from the contact's detail page) so it's
// always carried as a hidden field rather than an editable selector.
export function ProjectFields({
  project,
  stages,
  contactId,
}: {
  project?: Partial<Project>;
  stages: ProjectStage[];
  contactId?: string;
}) {
  const fixedContactId = contactId ?? project?.contact_id ?? "";

  return (
    <>
      <input type="hidden" name="contact_id" value={fixedContactId} />
      <div>
        <label htmlFor="title">Title</label>
        <input id="title" name="title" type="text" required defaultValue={project?.title ?? ""} />
      </div>
      <div>
        <label htmlFor="stage_id">Stage</label>
        <select id="stage_id" name="stage_id" defaultValue={project?.stage_id ?? stages[0]?.id ?? ""}>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="type">Type</label>
        <input id="type" name="type" type="text" defaultValue={project?.type ?? ""} />
      </div>
      <div>
        <label htmlFor="event_date">Event date</label>
        <input id="event_date" name="event_date" type="date" defaultValue={project?.event_date ?? ""} />
      </div>
      <div>
        <label htmlFor="location">Location</label>
        <input id="location" name="location" type="text" defaultValue={project?.location ?? ""} />
      </div>
      <div>
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" defaultValue={project?.description ?? ""} />
      </div>
      <div>
        <label htmlFor="private_notes">Private notes</label>
        <textarea id="private_notes" name="private_notes" defaultValue={project?.private_notes ?? ""} />
      </div>
      <div>
        <label htmlFor="archived">
          <input id="archived" name="archived" type="checkbox" defaultChecked={project?.archived ?? false} />
          Archived
        </label>
      </div>
    </>
  );
}
