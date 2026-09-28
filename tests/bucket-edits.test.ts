/**
 * @file tests/bucket-edits.test.ts
 * @desc Every bucket edit (add, rename, recolor, move, remove, set mods), including refusals.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Mon Sep 28, 2026
 */

import { describe, expect, it } from "vitest";
import {
  addBucket,
  addBuckets,
  moveBucket,
  recolorBucket,
  removeBucket,
  renameBucket,
  setBucketMods,
  withBuckets,
} from "../src/bucket-edits.js";
import { bucketsOf, findBucket, insertBeforeTb } from "../src/buckets.js";
import { decodePackKey, encodePackKey } from "../src/key.js";
import { NO_MODS } from "../src/mods.js";
import type { Pool } from "../src/schema.js";

const codes = (pack: Pool) => bucketsOf(pack).map((e) => e.code);
const base: Pool = { name: "p", slots: [{ mod: "NM", index: 1, beatmapId: 1 }] };
const ez = addBucket(base, "EZ", 0);

describe("bucket edits", () => {
  it("adds before TB, wherever TB is", () => {
    expect(codes(ez)).toEqual(["NM", "HD", "HR", "DT", "FM", "EZ", "TB"]);
    const tbFirst = moveBucket(base, "TB", 0);
    expect(codes(addBucket(tbFirst, "EZ", 0))).toEqual(["EZ", "TB", "NM", "HD", "HR", "DT", "FM"]);
    expect(insertBeforeTb([{ code: "NM" }], { code: "X", color: 1 })).toEqual([
      { code: "NM" },
      { code: "X", color: 1 },
    ]);
  });

  it("refuses bad codes and bad colors", () => {
    expect(addBucket(base, "nm", 0)).toBe(base);
    expect(addBucket(base, "EZ", 10)).toBe(base);
    expect(addBucket(base, "EZ", 1.5)).toBe(base);
  });

  it("adds several at once", () => {
    expect(
      codes(
        addBuckets(base, [
          { code: "EZ", color: 0 },
          { code: "HT", color: 1 },
        ]),
      ),
    ).toEqual(["NM", "HD", "HR", "DT", "FM", "EZ", "HT", "TB"]);
  });

  it("renames a custom bucket and every slot in it", () => {
    const withMap: Pool = { ...ez, slots: [...ez.slots, { mod: "EZ", index: 1, beatmapId: 2 }] };
    const renamed = renameBucket(withMap, "EZ", "Easy");
    expect(findBucket(bucketsOf(renamed), "Easy")).toEqual({ code: "Easy", color: 0 });
    expect(renamed.slots).toContainEqual({ mod: "Easy", index: 1, beatmapId: 2 });
    expect(renamed.slots.some((s) => s.mod === "EZ")).toBe(false);
  });

  it("refuses renaming built-ins, unknown buckets, clashes, and no-op renames", () => {
    expect(renameBucket(ez, "NM", "Nomod")).toBe(ez);
    expect(renameBucket(ez, "HT", "X")).toBe(ez);
    expect(renameBucket(ez, "EZ", "hd")).toBe(ez);
    expect(renameBucket(ez, "EZ", "EZ")).toBe(ez);
  });

  it("recolors customs only", () => {
    expect(findBucket(bucketsOf(recolorBucket(ez, "EZ", 4)), "EZ")).toEqual({
      code: "EZ",
      color: 4,
    });
    expect(recolorBucket(ez, "NM", 4)).toBe(ez);
    expect(recolorBucket(ez, "EZ", 12)).toBe(ez);
  });

  it("moves any bucket to any position", () => {
    expect(codes(moveBucket(ez, "EZ", 2))).toEqual(["NM", "HD", "EZ", "HR", "DT", "FM", "TB"]);
    expect(codes(moveBucket(ez, "NM", 6))).toEqual(["HD", "HR", "DT", "FM", "EZ", "TB", "NM"]);
    expect(moveBucket(ez, "EZ", 7)).toBe(ez);
    expect(moveBucket(ez, "EZ", -1)).toBe(ez);
    expect(moveBucket(ez, "EZ", 5)).toBe(ez);
    expect(moveBucket(ez, "HT", 0)).toBe(ez);
  });

  it("keeps slots in pool order when a bucket moves", () => {
    const pool: Pool = {
      name: "p",
      slots: [
        { mod: "NM", index: 1, beatmapId: 1 },
        { mod: "HD", index: 1, beatmapId: 2 },
      ],
    };
    const moved = moveBucket(pool, "HD", 0);
    expect(moved.slots.map((s) => s.mod)).toEqual(["HD", "NM"]);
    expect(decodePackKey(encodePackKey(moved))).toEqual(moved);
    const list = [...bucketsOf(pool)].reverse();
    expect(withBuckets(pool, list).slots.map((s) => s.mod)).toEqual(["HD", "NM"]);
  });

  it("keeps a renamed bucket's slots where they were", () => {
    const pool: Pool = {
      name: "p",
      slots: [
        { mod: "RC", index: 1, beatmapId: 1 },
        { mod: "TB", index: 1, beatmapId: 2 },
      ],
      buckets: [...bucketsOf(base).slice(0, 5), { code: "RC", color: 0 }, { code: "TB" }],
    };
    const renamed = renameBucket(pool, "RC", "Rice");
    expect(renamed.slots).toEqual([
      { mod: "Rice", index: 1, beatmapId: 1 },
      { mod: "TB", index: 1, beatmapId: 2 },
    ]);
  });

  it("refuses a code that is another slot's code plus a number", () => {
    expect(addBucket(base, "NM1", 0)).toBe(base);
    expect(renameBucket(ez, "EZ", "HD2")).toBe(ez);
  });

  it("dropping the list back to default order removes it", () => {
    const moved = moveBucket(base, "TB", 0);
    expect(moved.buckets).toBeDefined();
    expect(moveBucket(moved, "TB", 5).buckets).toBeUndefined();
  });

  it("removes an empty custom bucket, never one with maps, never a built-in", () => {
    expect(removeBucket(ez, "EZ").buckets).toBeUndefined();
    const withMap: Pool = { ...ez, slots: [{ mod: "EZ", index: 1, beatmapId: 2 }] };
    expect(removeBucket(withMap, "EZ")).toBe(withMap);
    expect(removeBucket(ez, "TB")).toBe(ez);
  });
});

