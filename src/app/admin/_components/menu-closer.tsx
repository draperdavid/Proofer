"use client";

// Dropdowns are plain <details class="menu">. This closes any open one when you
// click somewhere else or press Escape (details stays open on its own).
import { useEffect } from "react";

export function MenuCloser() {
  useEffect(() => {
    const closeAll = (except?: Element | null) => {
      document.querySelectorAll<HTMLDetailsElement>("details.menu[open]").forEach((d) => {
        if (d !== except) d.open = false;
      });
    };
    const onClick = (e: MouseEvent) => {
      const inside = (e.target as Element | null)?.closest("details.menu");
      closeAll(inside);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}
