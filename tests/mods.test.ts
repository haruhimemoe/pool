/**
 * @file tests/mods.test.ts
 * @desc Mod sets: validation and canonical order, toggles and disabled reasons, the pk3 bitmask
 *       (every bit and the edges), what each bucket plays with, which sets get rated, and which
 *       mods change a star rating and the speed (checked against packs' and pools' own copies).
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Sep 23, 2026
 * @modified Mon Sep 28, 2026
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  bitmaskToMods,
  changesStarRating,
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
  ratingMods,
  type SlotMods,
  slotModsFor,
  slotModsSummary,
  speedRate,
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

// packs.haruhime.moe's rules (src/constants/pack-stats.ts, src/utils/saved-pack-stats.ts) and
// pools.haruhime.moe's (src/utils/source-pools.ts, src/utils/mod-values.ts), as the apps had them.
const PACKS_RATING_MODS: readonly string[] = ["EZ", "HR", "DT", "HT", "FL"];
const PACKS_SPEED_RATES: Readonly<Record<string, number>> = { DT: 1.5, HT: 0.75 };
const packsSpeedOf = (set: readonly string[]): number => {
  for (const mod of set) {
    const rate = PACKS_SPEED_RATES[mod];
    if (rate !== undefined) return rate;
  }
  return 1;
};
const poolsClockRate = (mods: readonly string[]): number => {
  if (mods.includes("DT")) return 1.5;
  return mods.includes("HT") ? 0.75 : 1;
};
const POOLS_RATING_MODS: Readonly<Record<string, string>> = {
  EZ: "EZ",
  HR: "HR",
  DT: "DT",
  NC: "DT",
  HT: "HT",
  DC: "HT",
  FL: "FL",
};
const poolsRatingModsOf = (mods: readonly string[]): string[] => {
  const found = new Set(mods.flatMap((mod) => POOLS_RATING_MODS[mod.toUpperCase()] ?? []));
  return MOD_ACRONYMS.filter((mod) => found.has(mod));
};

/** Every forced set a custom slot can hold: all canonical, valid subsets of MOD_ACRONYMS. */
const VALID_SETS = Array.from({ length: 1 << MOD_ACRONYMS.length }, (_, mask) =>
  bitmaskToMods(mask),
).filter((set) => modSetProblem(set) === null);

describe("changesStarRating", () => {
  it.each([["EZ"], ["HR"], ["DT"], ["HT"], ["FL"], ["HD", "DT"], ["NC"], ["dc"]])(
    "is true for %j",
    (...set) => {
      expect(changesStarRating(set)).toBe(true);
    },
  );

  it.each([[[]], [["HD"]], [["SD", "PF"]], [["nm"]]])("is false for %j", (set) => {
    expect(changesStarRating(set)).toBe(false);
  });

  it("answers like packs for every forced set a slot can hold", () => {
    for (const set of VALID_SETS) {
      expect(changesStarRating(set)).toBe(set.some((mod) => PACKS_RATING_MODS.includes(mod)));
    }
  });
});

describe("speedRate", () => {
  it("is 1.5 with DT, 0.75 with HT and 1 otherwise", () => {
    expect(speedRate(["HD", "DT"])).toBe(1.5);
    expect(speedRate(["EZ", "HT"])).toBe(0.75);
    expect(speedRate(["HR", "FL"])).toBe(1);
    expect(speedRate([])).toBe(1);
  });

  it("reads NC as DT and DC as HT, in any case", () => {
    expect(speedRate(["NC"])).toBe(1.5);
    expect(speedRate(["hd", "nc"])).toBe(1.5);
    expect(speedRate(["DC"])).toBe(0.75);
  });

  it("answers like packs and pools for every forced set a slot can hold", () => {
    for (const set of VALID_SETS) {
      expect(speedRate(set)).toBe(packsSpeedOf(set));
      expect(speedRate(set)).toBe(poolsClockRate(set));
    }
  });
});

describe("ratingMods", () => {
  it.each([
    [
      ["ez", "NC", "HD"],
      ["EZ", "DT"],
    ],
    [
      ["EZ", "DC"],
      ["EZ", "HT"],
    ],
    [
      ["FL", "HR", "HD"],
      ["HR", "FL"],
    ],
    [["DT", "NC"], ["DT"]],
    [["HD", "SD", "PF", "NM"], []],
  ])("keeps the rating mods of %j in canonical order", (mods, rated) => {
    expect(ratingMods(mods)).toEqual(rated);
  });

  it("answers like pools for any mods a source writes", () => {
    const token = fc.constantFrom(
      ...["EZ", "HD", "HR", "DT", "NC", "HT", "DC", "FL", "SD", "PF", "SO", "nc", "dc", "ez"],
      ...["", "toString", "__proto__", "\u{FB02}", "Dt"],
    );
    fc.assert(
      fc.property(fc.array(token, { maxLength: 8 }), (mods) => {
        expect(ratingMods(mods)).toEqual(poolsRatingModsOf(mods));
        expect(changesStarRating(mods)).toBe(ratingMods(mods).length > 0);
      }),
    );
  });
});
