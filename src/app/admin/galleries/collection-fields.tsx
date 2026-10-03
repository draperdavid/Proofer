import type { Collection } from "./types";

// Shared form fields for the new and edit collection pages.
export function CollectionFields({ collection }: { collection?: Partial<Collection> }) {
  return (
    <>
      <div>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" required defaultValue={collection?.name ?? ""} />
      </div>
      <div>
        <label htmlFor="slug">URL slug (blank = from name)</label>
        <input id="slug" name="slug" type="text" defaultValue={collection?.slug ?? ""} />
      </div>
      <div>
        <label htmlFor="event_date">Event date</label>
        <input id="event_date" name="event_date" type="date" defaultValue={collection?.event_date ?? ""} />
      </div>
    </>
  );
}
