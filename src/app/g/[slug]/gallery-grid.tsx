"use client";

// Client gallery grid + lightbox (Phase 5.4). All URLs arrive presigned from
// the server; this component only decides which one to show. Downloads go
// through /g/[slug]/download/[id], which re-checks access before signing.
// Hearts (5.6) flip immediately and roll back if the server says no.
import { useCallback, useEffect, useState } from "react";

export type GridPhoto = {
  id: string;
  label: string;
  gridUrl: string;
  largeUrl: string;
  downloadHref: string;
  favorited: boolean;
};

type ToggleFavorite = (assetId: string) => Promise<{ ok: true; favorited: boolean } | { ok: false; error: string }>;

export function GalleryGrid({
  photos,
  toggleFavorite,
  emptyText = "No photos in this set yet.",
}: {
  photos: GridPhoto[];
  toggleFavorite: ToggleFavorite | null;
  emptyText?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [favorites, setFavorites] = useState(() => new Set(photos.filter((p) => p.favorited).map((p) => p.id)));
  const [favError, setFavError] = useState<string | null>(null);

  const flip = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onHeart = useCallback(
    async (id: string) => {
      if (!toggleFavorite) return;
      setFavError(null);
      flip(id);
      try {
        const res = await toggleFavorite(id);
        if (!res.ok) {
          flip(id);
          setFavError(res.error);
        } else {
          setFavorites((prev) => {
            const next = new Set(prev);
            if (res.favorited) next.add(id);
            else next.delete(id);
            return next;
          });
        }
      } catch {
        flip(id);
        setFavError("Couldn't save that favorite. Please try again.");
      }
    },
    [toggleFavorite, flip]
  );

  function heart(photo: GridPhoto, color?: string) {
    if (!toggleFavorite) return null;
    const on = favorites.has(photo.id);
    return (
      <button
        type="button"
        onClick={() => onHeart(photo.id)}
        aria-pressed={on}
        aria-label={on ? `Remove ${photo.label} from favorites` : `Add ${photo.label} to favorites`}
        style={{ background: "none", border: 0, cursor: "pointer", fontSize: "1.1rem", color: color ?? "inherit" }}
      >
        {on ? "♥" : "♡"}
      </button>
    );
  }

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

  if (photos.length === 0) return <p>{emptyText}</p>;

  const current = open === null ? null : photos[open];

  return (
    <>
      {favError && <p role="alert">{favError}</p>}
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <a href={photo.downloadHref} style={{ fontSize: "0.8rem" }}>
                Download
              </a>
              {heart(photo)}
            </div>
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
            {heart(current, "#fff")}
            <button type="button" onClick={close} aria-label="Close">
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
