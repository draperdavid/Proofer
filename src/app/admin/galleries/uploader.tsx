"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finishUpload, startUpload } from "./actions";

type Row = { name: string; state: "queued" | "uploading" | "done" | "failed"; error?: string };

// A few files in flight at once: fast enough for a full shoot without
// saturating the browser's connection or the Worker.
const CONCURRENCY = 3;

// Uploads go browser -> R2 directly via presigned PUT URLs; the server only
// issues the URL (startUpload) and confirms the object landed (finishUpload).
export function Uploader({
  collectionId,
  sets,
}: {
  collectionId: string;
  sets: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [setId, setSetId] = useState(sets[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function uploadOne(file: File, i: number) {
    update(i, { state: "uploading" });
    const start = await startUpload(collectionId, setId, { name: file.name, type: file.type, size: file.size });
    if (!start.ok) {
      update(i, { state: "failed", error: start.error });
      return;
    }

    let putError: string | undefined;
    try {
      const res = await fetch(start.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!res.ok) putError = `Storage rejected the upload (${res.status})`;
    } catch {
      putError = "Network error while uploading (check the bucket's CORS settings)";
    }

    // Always confirm, even after a failed PUT: the server checks R2 itself and
    // cleans up the pending row if nothing arrived.
    const finish = await finishUpload(start.assetId);
    if (putError || !finish.ok) {
      update(i, { state: "failed", error: putError ?? (finish.ok ? undefined : finish.error) });
      return;
    }
    update(i, { state: "done" });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("files") as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0 || !setId) return;

    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, state: "queued" })));

    let next = 0;
    async function worker() {
      while (next < files.length) {
        const i = next++;
        await uploadOne(files[i], i);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

    setBusy(false);
    input.value = "";
    router.refresh();
  }

  const done = rows.filter((r) => r.state === "done").length;
  const failed = rows.filter((r) => r.state === "failed");

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="upload_set">Upload into set</label>
        <select id="upload_set" value={setId} onChange={(e) => setSetId(e.target.value)} disabled={busy}>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <input name="files" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} />
      </div>
      <button type="submit" disabled={busy}>
        {busy ? "Uploading..." : "Upload"}
      </button>
      {rows.length > 0 && (
        <p>
          {done} of {rows.length} uploaded{failed.length > 0 ? `, ${failed.length} failed` : ""}.
        </p>
      )}
      {failed.length > 0 && (
        <ul>
          {failed.map((r, i) => (
            <li key={i} role="alert">
              {r.name}: {r.error}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
