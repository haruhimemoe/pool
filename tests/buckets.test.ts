/**
 * @file tests/buckets.test.ts
 * @desc Bucket helpers: canonical lists, lookups, labels, code validation, colors, and every
 *       bucket edit (add, rename, recolor, move, remove), including refusals.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Wed Sep 23, 2026
 */

import { describe, expect, it } from "vitest";
import {
  addBucket,
  addBuckets,
  BUCKET_CODE_MESSAGES,
  bucketName,
  bucketOptionLabel,
  bucketsOf,
  canonicalBuckets,
  checkBucketCode,
  DEFAULT_BUCKETS,
  findBucket,
  insertBeforeTb,
  isCustomBucket,
  matchBucketCode,
  moveBucket,
  nextFreeColor,
  recolorBucket,
  removeBucket,
  renameBucket,
  setBucketMods,
  slotLabel,
  slotTitle,
  withBuckets,
} from "../src/buckets.js";
import { NO_MODS } from "../src/mods.js";
import type { BucketEntry, Pool } from "../src/schema.js";

const codes = (pack: Pool) => bucketsOf(pack).map((e) => e.code);
const base: Pool = { name: "p", slots: [{ mod: "NM", index: 1, beatmapId: 1 }] };
const ez = addBucket(base, "EZ", 0);

describe("bucket lists", () => {
  it("defaults to the six built-ins", () => {
    expect(codes(base)).toEqual(["NM", "HD", "HR", "DT", "FM", "TB"]);
    expect(DEFAULT_BUCKETS.every((e) => !isCustomBucket(e))).toBe(true);
  });

  it("omits the list when it equals the default", () => {
    expect(canonicalBuckets(DEFAULT_BUCKETS)).toBeUndefined();
    expect(canonicalBuckets([...DEFAULT_BUCKETS].reverse())).toHaveLength(6);
    expect(withBuckets(ez, DEFAULT_BUCKETS)).toEqual(base);
    expect("buckets" in withBuckets(ez, DEFAULT_BUCKETS)).toBe(false);
  });

  it("finds exact codes and matches pasted codes in any case", () => {
    const list = bucketsOf(ez);
    expect(findBucket(list, "EZ")).toEqual({ code: "EZ", color: 0 });
    expect(findBucket(list, "ez")).toBeUndefined();
    expect(matchBucketCode(list, "ez")).toBe("EZ");
    expect(matchBucketCode(list, "nm")).toBe("NM");
    expect(matchBucketCode(list, "HT")).toBeNull();
  });
});

describe("labels", () => {
  it.each([
    [{ mod: "NM", index: 1 }, "NM1", "NM1"],
    [{ mod: "Speed", index: 2 }, "Speed2", "Speed2"],
    [{ mod: "RC1", index: 2 }, "RC1 2", "RC1 2"],
    [{ mod: "Ü２", index: 3 }, "Ü２ 3", "Ü２ 3"],
    [{ mod: null, index: 4 }, "4", "No slot 4"],
  ])("%o → %j / %j", (slot, label, title) => {
    expect(slotLabel(slot)).toBe(label);
    expect(slotTitle(slot)).toBe(title);
  });

  it("names buckets for headings, tooltips, and select options", () => {
    expect(bucketName(null)).toBe("No slot");
    expect(bucketName({ code: "HD" })).toBe("Hidden");
    expect(bucketName({ code: "EZ", color: 0 })).toBe("EZ");
    expect(bucketOptionLabel({ code: "HD" })).toBe("HD · Hidden");
    expect(bucketOptionLabel({ code: "EZ", color: 0 })).toBe("EZ");
  });
});

describe("checkBucketCode", () => {
  const list = bucketsOf(ez);
  it.each([
    ["", "empty"],
    ["x".repeat(13), "long"],
    ["E Z", "chars"],
    ["E-Z", "chars"],
    ["hd", "builtIn"],
    ["ez", "taken"],
  ] as const)("%j → %s", (code, error) => {
    expect(checkBucketCode(list, code)).toBe(error);
    expect(BUCKET_CODE_MESSAGES[error].length).toBeGreaterThan(0);
  });

  it("accepts unicode letters and digits up to 12 characters", () => {
    expect(checkBucketCode(list, "難しい")).toBeNull();
    expect(checkBucketCode(list, "🌸")).toBe("chars");
    expect(checkBucketCode(list, "x".repeat(12))).toBeNull();
  });

  it("refuses a ninth custom bucket but still allows renames", () => {
    let pack = base;
    for (let i = 0; i < 8; i++) pack = addBucket(pack, `C${i}`, 0);
    expect(checkBucketCode(bucketsOf(pack), "C9")).toBe("full");
    expect(checkBucketCode(bucketsOf(pack), "Z0", { renaming: "C0" })).toBeNull();
  });

  it("lets a bucket be renamed to another case of its own code", () => {
    expect(checkBucketCode(list, "Ez", { renaming: "EZ" })).toBeNull();
    expect(checkBucketCode(list, "NM", { renaming: "EZ" })).toBe("builtIn");
  });
});

describe("colors", () => {
  it("picks the lowest unused color, wrapping when all are used", () => {
    expect(nextFreeColor(DEFAULT_BUCKETS)).toBe(0);
    expect(nextFreeColor(bucketsOf(ez))).toBe(1);
    const all: BucketEntry[] = [
      ...DEFAULT_BUCKETS,
      ...Array.from({ length: 10 }, (_, i) => ({ code: `C${i}`, color: i })),
    ];
    expect(nextFreeColor(all)).toBe(0);
  });
});

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
