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

  function heart(photo: GridPhoto, className = "icon") {
    if (!toggleFavorite) return null;
    const on = favorites.has(photo.id);
    return (
      <button
        type="button"
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          onHeart(photo.id);
        }}
        aria-pressed={on}
        aria-label={on ? `Remove ${photo.label} from favorites` : `Add ${photo.label} to favorites`}
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

  // Warm the cache for the photos either side of the open one so stepping feels instant.
  useEffect(() => {
    if (open === null || photos.length < 2) return;
    for (const d of [1, -1]) {
      const img = new Image();
      img.src = photos[(open + d + photos.length) % photos.length].largeUrl;
    }
  }, [open, photos]);

  const [touchX, setTouchX] = useState<number | null>(null);

  if (photos.length === 0) return <p className="muted">{emptyText}</p>;

  const current = open === null ? null : photos[open];

  return (
    <>
      {favError && <p role="alert" className="err">{favError}</p>}
      <ul className="ggrid">
        {photos.map((photo, i) => (
          <li key={photo.id} className="gitem">
            <button type="button" className="gopen" onClick={() => setOpen(i)} aria-label={`Open ${photo.label}`}>
              <img src={photo.gridUrl} alt={photo.label} loading="lazy" />
            </button>
            <div className="gover">
              <a href={photo.downloadHref} className="icon" aria-label={`Download ${photo.label}`} title="Download">
                ↓
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
          className="lb"
          onClick={close}
          onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX === null) return;
            const dx = e.changedTouches[0].clientX - touchX;
            if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
            setTouchX(null);
          }}
        >
          <div className="lb-top" onClick={(e) => e.stopPropagation()}>
            <span>
              {open! + 1} / {photos.length}
            </span>
            <button type="button" className="icon" onClick={close} aria-label="Close">
              ✕
            </button>
          </div>
          <img key={current.id} src={current.largeUrl} alt={current.label} onClick={(e) => e.stopPropagation()} />
          {photos.length > 1 && (
            <>
              <button
                type="button"
                className="lb-nav prev"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                aria-label="Previous photo"
              >
                ‹
              </button>
              <button
                type="button"
                className="lb-nav next"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                aria-label="Next photo"
              >
                ›
              </button>
            </>
          )}
          <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
            <a href={current.downloadHref} className="icon wide">
              Download
            </a>
            {heart(current, "icon")}
          </div>
        </div>
      )}
    </>
  );
}
