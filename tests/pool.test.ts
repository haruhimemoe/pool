/**
 * @file tests/pool.test.ts
 * @desc Pool editing: ordering, next index, add at cap, remove with renumbering, merge/upsert.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Tue Sep 22, 2026
 */

import { describe, expect, it } from "vitest";
import { addBucket, moveBucket } from "../src/buckets.js";
import { MAX_SLOTS } from "../src/constants.js";
import {
  addSlot,
  mergeSlots,
  moveSlot,
  nextSlotIndex,
  planMerge,
  removeSlot,
  sortSlots,
} from "../src/pool.js";
import type { Pool } from "../src/schema.js";

const pack = (slots: Pool["slots"]): Pool => ({ name: "p", slots });
const labels = (p: Pool) => p.slots.map((s) => `${s.mod ?? "-"}${s.index}:${s.beatmapId}`);

describe("sortSlots", () => {
  it("orders by bucket, then index, without mutating the input", () => {
    const input = [
      { mod: "TB" as const, index: 1, beatmapId: 1 },
      { mod: "NM" as const, index: 2, beatmapId: 2 },
      { mod: "NM" as const, index: 1, beatmapId: 3 },
    ];
    expect(sortSlots(input).map((s) => `${s.mod}${s.index}`)).toEqual(["NM1", "NM2", "TB1"]);
    expect(input[0]?.mod).toBe("TB");
  });
});

describe("nextSlotIndex", () => {
  it("is 1 for an empty bucket and max+1 otherwise", () => {
    const slots = [
      { mod: "NM" as const, index: 1, beatmapId: 1 },
      { mod: "NM" as const, index: 3, beatmapId: 2 },
    ];
    expect(nextSlotIndex(slots, "HD")).toBe(1);
    expect(nextSlotIndex(slots, "NM")).toBe(4);
  });
});

describe("addSlot", () => {
  it("appends to the end of the bucket", () => {
    const p = addSlot(addSlot(pack([]), "NM", 10), "NM", 20);
    expect(labels(p)).toEqual(["NM1:10", "NM2:20"]);
  });

  it("returns the same pack when full", () => {
    const full = pack(
      Array.from({ length: MAX_SLOTS }, (_, i) => ({
        mod: "NM" as const,
        index: (i % 99) + 1,
        beatmapId: i + 1,
      })),
    );
    expect(addSlot(full, "HD", 5)).toBe(full);
  });

  it("returns the same pack when the bucket is at index 99", () => {
    const p = pack([{ mod: "NM", index: 99, beatmapId: 1 }]);
    expect(addSlot(p, "NM", 2)).toBe(p);
  });
});

describe("removeSlot", () => {
  it("removes the slot and closes the gap in that bucket only", () => {
    const p = pack([
      { mod: "NM", index: 1, beatmapId: 1 },
      { mod: "NM", index: 2, beatmapId: 2 },
      { mod: "NM", index: 3, beatmapId: 3 },
      { mod: "HD", index: 2, beatmapId: 4 },
    ]);
    expect(labels(removeSlot(p, "NM", 1))).toEqual(["NM1:2", "NM2:3", "HD2:4"]);
  });
});

describe("mergeSlots", () => {
  it("replaces existing (mod, index) and adds new ones", () => {
    const p = pack([
      { mod: "NM", index: 1, beatmapId: 1 },
      { mod: "HD", index: 1, beatmapId: 2 },
    ]);
    const merged = mergeSlots(p, [
      { mod: "NM", index: 1, beatmapId: 9 },
      { mod: "TB", index: 1, beatmapId: 3 },
    ]);
    expect(labels(merged)).toEqual(["NM1:9", "HD1:2", "TB1:3"]);
  });

  it("never grows past the slot cap but still applies replacements", () => {
    const full = pack(
      Array.from({ length: MAX_SLOTS }, (_, i) => ({
        mod: "NM" as const,
        index: (i % 99) + 1,
        beatmapId: i + 1,
      })),
    );
    const merged = mergeSlots(full, [
      { mod: "NM", index: 1, beatmapId: 777 },
      { mod: "TB", index: 1, beatmapId: 5 },
    ]);
    expect(merged.slots).toHaveLength(MAX_SLOTS);
    expect(merged.slots[0]?.beatmapId).toBe(777);
    expect(merged.slots.some((s) => s.mod === "TB")).toBe(false);
  });
});

describe("planMerge", () => {
  it("reports what a merge adds, replaces, and drops at the cap", () => {
    const slots = Array.from({ length: MAX_SLOTS - 2 }, (_, i) => ({
      mod: "NM" as const,
      index: i + 1,
      beatmapId: 1000 + i,
    }));
    const plan = planMerge(slots, [
      { mod: "HD", index: 1, beatmapId: 1 },
      { mod: "NM", index: 1, beatmapId: 777 },
      { mod: "NM", index: 2, beatmapId: 1001 },
      { mod: "HD", index: 2, beatmapId: 2 },
      { mod: "HD", index: 3, beatmapId: 3 },
    ]);
    expect(plan.added.map((s) => `${s.mod}${s.index}`)).toEqual(["HD1", "HD2"]);
    expect(plan.replaced.map((s) => `${s.mod}${s.index}`)).toEqual(["NM1"]);
    expect(plan.dropped.map((s) => `${s.mod}${s.index}`)).toEqual(["HD3"]);
  });
});

