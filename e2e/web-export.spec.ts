// The web export holds nothing under a node_modules path (Cloudflare Pages never uploads one, so any asset a package
// ships would 404 on mood-read.pages.dev while working locally): no file, no asset URL in the bundle, and every
// bundled /assets/ URL names a file the export has. scripts/web-export-paths.mjs does the move after `expo export`.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

const DIST = path.resolve(process.env.E2E_DIST ?? "dist");

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

test("no exported file sits under node_modules", () => {
  const bad = walk(DIST).filter((f) => path.relative(DIST, f).split(path.sep).includes("node_modules"));
  expect(bad).toEqual([]);
});

test("no bundled asset URL names node_modules, and each /assets/ URL has its file", () => {
  const js = walk(DIST).filter((f) => f.endsWith(".js") || f.endsWith(".html"));
  const named: string[] = [];
  const missing: string[] = [];
  for (const file of js) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/["'`](\/assets\/[^"'`\s?#]+\.[A-Za-z0-9]+)["'`]/g)) {
      const url = m[1];
      if (url.includes("node_modules")) named.push(url);
      else if (!existsSync(path.join(DIST, decodeURIComponent(url)))) missing.push(url);
    }
  }
  expect(named).toEqual([]);
  expect(missing).toEqual([]);
});

test("the shelf requests no asset under node_modules", async ({ page }) => {
  const seen: string[] = [];
  page.on("request", (req) => seen.push(req.url()));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.filter((u) => u.includes("node_modules"))).toEqual([]);
});
