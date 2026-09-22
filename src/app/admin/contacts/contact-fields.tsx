import type { Contact } from "./types";

// Shared form fields for the new-contact and edit-contact pages.
export function ContactFields({ contact }: { contact?: Partial<Contact> }) {
  return (
    <>
      <div>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" required defaultValue={contact?.name ?? ""} />
      </div>
      <div>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" defaultValue={contact?.email ?? ""} />
      </div>
      <div>
        <label htmlFor="phone">Phone</label>
        <input id="phone" name="phone" type="text" defaultValue={contact?.phone ?? ""} />
      </div>
      <div>
        <label htmlFor="kind">Kind</label>
        <select id="kind" name="kind" defaultValue={contact?.kind ?? "lead"}>
          <option value="lead">Lead</option>
          <option value="client">Client</option>
        </select>
      </div>
      <div>
        <label htmlFor="tags">Tags (comma-separated)</label>
        <input id="tags" name="tags" type="text" defaultValue={(contact?.tags ?? []).join(", ")} />
      </div>
      <div>
        <label htmlFor="source">Source</label>
        <input id="source" name="source" type="text" defaultValue={contact?.source ?? ""} />
      </div>
      <div>
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" defaultValue={contact?.notes ?? ""} />
      </div>
    </>
  );
}
