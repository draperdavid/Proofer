"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finishUpload, startUpload } from "./actions";
import { ACCEPTED_UPLOAD_TYPES } from "@/lib/galleries/media-rules";

type Row = { name: string; size: number; sent: number; state: "queued" | "uploading" | "done" | "failed"; error?: string };

// XHR rather than fetch: fetch can't report upload progress, and a 4 GB film
// needs more than "0 of 1" for twenty minutes.
function putWithProgress(url: string, file: File, onProgress: (sent: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

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
  const [dragging, setDragging] = useState(false);

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
      const status = await putWithProgress(start.url, file, (sent) => update(i, { sent }));
      if (status < 200 || status >= 300) putError = `Storage rejected the upload (${status})`;
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
    update(i, { state: "done", sent: file.size });
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0 || !setId || busy) return;
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, size: f.size, sent: 0, state: "queued" })));

    let next = 0;
    async function worker() {
      while (next < files.length) {
        const i = next++;
        await uploadOne(files[i], i);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

    setBusy(false);
    router.refresh();
  }

  const done = rows.filter((r) => r.state === "done").length;
  const failed = rows.filter((r) => r.state === "failed");
  const finished = rows.filter((r) => r.state === "done" || r.state === "failed").length;
  // By bytes, so one big video moves the bar as it goes.
  const totalBytes = rows.reduce((n, r) => n + r.size, 0);
  const sentBytes = rows.reduce((n, r) => n + (r.state === "failed" || r.state === "done" ? r.size : Math.min(r.sent, r.size)), 0);
  const pct = totalBytes > 0 ? Math.round((sentBytes / totalBytes) * 100) : 0;
  const ACCEPT = ACCEPTED_UPLOAD_TYPES;

  return (
    <div
      className={`dropzone${dragging ? " over" : ""}${busy ? " busy" : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = busy ? "none" : "copy";
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void uploadFiles(Array.from(e.dataTransfer.files).filter((f) => ACCEPT.includes(f.type)));
      }}
    >
      <div className="dz-main">
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
        <span className="dz-text">
          {busy ? (
            <>
              Uploading {finished} of {rows.length}…
            </>
          ) : (
            <>Drag photos or videos here, or</>
          )}
        </span>
        <label className={`btn${busy ? " disabled" : ""}`}>
          Choose files
          <input
            className="sr-only"
            type="file"
            multiple
            accept={ACCEPT.join(",")}
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? []);
              e.currentTarget.value = "";
              void uploadFiles(files);
            }}
          />
        </label>
        {sets.length > 1 ? (
          <label className="dz-set">
            into
            <select value={setId} onChange={(e) => setSetId(e.target.value)} disabled={busy} aria-label="Upload into set">
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="dz-set">into {sets[0]?.name}</span>
        )}
        <span className="dz-hint">JPEG, PNG or WebP photos · MP4, MOV or WebM videos up to 5 GB</span>
      </div>
      {rows.length > 0 && (
        <div className="dz-progress" role="status">
          <div className="bar" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
          <span>
            {done} of {rows.length} uploaded{failed.length > 0 ? `, ${failed.length} failed` : ""}
            {busy && totalBytes > 200 * 1024 * 1024 ? ` · ${pct}%` : ""}
          </span>
        </div>
      )}
      {failed.length > 0 && (
        <ul className="dz-errors">
          {failed.map((r, i) => (
            <li key={i} role="alert">
              {r.name}: {r.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
