/**
 * @file tests/exports.test.ts
 * @desc The public surface of every entry point: exactly these runtime exports, so an accidental
 *       export or removal shows up in review as a semver question; package.json maps each entry
 *       point, and the main entry never loads the content filter's word list.
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Sep 23, 2026
 * @modified Mon Sep 28, 2026
 */

import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import * as contentFilter from "../src/content-filter.js";
import * as api from "../src/index.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

/** Every src/ module a module loads at runtime, itself included (type-only imports aside). */
const loads = (module: string, seen = new Set<string>()): Set<string> => {
  if (seen.has(module)) return seen;
  seen.add(module);
  const source = readFileSync(new URL(`../src/${module}.ts`, import.meta.url), "utf8");
  for (const [, next] of source.matchAll(
    /^(?:import|export) (?!type )[^;]*?from "\.\/([\w-]+)\.js";/gms,
  )) {
    if (next) loads(next, seen);
  }
  return seen;
};

it("exports the documented runtime API", () => {
  expect(Object.keys(api).sort()).toMatchInlineSnapshot(`
    [
      "BEATMAP_REF_MESSAGES",
      "BUCKET_CODE_MESSAGES",
      "BUCKET_CODE_PATTERN",
      "DEFAULT_BUCKETS",
      "MAX_BUCKET_CODE_LENGTH",
      "MAX_CUSTOM_BUCKETS",
      "MAX_FORCED_MODS",
      "MAX_NAME_LENGTH",
      "MAX_SLOTS",
      "MAX_SLOT_INDEX",
      "MOD_ACRONYMS",
      "MOD_BUCKETS",
      "MOD_BUCKET_NAMES",
      "MOD_SET_MESSAGES",
      "NO_MODS",
      "NO_SLOT_NAME",
      "PACK_KEY_ERROR_MESSAGES",
      "PACK_KEY_VERSIONS",
      "PALETTE",
      "PALETTE_SIZE",
      "POOL_LINE_HELP",
      "PackKeyError",
      "RULESETS",
      "addBucket",
      "addBuckets",
      "addSlot",
      "beatmapIdSchema",
      "bitmaskToMods",
      "bucketCodeSchema",
      "bucketEntrySchema",
      "bucketName",
      "bucketOptionLabel",
      "bucketsOf",
      "builtInBucketSchema",
      "canonicalBuckets",
      "changesStarRating",
      "checkBucketCode",
      "checkPoolBuckets",
      "customBucketSchema",
      "decodePackKey",
      "displayPoolName",
      "encodePackKey",
      "extractPackKey",
      "findBucket",
      "freemodSets",
      "insertBeforeTb",
      "isCustomBucket",
      "isModAcronym",
      "isModBucket",
      "matchBucketCode",
      "mergeSlots",
      "modAcronymSchema",
      "modBlockedReason",
      "modSetProblem",
      "modSetsFor",
      "modsLabel",
      "modsToBitmask",
      "moveBucket",
      "moveSlot",
      "nextFreeColor",
      "nextSlotIndex",
      "paletteColorSchema",
      "parseBeatmapRef",
      "parsePoolText",
      "planMerge",
      "poolDraftSchema",
      "poolFields",
      "poolSchema",
      "poolSlotSchema",
      "ratingMods",
      "recolorBucket",
      "removeBucket",
      "removeSlot",
      "renameBucket",
      "setBucketMods",
      "slotKey",
      "slotLabel",
      "slotModsFor",
      "slotModsSummary",
      "slotTitle",
      "sortSlots",
      "speedRate",
      "storedSlotModsSchema",
      "toggleMod",
      "withBuckets",
    ]
  `);
});

it("exports the content filter from its own entry point", () => {
  expect(Object.keys(contentFilter).sort()).toEqual(["hasBlockedLanguage"]);
});

it("never loads the content filter's word list from the main entry point", () => {
  expect(loads("index").has("bucket-edits")).toBe(true);
  expect(loads("index").has("content-filter")).toBe(false);
});

it("maps every entry point in package.json", () => {
  expect(Object.keys(pkg.exports)).toEqual([".", "./content-filter", "./package.json"]);
  expect(pkg.exports["./content-filter"]).toEqual({
    types: "./dist/content-filter.d.ts",
    default: "./dist/content-filter.js",
  });
});
