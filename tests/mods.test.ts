/**
 * @file tests/mods.test.ts
 * @desc Mod sets: validation and canonical order, toggles and disabled reasons, the pk3 bitmask
 *       (every bit and the edges), what each bucket plays with, and which sets get rated.
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Sep 23, 2026
 * @modified Wed Sep 23, 2026
 */

import { describe, expect, it } from "vitest";
import {
  bitmaskToMods,
  freemodSets,
  isModAcronym,
  MAX_FORCED_MODS,
  MOD_ACRONYMS,
  MOD_SET_MESSAGES,
  modBlockedReason,
  modSetProblem,
  modSetsFor,
  modsLabel,
  modsToBitmask,
  NO_MODS,
  type SlotMods,
  slotModsFor,
  slotModsSummary,
  toggleMod,
} from "../src/mods.js";

describe("MOD_ACRONYMS", () => {
  it("is the pk3 bitmask order: append only", () => {
    expect(MOD_ACRONYMS).toEqual(["EZ", "HD", "HR", "DT", "HT", "FL"]);
    expect(MAX_FORCED_MODS).toBe(3);
  });

  it.each([
    ["HD", true],
    ["NC", false],
    ["hd", false],
    ["", false],
  ])("isModAcronym(%j) is %s", (value, expected) => {
    expect(isModAcronym(value)).toBe(expected);
  });
});

describe("modSetProblem", () => {
  it.each([
    [["EZ"], null],
    [["HD", "DT"], null],
    [["EZ", "HD", "FL"], null],
    [["HD", "HR", "FL"], null],
    [[], "empty"],
    [["NC"], "unknown"],
    [["HD", "HD"], "duplicate"],
    [["EZ", "HD", "DT", "FL"], "tooMany"],
    [["EZ", "HR"], "conflict"],
    [["DT", "HT"], "conflict"],
    [["DT", "HD"], "order"],
  ])("%j -> %s", (set, problem) => {
    expect(modSetProblem(set)).toBe(problem);
  });

  it("has a message for every problem", () => {
    for (const message of Object.values(MOD_SET_MESSAGES))
      expect(message.length).toBeGreaterThan(0);
  });
});

describe("modBlockedReason and toggleMod", () => {
  it("allows any mod on an empty set", () => {
    for (const mod of MOD_ACRONYMS) expect(modBlockedReason([], mod)).toBeNull();
  });

  it("blocks the other half of a pair, naming both", () => {
    expect(modBlockedReason(["EZ"], "HR")).toBe("EZ and HR can't be used together.");
    expect(modBlockedReason(["HR"], "EZ")).toBe("EZ and HR can't be used together.");
    expect(modBlockedReason(["DT"], "HT")).toBe("DT and HT can't be used together.");
    expect(modBlockedReason(["HT"], "DT")).toBe("DT and HT can't be used together.");
  });

  it("blocks a fourth mod but never a picked one", () => {
    expect(modBlockedReason(["HD", "DT", "FL"], "EZ")).toBe(MOD_SET_MESSAGES.tooMany);
    expect(modBlockedReason(["HD", "DT", "FL"], "DT")).toBeNull();
  });

  it("adds in canonical order and removes", () => {
    expect(toggleMod(["DT"], "HD")).toEqual(["HD", "DT"]);
    expect(toggleMod(["HD", "DT"], "HD")).toEqual(["DT"]);
    expect(toggleMod(["FL"], "EZ")).toEqual(["EZ", "FL"]);
  });

  it("refuses a blocked mod", () => {
    expect(toggleMod(["EZ"], "HR")).toEqual(["EZ"]);
    expect(toggleMod(["HD", "DT", "FL"], "EZ")).toEqual(["HD", "DT", "FL"]);
  });
});

describe("pk3 bitmask", () => {
  it.each([
    [["EZ"], 1],
    [["HD"], 2],
    [["HR"], 4],
    [["DT"], 8],
    [["HT"], 16],
    [["FL"], 32],
    [["HD", "DT"], 10],
    [["EZ", "HD", "FL"], 35],
  ] as const)("%j <-> %i", (set, mask) => {
    expect(modsToBitmask(set)).toBe(mask);
    expect(bitmaskToMods(mask)).toEqual(set);
  });

  it("decodes the edges", () => {
    expect(bitmaskToMods(0)).toEqual([]);
    expect(bitmaskToMods(63)).toEqual([...MOD_ACRONYMS]);
  });

  it.each([64, 255, -1, 1.5, Number.NaN])("rejects %s", (mask) => {
    expect(() => bitmaskToMods(mask)).toThrow(RangeError);
  });
});

describe("slotModsFor", () => {
  it.each([
    ["NM", NO_MODS],
    ["HD", { kind: "forced", set: ["HD"] }],
    ["HR", { kind: "forced", set: ["HR"] }],
    ["DT", { kind: "forced", set: ["DT"] }],
    ["FM", { kind: "free" }],
    ["TB", { kind: "free" }],
  ] as const)("built-in %s", (code, mods) => {
    expect(slotModsFor({ code })).toEqual(mods);
  });

  it("reads a custom slot's setting, no mods when absent", () => {
    expect(slotModsFor({ code: "EZ", color: 0 })).toEqual(NO_MODS);
    expect(slotModsFor({ code: "EZ", color: 0, mods: { kind: "forced", set: ["EZ"] } })).toEqual({
      kind: "forced",
      set: ["EZ"],
    });
    expect(slotModsFor({ code: "X", color: 0, mods: { kind: "free" } })).toEqual({ kind: "free" });
  });
});

describe("which mod sets a slot is rated for", () => {
  it("rates freemod slots with HD, HR, HDHR, EZ in that order", () => {
    expect(freemodSets("osu").map(modsLabel)).toEqual(["HD", "HR", "HDHR", "EZ"]);
    expect(freemodSets("taiko").map(modsLabel)).toEqual(["HD", "HR", "HDHR", "EZ"]);
    expect(freemodSets("fruits").map(modsLabel)).toEqual(["HD", "HR", "HDHR", "EZ"]);
  });

  it("rates mania freemod slots with HD only", () => {
    expect(freemodSets("mania").map(modsLabel)).toEqual(["HD"]);
  });

  it("rates forced slots with their set and no-mod slots with nothing", () => {
    expect(modSetsFor({ kind: "forced", set: ["HD", "DT"] }, "osu").map(modsLabel)).toEqual([
      "HDDT",
    ]);
    expect(modSetsFor({ kind: "free" }, "mania").map(modsLabel)).toEqual(["HD"]);
    expect(modSetsFor(NO_MODS, "osu")).toEqual([]);
  });

  it("labels a set by joining its acronyms", () => {
    expect(modsLabel(["HD", "HR"])).toBe("HDHR");
    expect(modsLabel([])).toBe("");
  });
});

describe("slotModsSummary", () => {
  it.each<[SlotMods, string | null]>([
    [NO_MODS, null],
    [{ kind: "forced", set: ["HD", "DT"] }, "Forced HD DT"],
    [{ kind: "free" }, "Freemod"],
  ])("%j -> %j", (mods, text) => {
    expect(slotModsSummary(mods)).toBe(text);
  });
});
