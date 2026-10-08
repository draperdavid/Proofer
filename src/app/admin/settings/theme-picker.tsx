"use client";

// Appearance settings: pick a color theme and a light/dark mode. The choice
// applies immediately and is saved in a cookie on this device; the root layout's
// boot script re-applies it before first paint on every page load.
import { useEffect, useState } from "react";
import { DEFAULT_THEME, MODE_COOKIE, THEMES, THEME_COOKIE, THEME_IDS, isMode, isThemeId, type ThemeId } from "@/lib/themes";

type ModeChoice = "auto" | "light" | "dark";
const YEAR = 60 * 60 * 24 * 365;

function save(name: string, value: string | null) {
  document.cookie =
    value === null
      ? `${name}=; path=/; max-age=0; samesite=lax`
      : `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}

export function ThemePicker() {
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [mode, setMode] = useState<ModeChoice>("auto");

  // Start from whatever the boot script already put on <html>.
  useEffect(() => {
    const el = document.documentElement;
    const t = el.getAttribute("data-theme");
    const m = el.getAttribute("data-mode");
    if (isThemeId(t)) setTheme(t);
    if (isMode(m)) setMode(m);
  }, []);

  function pickTheme(id: ThemeId) {
    setTheme(id);
    document.documentElement.setAttribute("data-theme", id);
    save(THEME_COOKIE, id);
  }

  function pickMode(m: ModeChoice) {
    setMode(m);
    if (m === "auto") {
      document.documentElement.removeAttribute("data-mode");
      save(MODE_COOKIE, null);
    } else {
      document.documentElement.setAttribute("data-mode", m);
      save(MODE_COOKIE, m);
    }
  }

  return (
    <>
      <h3>Theme</h3>
      <div className="themegrid" role="radiogroup" aria-label="Color theme">
        {THEME_IDS.map((id) => {
          const t = THEMES[id];
          const on = theme === id;
          return (
            <button key={id} type="button" role="radio" aria-checked={on} className={`themecard${on ? " on" : ""}`} onClick={() => pickTheme(id)}>
              <span className="swatches" aria-hidden="true">
                {t.swatches.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              <span className="tname">{t.name}</span>
              <span className="tblurb">{t.blurb}</span>
            </button>
          );
        })}
      </div>

      <h3>Mode</h3>
      <div className="seg" role="radiogroup" aria-label="Light or dark">
        {(["auto", "light", "dark"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "on" : undefined} onClick={() => pickMode(m)}>
            {m === "auto" ? "Match device" : m === "light" ? "Light" : "Dark"}
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: "var(--sp-3)" }}>
        Saved on this device. Your phone and your computer each keep their own choice. Pages your clients see (galleries, forms) use the default theme.
      </p>
    </>
  );
}
