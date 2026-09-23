/**
 * @file tests/extras.test.ts
 * @desc Behavior added or pinned in the package beyond packs' ported tests: error codes on
 *       pasted-pool lines, the key version message, and edge branches of the helpers.
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Sep 23, 2026
 * @modified Wed Sep 23, 2026
 */

import { describe, expect, it } from "vitest";
import {
  canonicalBuckets,
  DEFAULT_BUCKETS,
  MAX_CUSTOM_BUCKETS,
  PACK_KEY_ERROR_MESSAGES,
  parsePoolText,
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
  it("names a newer key format without assuming a browser", () => {
    expect(PACK_KEY_ERROR_MESSAGES.version).toBe(
      "This key uses a newer format than this app can read.",
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
