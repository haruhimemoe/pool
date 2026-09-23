/**
 * @file tests/extras.test.ts
 * @desc Behavior added or pinned in the package beyond packs' ported tests: error codes on
 *       pasted-pool lines, the key version message, edge branches of the helpers, and the
 *       pre-publish review fixes (slot numbers past 99, refused removes, frozen constants,
 *       well-formed names, extractPackKey boundaries).
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Sep 23, 2026
 * @modified Wed Sep 23, 2026
 */

import { describe, expect, it } from "vitest";
import {
  addBuckets,
  BEATMAP_REF_MESSAGES,
  BUCKET_CODE_MESSAGES,
  bucketsOf,
  canonicalBuckets,
  DEFAULT_BUCKETS,
  encodePackKey,
  extractPackKey,
  MAX_CUSTOM_BUCKETS,
  MAX_SLOT_INDEX,
  MOD_ACRONYMS,
  MOD_BUCKET_NAMES,
  MOD_BUCKETS,
  MOD_SET_MESSAGES,
  mergeSlots,
  NO_MODS,
  PACK_KEY_ERROR_MESSAGES,
  PACK_KEY_VERSIONS,
  PALETTE,
  type Pool,
  parsePoolText,
  planMerge,
  poolDraftSchema,
  poolSchema,
  RULESETS,
  removeSlot,
  slotModsFor,
  sortSlots,
} from "../src/index.js";

describe("parsePoolText error codes", () => {
  const codes = (text: string, pool = { slots: [] }) =>
    parsePoolText(text, pool).errors.map((error) => error.code);

  it.each([
    ["https://osu.ppy.sh/beatmapsets/1", "set-only"],
    ["hello", "unrecognized"],
    ["1. 129891", "unrecognized"],
    ["this is not a slot", "bad-beatmap"],
    ["NM0 129891", "bad-index"],
    ["NM1 https://osu.ppy.sh/beatmapsets/1", "set-only"],
    ["NM1 nope", "bad-beatmap"],
    ["NM1 129891\nNM1 75", "duplicate"],
  ])("%j gives %s", (text, code) => {
    expect(codes(text)).toEqual([code]);
  });

  it("stops at the custom slot limit, and says the limit", () => {
    const lines = Array.from(
      { length: MAX_CUSTOM_BUCKETS + 1 },
      (_, i) => `X${"abcdefghi"[i]}1 ${i + 1}`,
    );
    const { errors, newBuckets } = parsePoolText(lines.join("\n"), { slots: [] });
    expect(newBuckets).toHaveLength(MAX_CUSTOM_BUCKETS);
    expect(errors).toEqual([
      expect.objectContaining({
        code: "full",
        reason: `This pool already has ${MAX_CUSTOM_BUCKETS} custom slots.`,
      }),
    ]);
  });
});

describe("messages", () => {
  it("names the key version problem without assuming it's newer or a browser", () => {
    expect(PACK_KEY_ERROR_MESSAGES.version).toBe(
      "This app can't read this key's version. It may come from a newer app, or be damaged.",
    );
  });
});

describe("helper edges", () => {
  it("doesn't treat a custom slot named like a built-in as the default list", () => {
    const list = DEFAULT_BUCKETS.map((entry, i) => (i === 0 ? { code: "NM", color: 1 } : entry));
    expect(canonicalBuckets(list)).toEqual(list);
  });

  it("sorts a slot whose bucket isn't in the list last", () => {
    const sorted = sortSlots([
      { mod: "ZZ", index: 1, beatmapId: 1 },
      { mod: "NM", index: 1, beatmapId: 2 },
    ]);
    expect(sorted.map((slot) => slot.mod)).toEqual(["NM", "ZZ"]);
  });
});

