import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { foodOp } = require(path.join(root, "api/coach-food.js"));

const PUBLIC_ROUTES = [
  ["/api/coach-food-search", "search", "/api/coach-food?op=search"],
  ["/api/coach-food-detail", "detail", "/api/coach-food?op=detail"],
  ["/api/coach-calc-energy", "energy", "/api/coach-food?op=energy"],
  ["/api/coach-calc-macros", "macros", "/api/coach-food?op=macros"],
  ["/api/coach-calc-portions", "portions", "/api/coach-food?op=portions"],
  ["/api/coach-calc-equivalences", "equivalences", "/api/coach-food?op=equivalences"],
];

test("public food URLs and rewritten ops select the same operation", () => {
  for (const [publicPath, op, rewritten] of PUBLIC_ROUTES) {
    assert.equal(foodOp({ url: publicPath }), op, publicPath);
    assert.equal(foodOp({ url: rewritten }), op, rewritten);
  }
  assert.equal(foodOp({ url: "/api/coach-food" }), null);
});

test("the Hobby deployment stays at or below 12 Node functions", () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) files.push(path.relative(root, full).replaceAll("\\", "/"));
    }
  };
  walk(path.join(root, "api"));
  assert.ok(files.length <= 12, files.join(","));
  assert.equal(files.includes("api/coach-food.js"), true);
  for (const [publicPath] of PUBLIC_ROUTES) {
    assert.equal(files.includes(`api${publicPath.slice(4)}.js`), false, publicPath);
  }
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const sources = new Set((vercel.rewrites || []).map((rule) => rule.source));
  for (const [publicPath, , rewritten] of PUBLIC_ROUTES) {
    assert.equal(sources.has(publicPath), true, publicPath);
    assert.equal((vercel.rewrites || []).some((rule) => rule.source === publicPath && rule.destination === rewritten), true);
  }
  assert.ok(vercel.functions["api/coach-food.js"].includeFiles.includes("coach-data.json"));
});
