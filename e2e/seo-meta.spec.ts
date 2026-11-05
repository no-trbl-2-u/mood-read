// Every route shares one root `<head>` (web.output: "single"), so the share-card tags live once, in the exported
// index.html, not per-route (plan/CRITIQUE.md pass 12). public/index.html is the template Expo fills in
// (scripts/web-export-paths.mjs's sibling customization: `expo export` reads a local public/index.html over its
// own default when one exists).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

const DIST = path.resolve(process.env.E2E_DIST ?? "dist");

test("the exported index.html carries Open Graph and Twitter card tags, each appearing once", () => {
  const html = readFileSync(path.join(DIST, "index.html"), "utf8");
  const ogImageUrl = "https://mood-read.pages.dev/og-image.png";
  for (const tag of [
    '<meta property="og:type" content="website" />',
    '<meta property="og:title" content="Mood Read" />',
    `<meta property="og:image" content="${ogImageUrl}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="Mood Read" />',
    `<meta name="twitter:image" content="${ogImageUrl}" />`,
  ]) {
    expect(html.split(tag).length - 1).toBe(1);
  }
  expect(html).toContain('property="og:description"');
  expect(html).toContain('name="twitter:description"');
  // The build-time placeholders are string-replaced once each; a leftover means a second occurrence swallowed it.
  expect(html).not.toContain("%WEB_TITLE%");
  expect(html).not.toContain("%LANG_ISO_CODE%");
});

test("the og:image / twitter:image URL resolves to a real file in the export", () => {
  expect(existsSync(path.join(DIST, "og-image.png"))).toBe(true);
});
