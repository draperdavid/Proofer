"use client";

// Product image picker (7.2): asks the server for a presigned URL, PUTs the
// file straight to R2, then tells the server to save it on the product.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveProductImage, startProductImageUpload } from "./image-actions";

export function ProductImageUpload({ productId }: { productId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const start = await startProductImageUpload(productId, { type: file.type, size: file.size });
      if (!start.ok) throw new Error(start.error);
      const res = await fetch(start.url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const saved = await saveProductImage(productId, start.key);
      if (!saved.ok) throw new Error(saved.error ?? "Couldn't save the image");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      {busy && <span className="hint"> Uploading…</span>}
      {error && <p className="err">{error}</p>}
    </div>
  );
}
