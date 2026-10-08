// Run with `npm test`. Guards every theme (light and dark) for readability.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THEME, THEMES, THEME_IDS, TOKEN_NAMES, isMode, isThemeId, themeBootScript, themeCss, type Tokens } from "./themes.ts";

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};
const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = (c: [number, number, number]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a: [number, number, number], b: [number, number, number]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// What a status pill actually paints: its text color over (14% of that color on the surface).
const mix = (fg: [number, number, number], bg: [number, number, number], a: number): [number, number, number] =>
  [0, 1, 2].map((i) => Math.round(fg[i] * a + bg[i] * (1 - a))) as [number, number, number];

const variants = THEME_IDS.flatMap((id) => [
  [id, "light", THEMES[id].light],
  [id, "dark", THEMES[id].dark],
] as [string, string, Tokens][]);

for (const [id, mode, t] of variants) {
  const name = `${id}/${mode}`;

  test(`${name}: every token is defined`, () => {
    for (const n of TOKEN_NAMES) assert.ok(t[n] && t[n].length > 0, `${name} missing ${n}`);
  });

  test(`${name}: body text, secondary text and hints are readable`, () => {
    for (const surface of ["bg", "s1"] as const) {
      assert.ok(ratio(rgb(t.t1), rgb(t[surface])) >= 7, `${name} t1 on ${surface}`);
      assert.ok(ratio(rgb(t.t2), rgb(t[surface])) >= 4.5, `${name} t2 on ${surface} = ${ratio(rgb(t.t2), rgb(t[surface])).toFixed(2)}`);
    }
    assert.ok(ratio(rgb(t.t3), rgb(t.bg)) >= 3, `${name} t3 (hints) on bg = ${ratio(rgb(t.t3), rgb(t.bg)).toFixed(2)}`);
  });

  test(`${name}: accent works as button fill and as link text`, () => {
    assert.ok(ratio(rgb(t["acc-ink"]), rgb(t.acc)) >= 4.5, `${name} button text on accent = ${ratio(rgb(t["acc-ink"]), rgb(t.acc)).toFixed(2)}`);
    for (const surface of ["bg", "s1"] as const) {
      assert.ok(ratio(rgb(t.acc), rgb(t[surface])) >= 4.5, `${name} accent link on ${surface} = ${ratio(rgb(t.acc), rgb(t[surface])).toFixed(2)}`);
    }
  });

  test(`${name}: error text and status pills are readable`, () => {
    assert.ok(ratio(rgb(t.clay), rgb(t.bg)) >= 4.5, `${name} error text = ${ratio(rgb(t.clay), rgb(t.bg)).toFixed(2)}`);
    for (const c of ["ok", "amber", "blue", "clay", "t2"] as const) {
      const fg = rgb(t[c]);
      const pillBg = mix(fg, rgb(t.s1), 0.14);
      assert.ok(ratio(fg, pillBg) >= 4.5, `${name} ${c} pill on s1 = ${ratio(fg, pillBg).toFixed(2)}`);
      const pillOnBg = mix(fg, rgb(t.bg), 0.14);
      assert.ok(ratio(fg, pillOnBg) >= 4.5, `${name} ${c} pill on bg = ${ratio(fg, pillOnBg).toFixed(2)}`);
    }
  });
}

test("layers step in a sensible order: borders are visible against the page", () => {
  for (const [id, mode, t] of variants) {
    assert.ok(ratio(rgb(t["bd-hi"]), rgb(t.bg)) >= 1.15, `${id}/${mode} strong border vs bg`);
  }
});

test("themeCss defines every theme, with a forced-dark and a device-dark rule", () => {
  const css = themeCss();
  for (const id of THEME_IDS) {
    if (id !== DEFAULT_THEME) assert.ok(css.includes(`[data-theme="${id}"]{`), `${id} light`);
    assert.ok(css.includes(id === DEFAULT_THEME ? `:root[data-mode="dark"]{` : `[data-theme="${id}"][data-mode="dark"]{`), `${id} forced dark`);
    assert.ok(css.includes(id === DEFAULT_THEME ? `:root:not([data-mode="light"]){` : `[data-theme="${id}"]:not([data-mode="light"]){`), `${id} device dark`);
  }
  assert.ok(css.includes("@media (prefers-color-scheme:dark)"));
  // Every declared property is a token we know about.
  for (const m of css.matchAll(/--([a-z0-9-]+):/g)) assert.ok((TOKEN_NAMES as readonly string[]).includes(m[1]), `unknown token --${m[1]}`);
});

test("the boot script only accepts known themes and modes", () => {
  const s = themeBootScript();
  for (const id of THEME_IDS) assert.ok(s.includes(`"${id}"`));
  assert.ok(s.includes("pf_theme") && s.includes("pf_mode"));
  assert.ok(isThemeId("slide") && !isThemeId("neon") && !isThemeId(undefined));
  assert.ok(isMode("dark") && isMode("light") && !isMode("auto"));
});