describe("no slot and custom buckets", () => {
  it("sorts no-slot maps first, then buckets in the pack's order", () => {
    const p = moveBucket(addBucket(pack([]), "EZ", 0), "EZ", 0);
    const slots = [
      { mod: "NM", index: 1, beatmapId: 1 },
      { mod: null, index: 2, beatmapId: 2 },
      { mod: "EZ", index: 1, beatmapId: 3 },
      { mod: null, index: 1, beatmapId: 4 },
    ];
    expect(sortSlots(slots, p.buckets).map((s) => `${s.mod ?? "-"}${s.index}`)).toEqual([
      "-1",
      "-2",
      "EZ1",
      "NM1",
    ]);
  });

  it("numbers no-slot maps like any other group", () => {
    let p = addSlot(pack([]), null, 10);
    p = addSlot(p, null, 20);
    p = addSlot(p, "NM", 30);
    expect(labels(p)).toEqual(["-1:10", "-2:20", "NM1:30"]);
    expect(labels(removeSlot(p, null, 1))).toEqual(["-1:20", "NM1:30"]);
    expect(nextSlotIndex(p.slots, null)).toBe(3);
  });

  it("keeps the pack's bucket list when adding and removing", () => {
    const p = addSlot(addBucket(pack([]), "EZ", 2), "EZ", 5);
    expect(p.buckets?.some((b) => b.code === "EZ")).toBe(true);
    expect(removeSlot(p, "EZ", 1).buckets).toEqual(p.buckets);
  });
});

describe("moveSlot", () => {
  const p = pack([
    { mod: "NM", index: 1, beatmapId: 1 },
    { mod: "NM", index: 2, beatmapId: 2 },
    { mod: "HD", index: 1, beatmapId: 3 },
    { mod: null, index: 1, beatmapId: 4 },
  ]);

  it("moves a map to the end of another group and closes the gap", () => {
    expect(labels(moveSlot(p, { mod: "NM", index: 1 }, "HD"))).toEqual([
      "-1:4",
      "NM1:2",
      "HD1:3",
      "HD2:1",
    ]);
  });

  it("moves into and out of no slot", () => {
    expect(labels(moveSlot(p, { mod: null, index: 1 }, "TB"))).toEqual([
      "NM1:1",
      "NM2:2",
      "HD1:3",
      "TB1:4",
    ]);
    expect(labels(moveSlot(p, { mod: "HD", index: 1 }, null))).toEqual([
      "-1:4",
      "-2:3",
      "NM1:1",
      "NM2:2",
    ]);
  });

  it("refuses same-group moves, unknown slots, and a target at index 99", () => {
    expect(moveSlot(p, { mod: "NM", index: 1 }, "NM")).toBe(p);
    expect(moveSlot(p, { mod: "DT", index: 1 }, "NM")).toBe(p);
    const full = pack([
      { mod: "HD", index: 99, beatmapId: 1 },
      { mod: "NM", index: 1, beatmapId: 2 },
    ]);
    expect(moveSlot(full, { mod: "NM", index: 1 }, "HD")).toBe(full);
  });

  it("works on a full pack (the slot count doesn't change)", () => {
    const full = pack(
      Array.from({ length: MAX_SLOTS }, (_, i) => ({
        mod: "NM" as const,
        index: i + 1,
        beatmapId: i + 1,
      })),
    );
    expect(moveSlot(full, { mod: "NM", index: 1 }, "TB").slots).toHaveLength(MAX_SLOTS);
  });
});

describe("planMerge with no-slot maps", () => {
  it("adds pasted no-slot maps without replacing existing ones", () => {
    const plan = planMerge(
      [{ mod: null, index: 1, beatmapId: 1 }],
      [{ mod: null, index: 2, beatmapId: 2 }],
    );
    expect(plan.added).toEqual([{ mod: null, index: 2, beatmapId: 2 }]);
  });

  describe("slots never point at a missing bucket", () => {
    it("refuses to add or move a map into a bucket the pack doesn't have", () => {
      const pack: Pool = { name: "p", slots: [{ mod: "NM", index: 1, beatmapId: 1 }] };
      expect(addSlot(pack, "EZ", 2)).toBe(pack);
      expect(moveSlot(pack, { mod: "NM", index: 1 }, "EZ")).toBe(pack);
    });

    it("still moves a map into a bucket after it's created", () => {
      const pack = addBucket(
        { name: "p", slots: [{ mod: "NM", index: 1, beatmapId: 1 }] },
        "EZ",
        0,
      );
      expect(moveSlot(pack, { mod: "NM", index: 1 }, "EZ").slots).toEqual([
        { mod: "EZ", index: 1, beatmapId: 1 },
      ]);
    });
  });
});
