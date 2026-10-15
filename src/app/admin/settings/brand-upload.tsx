"use client";

// Brand image picker (9.2): presigned URL from the server, PUT straight to
// R2, then the server saves it. Same flow as product images.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveBrandImage, startBrandUpload } from "./brand-actions";

export function BrandImageUpload({ kind, accept }: { kind: string; accept: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const start = await startBrandUpload(kind, { type: file.type, size: file.size });
      if (!start.ok) throw new Error(start.error);
      const res = await fetch(start.url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const saved = await saveBrandImage(kind, start.key);
      if (!saved.ok) throw new Error(saved.error ?? "Couldn't save the image");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="brand-upload">
      <label className={`btn sm${busy ? " disabled" : ""}`}>
        {busy ? "Uploading…" : "Upload"}
        <input
          className="sr-only"
          type="file"
          accept={accept}
          disabled={busy}
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (f) void upload(f);
          }}
        />
      </label>
      {error && <span className="err small"> {error}</span>}
    </span>
  );
}
