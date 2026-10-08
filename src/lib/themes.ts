// Color themes for the admin. One source of truth: the CSS custom properties the
// whole app reads (--bg, --t1, --acc, ...) are generated from this file by
// themeCss() and inlined in the root layout, so there is no flash and the values
// can be unit-tested (see themes.test.ts).
//
// Each theme has a light and a dark variant. Which one shows depends on the
// "mode" setting: auto follows the device, or it can be forced.

export const THEME_IDS = ["slide", "print", "avocado"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = "slide"; // used when nothing is saved
export const MODES = ["light", "dark"] as const; // absent = auto (follow the device)
export type Mode = (typeof MODES)[number];

export const THEME_COOKIE = "pf_theme";
export const MODE_COOKIE = "pf_mode";

export const TOKEN_NAMES = [
  "bg", "s0", "s1", "s2", "s3", "bd", "bd-hi", "t1", "t2", "t3",
  "acc", "acc-ink", "acc-soft", "acc-line", "gold", "clay", "amber", "ok", "blue", "scrim", "shadow", "card-sh",
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];
export type Tokens = Record<TokenName, string>;

export type Theme = {
  name: string;
  blurb: string;
  swatches: string[]; // for the picker: background, ink, accent, and two supporting tones
  light: Tokens;
  dark: Tokens;
};

const lightShadow = (rgb: string) => `0 1px 2px rgba(${rgb},.05), 0 6px 20px rgba(${rgb},.06)`;
const darkShadow = "0 1px 0 rgba(255,255,255,.03) inset, 0 8px 24px rgba(0,0,0,.3)";

export const THEMES: Record<ThemeId, Theme> = {
  slide: {
    name: "Faded slide",
    blurb: "Cream stock, burnt orange, olive",
    swatches: ["#F3E9D6", "#2E2118", "#B4551F", "#D9A441", "#7D8A4B"],
    light: {
      bg: "#f3e9d6", s0: "#efe2c8", s1: "#fbf4e4", s2: "#ebddc1", s3: "#e2d2b2",
      bd: "#e1d2b6", "bd-hi": "#cdb994", t1: "#2e2118", t2: "#66543f", t3: "#86725a",
      acc: "#a24b19", "acc-ink": "#fff6e8", "acc-soft": "rgba(162,75,25,.10)", "acc-line": "rgba(162,75,25,.32)",
      gold: "#8f6710", clay: "#9c3324", amber: "#78500b", ok: "#4a6322", blue: "#345f7e",
      scrim: "rgba(40,28,12,.34)", shadow: "rgba(70,45,15,.15)", "card-sh": lightShadow("70,45,15"),
    },
    dark: {
      bg: "#1e1711", s0: "#251c14", s1: "#2a2018", s2: "#33271d", s3: "#3c2e22",
      bd: "#3a2d21", "bd-hi": "#4d3b2b", t1: "#f2e5cc", t2: "#bba886", t3: "#94835f",
      acc: "#e08a4b", "acc-ink": "#2a1708", "acc-soft": "rgba(224,138,75,.13)", "acc-line": "rgba(224,138,75,.36)",
      gold: "#d9b363", clay: "#e6836a", amber: "#e0b46a", ok: "#a9be6a", blue: "#86aec9",
      scrim: "rgba(8,5,2,.66)", shadow: "rgba(0,0,0,.5)", "card-sh": darkShadow,
    },
  },

  print: {
    name: "Drugstore print",
    blurb: "Blush stock, dye teal, mustard",
    swatches: ["#F2E5DB", "#33242A", "#2A7570", "#C98B8B", "#D3A94A"],
    light: {
      bg: "#f2e5db", s0: "#ebdbcf", s1: "#faf0e8", s2: "#e8d6c9", s3: "#dfcabb",
      bd: "#e2cfc4", "bd-hi": "#ccb5a8", t1: "#33242a", t2: "#664f54", t3: "#88727a",
      acc: "#236c67", "acc-ink": "#f2fbf9", "acc-soft": "rgba(35,108,103,.10)", "acc-line": "rgba(35,108,103,.30)",
      gold: "#8f6a10", clay: "#9e3631", amber: "#78500b", ok: "#285f43", blue: "#2f5886",
      scrim: "rgba(45,25,30,.32)", shadow: "rgba(70,40,45,.14)", "card-sh": lightShadow("70,40,45"),
    },
    dark: {
      bg: "#1b1618", s0: "#221b1e", s1: "#271f22", s2: "#30262a", s3: "#392d31",
      bd: "#392d31", "bd-hi": "#4d3d42", t1: "#f3e4dd", t2: "#bfa9ad", t3: "#957f84",
      acc: "#5fb5ad", "acc-ink": "#0f2926", "acc-soft": "rgba(95,181,173,.13)", "acc-line": "rgba(95,181,173,.36)",
      gold: "#d9b363", clay: "#ee8d86", amber: "#e0b46a", ok: "#86cda0", blue: "#8fb4df",
      scrim: "rgba(8,4,6,.66)", shadow: "rgba(0,0,0,.5)", "card-sh": darkShadow,
    },
  },

  avocado: {
    name: "Avocado and amber",
    blurb: "Parchment, avocado, amber",
    swatches: ["#EEE8CF", "#2A2A16", "#5F6E26", "#D69A2E", "#A9784B"],
    light: {
      bg: "#eee8cf", s0: "#e5dfc1", s1: "#f7f2dc", s2: "#e2dcbc", s3: "#d8d1ac",
      bd: "#dad3b1", "bd-hi": "#c4bc93", t1: "#2a2a16", t2: "#58563a", t3: "#79764f",
      acc: "#5f6e26", "acc-ink": "#f7f8e8", "acc-soft": "rgba(95,110,38,.11)", "acc-line": "rgba(95,110,38,.32)",
      gold: "#8f6710", clay: "#9a3c25", amber: "#70500e", ok: "#46612a", blue: "#335878",
      scrim: "rgba(35,35,15,.32)", shadow: "rgba(60,55,20,.14)", "card-sh": lightShadow("60,55,20"),
    },
    dark: {
      bg: "#191a11", s0: "#1f2015", s1: "#23251a", s2: "#2c2e20", s3: "#353828",
      bd: "#33351f", "bd-hi": "#484b2d", t1: "#efebcf", t2: "#b8b48e", t3: "#8f8c68",
      acc: "#a3b456", "acc-ink": "#1a2008", "acc-soft": "rgba(163,180,86,.13)", "acc-line": "rgba(163,180,86,.36)",
      gold: "#d9b363", clay: "#ee8d78", amber: "#e0b46a", ok: "#b3c86a", blue: "#86aec9",
      scrim: "rgba(6,7,3,.66)", shadow: "rgba(0,0,0,.5)", "card-sh": darkShadow,
    },
  },
};

export const isThemeId = (v: unknown): v is ThemeId => typeof v === "string" && (THEME_IDS as readonly string[]).includes(v);
export const isMode = (v: unknown): v is Mode => typeof v === "string" && (MODES as readonly string[]).includes(v);

const decls = (t: Tokens, scheme: "light" | "dark") =>
  `color-scheme:${scheme};` + TOKEN_NAMES.map((n) => `--${n}:${t[n]};`).join("");

// The stylesheet that defines every theme. The default theme applies when there is no data-theme.
// Selection: data-theme picks the palette; data-mode forces light or dark, and
// with no data-mode the device's setting decides.
export function themeCss(): string {
  const out: string[] = [];
  for (const id of THEME_IDS) {
    const t = THEMES[id];
    const light = id === DEFAULT_THEME ? `:root` : `:root[data-theme="${id}"]`;
    out.push(`${light}{${decls(t.light, "light")}}`);
  }
  out.push(
    "@media (prefers-color-scheme:dark){" +
      THEME_IDS.map((id) => {
        const sel = id === DEFAULT_THEME ? `:root:not([data-mode="light"])` : `:root[data-theme="${id}"]:not([data-mode="light"])`;
        return `${sel}{${decls(THEMES[id].dark, "dark")}}`;
      }).join("") +
      "}"
  );
  for (const id of THEME_IDS) {
    const sel = id === DEFAULT_THEME ? `:root[data-mode="dark"]` : `:root[data-theme="${id}"][data-mode="dark"]`;
    out.push(`${sel}{${decls(THEMES[id].dark, "dark")}}`);
  }
  return out.join("\n");
}

// Runs in <head> before first paint: copies the saved choice from the cookies onto <html>.
export function themeBootScript(): string {
  return (
    `(function(){try{var c=document.cookie,h=document.documentElement,` +
    `t=c.match(/(?:^|; )${THEME_COOKIE}=([^;]+)/),m=c.match(/(?:^|; )${MODE_COOKIE}=([^;]+)/);` +
    `if(t&&${JSON.stringify(THEME_IDS)}.indexOf(t[1])>-1)h.setAttribute("data-theme",t[1]);` +
    `if(m&&${JSON.stringify(MODES)}.indexOf(m[1])>-1)h.setAttribute("data-mode",m[1]);}catch(e){}})();`
  );
}
