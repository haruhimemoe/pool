/**
 * @file tests/schema.test.ts
 * @desc Pack schema limits (name, slot count, index range, beatmap id range, unique slots) and the
 *       bucket rules: complete bucket list, custom codes, slots pointing at real buckets.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Wed Sep 23, 2026
 */

import { describe, expect, it } from "vitest";
import { MAX_SLOTS, MOD_BUCKETS } from "../src/constants.js";
import { poolDraftSchema, poolSchema, slotKey, storedSlotModsSchema } from "../src/schema.js";

const slot = (mod: string | null, index: number, beatmapId = 129891) => ({ mod, index, beatmapId });
const builtIns = MOD_BUCKETS.map((code) => ({ code }));
const withEz = [...builtIns.slice(0, 5), { code: "EZ", color: 0 }, { code: "TB" }];

describe("poolSchema", () => {
  it("accepts a normal pool and trims the name", () => {
    const parsed = poolSchema.parse({
      name: "  EGC Quals  ",
      slots: [slot("NM", 1), slot("TB", 1)],
    });
    expect(parsed.name).toBe("EGC Quals");
    expect(parsed.buckets).toBeUndefined();
  });

  it.each([
    ["an empty name", { name: "   ", slots: [] }],
    ["a 65-character name", { name: "x".repeat(65), slots: [] }],
    ["a slot in a bucket the pack doesn't have", { name: "p", slots: [slot("EZ", 1)] }],
    ["index 0", { name: "p", slots: [slot("NM", 0)] }],
    ["index 100", { name: "p", slots: [slot("NM", 100)] }],
    ["beatmap id 0", { name: "p", slots: [slot("NM", 1, 0)] }],
    ["a fractional beatmap id", { name: "p", slots: [slot("NM", 1, 1.5)] }],
    ["beatmap id 2^31", { name: "p", slots: [slot("NM", 1, 2 ** 31)] }],
    ["duplicate (mod, index)", { name: "p", slots: [slot("NM", 1), slot("NM", 1, 2)] }],
    ["duplicate no-slot index", { name: "p", slots: [slot(null, 1), slot(null, 1, 2)] }],
    [
      "65 slots",
      {
        name: "p",
        slots: Array.from({ length: MAX_SLOTS + 1 }, (_, i) => slot("NM", (i % 99) + 1, i + 1)),
      },
    ],
    ["a bucket list missing TB", { name: "p", slots: [], buckets: builtIns.slice(0, 5) }],
    ["a built-in listed twice", { name: "p", slots: [], buckets: [...builtIns, { code: "NM" }] }],
    [
      "a built-in given a color",
      { name: "p", slots: [], buckets: [...builtIns.slice(1), { code: "NM", color: 1 }] },
    ],
    [
      "a custom code that is a built-in in other case",
      { name: "p", slots: [], buckets: [...builtIns, { code: "hd", color: 1 }] },
    ],
    [
      "two customs differing only in case",
      {
        name: "p",
        slots: [],
        buckets: [...builtIns, { code: "EZ", color: 0 }, { code: "ez", color: 1 }],
      },
    ],
    [
      "a 13-character custom code",
      { name: "p", slots: [], buckets: [...builtIns, { code: "x".repeat(13), color: 0 }] },
    ],
    [
      "a custom code with a space",
      { name: "p", slots: [], buckets: [...builtIns, { code: "E Z", color: 0 }] },
    ],
    [
      "an unknown color",
      { name: "p", slots: [], buckets: [...builtIns, { code: "EZ", color: 10 }] },
    ],
    [
      "nine custom buckets",
      {
        name: "p",
        slots: [],
        buckets: [
          ...builtIns,
          ...Array.from({ length: 9 }, (_, i) => ({ code: `C${i}`, color: 0 })),
        ],
      },
    ],
    [
      "a lower-case slot code that only matches in other case",
      { name: "p", slots: [slot("ez", 1)], buckets: withEz },
    ],
  ])("rejects %s", (_label, input) => {
    expect(poolSchema.safeParse(input).success).toBe(false);
  });

  it("allows the same beatmap in two different slots", () => {
    expect(poolSchema.safeParse({ name: "p", slots: [slot("NM", 1), slot("FM", 1)] }).success).toBe(
      true,
    );
  });

  it("accepts no-slot maps, custom buckets, any order, and unicode codes", () => {
    const buckets = [
      { code: "TB" },
      { code: "難", color: 3 },
      ...builtIns.slice(0, 5),
      { code: "Speed", color: 9 },
    ];
    const parsed = poolSchema.parse({
      name: "p",
      slots: [slot(null, 1), slot("難", 1), slot("Speed", 1), slot("NM", 1)],
      buckets,
    });
    expect(parsed.buckets).toEqual(buckets);
  });

  it("accepts eight custom buckets", () => {
    const buckets = [
      ...builtIns,
      ...Array.from({ length: 8 }, (_, i) => ({ code: `C${i}`, color: i })),
    ];
    expect(poolSchema.safeParse({ name: "p", slots: [], buckets }).success).toBe(true);
  });
});

