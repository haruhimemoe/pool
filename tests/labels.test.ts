/**
 * @file tests/labels.test.ts
 * @desc Slot labels and titles, and bucket names for headings and select options. Every label a
 *       pool built through the edits prints parses back to the same slot.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Sep 28, 2026
 * @modified Mon Sep 28, 2026
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addBucket } from "../src/bucket-edits.js";
import { bucketsOf } from "../src/buckets.js";
import { MAX_SLOT_INDEX } from "../src/constants.js";
import { parsePoolText } from "../src/input.js";
import {
  bucketName,
  bucketOptionLabel,
  displayPoolName,
  slotLabel,
  slotTitle,
} from "../src/labels.js";
import { type Pool, slotKey } from "../src/schema.js";

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

describe("slot labels read back", () => {
  // Codes from a few letters and digits, so prefixes like NM/NM1 and C/C1/C12 come up often.
  const codes = fc.array(fc.stringMatching(/^[NC][M12]{0,2}$/), { maxLength: 8 });
  const pools = codes.chain((list) => {
    const pool = list.reduce<Pool>((next, code) => addBucket(next, code, 0), {
      name: "p",
      slots: [],
    });
    const slot = fc.record({
      mod: fc.constantFrom(...bucketsOf(pool).map((entry) => entry.code)),
      index: fc.oneof(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: MAX_SLOT_INDEX })),
      beatmapId: fc.integer({ min: 1, max: 2_147_483_647 }),
    });
    return fc.uniqueArray(slot, { selector: slotKey, maxLength: 16 }).map((slots) => ({
      pool,
      slots,
    }));
  });

  it("parses every slotLabel line back to the same slot", () => {
    fc.assert(
      fc.property(pools, ({ pool, slots }) => {
        const text = slots.map((slot) => `${slotLabel(slot)} ${slot.beatmapId}`).join("\n");
        expect(parsePoolText(text, pool)).toEqual({ slots, newBuckets: [], errors: [] });
      }),
      { numRuns: 500 },
    );
  });
});

describe("displayPoolName", () => {
  it.each([
    ["EGC Quals", "EGC Quals"],
    ["  Quals  ", "Quals"],
    ["a\u0000b", "a b"],
    ["line\r\nbreak", "line break"],
    ["tab\there", "tab here"],
    ["esc\u001b[31mred", "esc [31mred"],
    ["para\u2029graph\u2028line", "para graph line"],
    ["evil\u202Egpj.exe", "evilgpj.exe"],
    ["\u2066isolate\u2069 \u200Fmarks\u200E\u061C", "isolate marks"],
    ["\u202E", ""],
    ["日本語 🌸 Cup", "日本語 🌸 Cup"],
    ["family 👨\u200D👩\u200D👧", "family 👨\u200D👩\u200D👧"],
  ])("shows %j as %j", (name, shown) => {
    expect(displayPoolName(name)).toBe(shown);
  });

  it("returns text with no control or bidi characters for any name", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (name) => {
        expect(displayPoolName(name)).not.toMatch(
          /[\p{Cc}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\u2028\u2029]/u,
        );
      }),
    );
  });
});
