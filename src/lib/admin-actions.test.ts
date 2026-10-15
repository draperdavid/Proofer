// Run with `npm test`. Launch hardening (9.4): every server action under
// /admin must call requireAdmin() as its first statement, so a missed check
// can't slip in. Middleware guards /admin pages, but server actions can be
// invoked directly by id, which is why each one re-checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [p] : [];
  });
}

const serverFiles = files("src/app/admin").filter((p) => /^\s*["']use server["'];/.test(readFileSync(p, "utf8")));

// The body starts at the first "{" that ends a line (a return type like
// Promise<{ ok: boolean }> has its braces mid-line). Its first statement must
// be `await requireAdmin();`, optionally kept in a const.
const ACTION = /export\s+async\s+function\s+(\w+)[\s\S]*?\{\r?\n\s*([^\r\n]*)/g;
const FIRST = /^(const \w+ = )?await requireAdmin\(\);/;

test("there are admin server action files to check", () => {
  assert.ok(serverFiles.length >= 10, `found ${serverFiles.length}`);
});

for (const file of serverFiles) {
  const label = file.split(/[\\/]/).join("/");
  test(`every exported action in ${label} calls requireAdmin() first`, () => {
    const src = readFileSync(file, "utf8");
    const missing: string[] = [];
    let count = 0;
    for (const m of src.matchAll(ACTION)) {
      count += 1;
      if (!FIRST.test(m[2].trim())) missing.push(m[1]);
    }
    assert.ok(count > 0, "no exported async functions found");
    assert.deepEqual(missing, [], `actions without requireAdmin() first: ${missing.join(", ")}`);
  });
}
