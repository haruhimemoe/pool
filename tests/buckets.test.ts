/**
 * @file tests/buckets.test.ts
 * @desc Bucket list helpers: the default list, the canonical form, lookups, custom code
 *       validation and colors.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Mon Sep 28, 2026
 */

import { describe, expect, it } from "vitest";
import { addBucket, withBuckets } from "../src/bucket-edits.js";
import {
  BUCKET_CODE_MESSAGES,
  bucketsOf,
  canonicalBuckets,
  checkBucketCode,
  DEFAULT_BUCKETS,
  findBucket,
  isCustomBucket,
  matchBucketCode,
  nextFreeColor,
} from "../src/buckets.js";
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

  // slotLabel prints NM slot 1 as "NM1", which would read back as a custom NM1's slot 1.
  it.each(["NM1", "nm12", "HD2", "TB1", "EZ3", "ez07"])(
    "refuses %j: another slot's code plus a number",
    (code) => {
      expect(checkBucketCode(list, code)).toBe("clash");
    },
  );

  it("refuses a code that another slot's code is plus a number, in either case", () => {
    const rc1 = [...DEFAULT_BUCKETS, { code: "RC1", color: 0 }];
    expect(checkBucketCode(rc1, "RC")).toBe("clash");
    expect(checkBucketCode(rc1, "rc")).toBe("clash");
  });

  it("allows codes whose labels can't be confused", () => {
    const rc1 = [...DEFAULT_BUCKETS, { code: "RC1", color: 0 }];
    // A code that ends in a digit is labelled with a space: "RC1 2" and "RC12 1".
    expect(checkBucketCode(rc1, "RC12")).toBeNull();
    expect(checkBucketCode(list, "NMA")).toBeNull();
    expect(checkBucketCode(list, "NM１")).toBeNull();
    expect(checkBucketCode(list, "HDHR")).toBeNull();
  });

  // "12 1 555" would read as three no-slot maps, and "1. 129891" is a numbered list.
  it.each(["1", "12", "２０２６"])("refuses %j: a code needs a letter", (code) => {
    expect(checkBucketCode(list, code)).toBe("digits");
  });

  it("allows digits next to a letter", () => {
    expect(checkBucketCode(list, "1M")).toBeNull();
    expect(checkBucketCode(list, "W2")).toBeNull();
  });

  it("leaves the code being renamed out of the clash check", () => {
    const rc1 = [...DEFAULT_BUCKETS, { code: "RC1", color: 0 }];
    expect(checkBucketCode(rc1, "RC", { renaming: "RC1" })).toBeNull();
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
