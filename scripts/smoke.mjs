/**
 * @file scripts/smoke.mjs
 * @desc Imports the built package the way apps will (dist/, zod as a peer), round-trips one key
 *       per version, and loads each subpath entry point on its own. Run by `bun run test:dist`
 *       after a build.
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Sep 23, 2026
 * @modified Mon Sep 28, 2026
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { hasBlockedLanguage } from "../dist/content-filter.js";
import * as main from "../dist/index.js";

const { decodePackKey, encodePackKey, PackKeyError, parsePoolText } = main;

const pools = [
  { name: "Quals", slots: [{ mod: "NM", index: 1, beatmapId: 129891 }] },
  {
    name: "Finals",
    slots: [{ mod: "RC", index: 1, beatmapId: 75 }],
    buckets: [
      { code: "NM" },
      { code: "HD" },
      { code: "HR" },
      { code: "DT" },
      { code: "FM" },
      { code: "RC", color: 2 },
      { code: "TB" },
    ],
  },
  {
    name: "Mods",
    slots: [{ mod: "EZ", index: 1, beatmapId: 4 }],
    buckets: [
      { code: "NM" },
      { code: "HD" },
      { code: "HR" },
      { code: "DT" },
      { code: "FM" },
      { code: "EZ", color: 0, mods: { kind: "forced", set: ["EZ"] } },
      { code: "TB" },
    ],
  },
];
for (const [index, pool] of pools.entries()) {
  const key = encodePackKey(pool);
  assert.ok(key.startsWith(`pk${index + 1}.`), key);
  assert.deepEqual(decodePackKey(key), pool);
}
assert.throws(() => decodePackKey("pk9.AAAA"), PackKeyError);
assert.deepEqual(parsePoolText("NM1 129891", { slots: [] }).slots, [
  { mod: "NM", index: 1, beatmapId: 129891 },
]);
assert.equal(hasBlockedLanguage("heil hitler"), true);
assert.equal(hasBlockedLanguage("Scunthorpe Cup"), false);
assert.equal("hasBlockedLanguage" in main, false, "the main entry has no word list");
for (const entry of ["index", "content-filter"]) {
  assert.ok(existsSync(new URL(`../dist/${entry}.d.ts`, import.meta.url)), `${entry} types built`);
}
assert.ok(existsSync(new URL("../docs/pack-key.md", import.meta.url)), "key format doc ships");
console.log("smoke: ok");
