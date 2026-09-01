import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders production metadata and social preview", async () => {
  const html = await readFile(
    new URL("../.next/server/app/index.html", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.match(html, /<title>Agent Governance Portal<\/title>/i);
  assert.match(html, /<meta(?=[^>]*property=["']og:image["'])(?=[^>]*content=["'][^"']*og\.png)[^>]*>/i);
  assert.match(html, /<meta(?=[^>]*name=["']twitter:card["'])(?=[^>]*content=["']summary_large_image["'])[^>]*>/i);
});