describe("poolDraftSchema", () => {
  it("allows an empty name while editing", () => {
    expect(poolDraftSchema.safeParse({ name: "", slots: [] }).success).toBe(true);
  });

  it("still rejects duplicate slots", () => {
    expect(
      poolDraftSchema.safeParse({ name: "", slots: [slot("NM", 1), slot("NM", 1)] }).success,
    ).toBe(false);
  });

  it("loads a draft saved before buckets existed", () => {
    expect(
      poolDraftSchema.parse({ name: "Old", slots: [{ mod: "HD", index: 1, beatmapId: 5 }] }),
    ).toEqual({ name: "Old", slots: [{ mod: "HD", index: 1, beatmapId: 5 }] });
  });
});

describe("slotKey", () => {
  it("keeps no-slot and bucketed slots apart", () => {
    expect(slotKey({ mod: null, index: 1 })).not.toBe(slotKey({ mod: "NM", index: 1 }));
    expect(slotKey({ mod: "EZ", index: 12 })).not.toBe(slotKey({ mod: "EZ1", index: 2 }));
  });
});

describe("custom slot mods", () => {
  const withMods = (mods: unknown) => ({
    name: "p",
    slots: [slot("EZ", 1)],
    buckets: [...builtIns.slice(0, 5), { code: "EZ", color: 0, mods }, { code: "TB" }],
  });

  it.each([
    { kind: "forced", set: ["EZ"] },
    { kind: "forced", set: ["HD", "DT"] },
    { kind: "forced", set: ["EZ", "HD", "FL"] },
    { kind: "free" },
  ])("accepts %j", (mods) => {
    expect(poolSchema.safeParse(withMods(mods)).success).toBe(true);
  });

  it.each([
    ["no mods in a forced set", { kind: "forced", set: [] }],
    ["EZ with HR", { kind: "forced", set: ["EZ", "HR"] }],
    ["DT with HT", { kind: "forced", set: ["DT", "HT"] }],
    ["four mods", { kind: "forced", set: ["EZ", "HD", "DT", "FL"] }],
    ["NC", { kind: "forced", set: ["NC"] }],
    ["a repeated mod", { kind: "forced", set: ["HD", "HD"] }],
    ["the wrong order", { kind: "forced", set: ["DT", "HD"] }],
    ["an unknown kind", { kind: "sometimes" }],
    ["a set on freemod", { kind: "free", set: ["HD"] }],
    ["an explicit none", { kind: "none" }],
  ])("rejects %s", (_label, mods) => {
    expect(poolSchema.safeParse(withMods(mods)).success).toBe(false);
  });

  it("keeps working without mods (no mods is the default)", () => {
    expect(
      poolSchema.parse({ name: "p", slots: [slot("EZ", 1)], buckets: withEz }).buckets,
    ).toEqual(withEz);
  });

  it("never puts mods on a built-in", () => {
    const buckets = [{ code: "NM", mods: { kind: "free" } }, ...builtIns.slice(1)];
    expect(poolSchema.safeParse({ name: "p", slots: [], buckets }).success).toBe(false);
  });

  it("explains a bad set in plain words", () => {
    const result = storedSlotModsSchema.safeParse({ kind: "forced", set: ["EZ", "HR"] });
    expect(result.error?.issues.map((i) => i.message)).toContain(
      "EZ with HR, and DT with HT, can't be forced together.",
    );
  });
});