describe("slot numbers past 99", () => {
  const noSlot = (...indexes: number[]) =>
    indexes.map((index) => ({ mod: null, index, beatmapId: index }));

  it("reports a no-slot map that would be number 100 as full-group", () => {
    const { slots, errors } = parsePoolText("123", { slots: noSlot(97, 98, 99) });
    expect(slots).toEqual([]);
    expect(errors).toEqual([
      expect.objectContaining({
        line: 1,
        code: "full-group",
        reason: `No slot is full: slot numbers stop at ${MAX_SLOT_INDEX}.`,
      }),
    ]);
  });

  it("keeps the IDs that fit and reports the rest of the line once", () => {
    const { slots, errors } = parsePoolText("5 6 7\n8", { slots: noSlot(98) });
    expect(slots).toEqual([{ mod: null, index: 99, beatmapId: 5 }]);
    expect(errors.map((error) => [error.line, error.code])).toEqual([
      [1, "full-group"],
      [2, "full-group"],
    ]);
  });

  it("says slot numbers run 1 to 99 when a line's number is out of range", () => {
    expect(parsePoolText("NM100 5", { slots: [] }).errors).toEqual([
      expect.objectContaining({ code: "bad-index", reason: "Slot numbers go from 1 to 99." }),
    ]);
  });

  it("planMerge drops slots numbered past 99, and slots in an unknown bucket when given buckets", () => {
    const incoming = [
      { mod: null, index: 100, beatmapId: 1 },
      { mod: "EZ", index: 1, beatmapId: 2 },
      { mod: "NM", index: 1, beatmapId: 3 },
    ];
    expect(planMerge([], incoming)).toEqual({
      added: [incoming[1], incoming[2]],
      replaced: [],
      dropped: [incoming[0]],
    });
    expect(planMerge([], incoming, DEFAULT_BUCKETS)).toEqual({
      added: [incoming[2]],
      replaced: [],
      dropped: [incoming[0], incoming[1]],
    });
  });

  it("mergeSlots never builds a pool that fails validation", () => {
    const pool: Pool = { name: "p", slots: noSlot(97, 98, 99) };
    const merged = mergeSlots(pool, [
      { mod: null, index: 100, beatmapId: 1 },
      { mod: "EZ", index: 1, beatmapId: 2 },
      { mod: "NM", index: 0, beatmapId: 3 },
      { mod: "NM", index: 1, beatmapId: 0 },
    ]);
    expect(poolSchema.safeParse(merged).success).toBe(true);
    expect(merged.slots).toEqual(pool.slots);
  });

  it("the documented paste flow (addBuckets, then mergeSlots) stays valid", () => {
    const pool: Pool = { name: "p", slots: [] };
    const { slots, newBuckets } = parsePoolText("NM2 75\nRC1 4000000", pool);
    const merged = mergeSlots(addBuckets(pool, newBuckets), slots);
    expect(encodePackKey(merged)).toMatch(/^pk2\./);
  });
});

describe("removeSlot on a slot that isn't there", () => {
  const pool: Pool = {
    name: "p",
    slots: [
      { mod: "NM", index: 1, beatmapId: 1 },
      { mod: "NM", index: 3, beatmapId: 3 },
    ],
  };

  it.each([2, 0, 4])("returns the same pool for NM%i", (index) => {
    expect(removeSlot(pool, "NM", index)).toBe(pool);
  });
});

describe("shared constants are frozen", () => {
  const frozenDeep = (value: unknown): boolean =>
    typeof value !== "object" ||
    value === null ||
    (Object.isFrozen(value) && Object.values(value).every(frozenDeep));

  it.each([
    ["DEFAULT_BUCKETS", DEFAULT_BUCKETS],
    ["NO_MODS", NO_MODS],
    ["PALETTE", PALETTE],
    ["MOD_BUCKETS", MOD_BUCKETS],
    ["MOD_BUCKET_NAMES", MOD_BUCKET_NAMES],
    ["MOD_ACRONYMS", MOD_ACRONYMS],
    ["RULESETS", RULESETS],
    ["PACK_KEY_VERSIONS", PACK_KEY_VERSIONS],
    ["MOD_SET_MESSAGES", MOD_SET_MESSAGES],
    ["BUCKET_CODE_MESSAGES", BUCKET_CODE_MESSAGES],
    ["BEATMAP_REF_MESSAGES", BEATMAP_REF_MESSAGES],
    ["PACK_KEY_ERROR_MESSAGES", PACK_KEY_ERROR_MESSAGES],
    ["built-in slot mods", Object.freeze(DEFAULT_BUCKETS.map((entry) => slotModsFor(entry)))],
  ])("%s", (_, value) => {
    expect(frozenDeep(value)).toBe(true);
  });

  it("can't be changed through bucketsOf or slotModsFor", () => {
    const [first] = bucketsOf({});
    const hd = slotModsFor({ code: "HD" });
    expect(() => {
      // @ts-expect-error: entries are read-only
      if (first) first.code = "HD";
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error: a forced set is read-only
      if (hd.kind === "forced") hd.set.push("DT");
    }).toThrow(TypeError);
    expect(bucketsOf({})[0]?.code).toBe("NM");
    expect(slotModsFor({ code: "HD" })).toEqual({ kind: "forced", set: ["HD"] });
  });
});

describe("names must be well-formed UTF-16", () => {
  it("refuses a lone surrogate, which a key couldn't carry", () => {
    const pool: Pool = { name: "a\uD800b", slots: [] };
    expect(poolSchema.safeParse(pool).success).toBe(false);
    expect(poolDraftSchema.safeParse(pool).success).toBe(false);
    expect(() => encodePackKey(pool)).toThrow();
  });

  it("still accepts paired surrogates", () => {
    expect(poolSchema.safeParse({ name: "Pool 🎵", slots: [] }).success).toBe(true);
  });
});

describe("extractPackKey boundaries", () => {
  const key = encodePackKey({ name: "p", slots: [{ mod: "NM", index: 1, beatmapId: 1 }] });

  it.each([`a${key}`, `9${key}`, `_${key}`, `-${key}`, "apk1.abc"])(
    "finds no key glued to a word: %s",
    (text) => {
      expect(extractPackKey(text)).toBeNull();
    },
  );

  it.each([`#${key}`, `/${key}`, `key:${key}`, `"${key}"`])("finds the key after %s", (text) => {
    expect(extractPackKey(text)).toBe(key);
  });

  it("keeps trailing - and _ (they are base64url), so the checksum decides", () => {
    expect(extractPackKey(`${key}-- thanks`)).toBe(`${key}--`);
  });
});
