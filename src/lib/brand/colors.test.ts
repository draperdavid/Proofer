// Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contrast, inkFor, isHexColor } from "./colors.ts";

test("only six-digit hex colors are accepted", () => {
  assert.ok(isHexColor("#2f4b63"));
  assert.ok(isHexColor("#A24B19"));
  for (const bad of ["2f4b63", "#fff", "#2f4b6", "red", "#2f4b63; background:url(x)", null, undefined, ""]) {
    assert.ok(!isHexColor(bad as string), String(bad));
  }
});

test("button text picks the readable ink", () => {
  assert.equal(inkFor("#2f4b63"), "#ffffff");
  assert.equal(inkFor("#f2d06b"), "#141414");
  assert.ok(contrast(inkFor("#a24b19"), "#a24b19") >= 4.5);
});
