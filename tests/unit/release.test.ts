import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

// `npm run package` reads every store asset named in scripts/release-files.mjs; a name left over from a
// renamed screenshot made the packaging step fail with ENOENT.
it("every store asset the release scripts expect exists in the repository", async () => {
  const source = await readFile("scripts/release-files.mjs", "utf8");
  const list = /storeAssetNames\s*=\s*\[([\s\S]*?)\]/.exec(source)?.[1] ?? "";
  const names = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  expect(names.length).toBeGreaterThan(5);
  const missing = names.filter((n) => !existsSync(`docs/store/assets/${n}`));
  expect(missing).toEqual([]);
});
