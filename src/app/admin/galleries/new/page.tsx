import Link from "next/link";
import { createCollection } from "../actions";
import { CollectionFields } from "../collection-fields";

export const dynamic = "force-dynamic";

export default function NewCollectionPage() {
  return (
    <main>
      <h1>New collection</h1>
      <p>
        <Link href="/admin/galleries">Back to galleries</Link>
      </p>
      <form action={createCollection}>
        <CollectionFields />
        <button type="submit">Create collection</button>
      </form>
    </main>
  );
}