describe("setBucketMods", () => {
  const forcedEz = setBucketMods(ez, "EZ", { kind: "forced", set: ["EZ"] });
  const ezEntry = (pack: Pool) => bucketsOf(pack).find((e) => e.code === "EZ");

  it("sets forced mods and freemod on a custom slot", () => {
    expect(ezEntry(forcedEz)).toEqual({
      code: "EZ",
      color: 0,
      mods: { kind: "forced", set: ["EZ"] },
    });
    expect(ezEntry(setBucketMods(ez, "EZ", { kind: "free" }))).toEqual({
      code: "EZ",
      color: 0,
      mods: { kind: "free" },
    });
  });

  it("clears the setting with no mods", () => {
    expect(ezEntry(setBucketMods(forcedEz, "EZ", NO_MODS))).toEqual({ code: "EZ", color: 0 });
  });

  it("keeps the slots and every other bucket", () => {
    expect(forcedEz.slots).toBe(ez.slots);
    expect(codes(forcedEz)).toEqual(codes(ez));
  });

  it("refuses built-ins, unknown codes, and invalid sets", () => {
    expect(setBucketMods(ez, "HD", { kind: "free" })).toBe(ez);
    expect(setBucketMods(ez, "ZZ", { kind: "free" })).toBe(ez);
    expect(setBucketMods(ez, "EZ", { kind: "forced", set: ["EZ", "HR"] })).toBe(ez);
    expect(setBucketMods(ez, "EZ", { kind: "forced", set: [] })).toBe(ez);
  });

  it("keeps mods when the slot is renamed, recolored, or moved", () => {
    const renamed = renameBucket(forcedEz, "EZ", "Easy");
    expect(bucketsOf(renamed).find((e) => e.code === "Easy")).toEqual({
      code: "Easy",
      color: 0,
      mods: { kind: "forced", set: ["EZ"] },
    });
    expect(ezEntry(recolorBucket(forcedEz, "EZ", 4))).toEqual({
      code: "EZ",
      color: 4,
      mods: { kind: "forced", set: ["EZ"] },
    });
    expect(ezEntry(moveBucket(forcedEz, "EZ", 0))).toEqual(ezEntry(forcedEz));
  });
});
