// Public gallery page — no auth middleware. Access is decided server-side by
// resolveGalleryAccess (draft → 404, public → open, password → unlock cookie,
// private → closed for now). Task 5.4 replaces the placeholder below with the
// photo grid, lightbox and downloads.
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveGalleryAccess } from "@/lib/galleries/viewer-access";
import { unlockGallery } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  wrong: "That password isn't right.",
  limited: "Too many attempts. Please wait a few minutes and try again.",
  unavailable: "This gallery can't be unlocked right now. Please contact your photographer.",
};

export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const result = await resolveGalleryAccess(slug);
  if (!result) notFound();
  const { collection, access } = result;

  if (access === "private") {
    return (
      <main>
        <h1>{collection.name}</h1>
        <p>This gallery is private. Please contact your photographer for access.</p>
      </main>
    );
  }

  if (access === "needs_password") {
    const unlock = unlockGallery.bind(null, collection.slug);
    return (
      <main>
        <h1>{collection.name}</h1>
        <p>This gallery is password protected.</p>
        {error && ERRORS[error] && <p role="alert">{ERRORS[error]}</p>}
        <form action={unlock}>
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <button type="submit">View gallery</button>
        </form>
      </main>
    );
  }

  // Granted. Only uploaded photos count; the grid itself is task 5.4.
  const db = supabaseAdmin();
  const [setsRes, assetsRes] = await Promise.all([
    db.from("photo_sets").select("id, name").eq("collection_id", collection.id).order("position"),
    db.from("media_assets").select("set_id").eq("collection_id", collection.id).eq("status", "uploaded"),
  ]);
  if (setsRes.error) throw setsRes.error;
  if (assetsRes.error) throw assetsRes.error;
  const assets = assetsRes.data ?? [];

  return (
    <main>
      <h1>{collection.name}</h1>
      {collection.event_date && <p>{collection.event_date}</p>}
      <ul>
        {(setsRes.data ?? []).map((set) => (
          <li key={set.id}>
            {set.name} ({assets.filter((a) => a.set_id === set.id).length} photos)
          </li>
        ))}
      </ul>
    </main>
  );
}
