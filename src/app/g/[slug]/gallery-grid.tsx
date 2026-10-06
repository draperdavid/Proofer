"use client";

// Client gallery grid + lightbox (Phase 5.4). All URLs arrive presigned from
// the server; this component only decides which one to show. Downloads go
// through /g/[slug]/download/[id], which re-checks access before signing.
import { useCallback, useEffect, useState } from "react";

export type GridPhoto = {
  id: string;
  label: string;
  gridUrl: string;
  largeUrl: string;
  downloadHref: string;
};

export function GalleryGrid({ photos }: { photos: GridPhoto[] }) {
  const [open, setOpen] = useState<number | null>(null);

  const close = useCallback(() => setOpen(null), []);
  const step = useCallback(
    (delta: number) => setOpen((i) => (i === null ? i : (i + delta + photos.length) % photos.length)),
    [photos.length]
  );

  useEffect(() => {
    if (open === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, step]);

  if (photos.length === 0) return <p>No photos in this set yet.</p>;

  const current = open === null ? null : photos[open];

  return (
    <>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(12rem, 1fr))",
          gap: "0.5rem",
        }}
      >
        {photos.map((photo, i) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              aria-label={`Open ${photo.label}`}
              style={{ padding: 0, border: 0, background: "none", cursor: "zoom-in", display: "block", width: "100%" }}
            >
              <img
                src={photo.gridUrl}
                alt={photo.label}
                loading="lazy"
                style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }}
              />
            </button>
            <a href={photo.downloadHref} style={{ fontSize: "0.8rem" }}>
              Download
            </a>
          </li>
        ))}
      </ul>

      {current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.label}
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.92)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            zIndex: 1000,
            color: "#fff",
          }}
        >
          <img
            src={current.largeUrl}
            alt={current.label}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "92vw", maxHeight: "82vh", objectFit: "contain" }}
          />
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => step(-1)} disabled={photos.length < 2} aria-label="Previous photo">
              ←
            </button>
            <span>
              {open! + 1} / {photos.length}
            </span>
            <button type="button" onClick={() => step(1)} disabled={photos.length < 2} aria-label="Next photo">
              →
            </button>
            <a href={current.downloadHref} style={{ color: "#fff" }}>
              Download
            </a>
            <button type="button" onClick={close} aria-label="Close">
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
