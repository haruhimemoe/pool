/**
 * @file tests/input.test.ts
 * @desc Parsing beatmap IDs/links and pasted mappool lines.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Tue Sep 22, 2026
 */

import { describe, expect, it } from "vitest";
import { POOL_LINE_HELP, parseBeatmapRef, parsePoolText } from "../src/input.js";
import type { BucketEntry } from "../src/schema.js";

describe("parseBeatmapRef", () => {
  it.each([
    ["129891", 129891],
    ["  129891 ", 129891],
    ["https://osu.ppy.sh/beatmapsets/39804#osu/129891", 129891],
    ["https://osu.ppy.sh/beatmapsets/39804/#mania/129891", 129891],
    ["osu.ppy.sh/beatmaps/129891", 129891],
    ["https://osu.ppy.sh/beatmaps/129891?mode=osu", 129891],
    ["https://osu.ppy.sh/b/129891", 129891],
  ])("reads %j", (input, id) => {
    expect(parseBeatmapRef(input)).toEqual({ ok: true, beatmapId: id });
  });

  it.each(["https://osu.ppy.sh/beatmapsets/39804", "https://osu.ppy.sh/s/39804"])(
    "flags whole-set link %j",
    (input) => {
      expect(parseBeatmapRef(input)).toEqual({ ok: false, reason: "set-only" });
    },
  );

  it.each(["", "abc", "0", "-5", "12.5", "99999999999", "https://example.com/b/1"])(
    "rejects %j",
    (input) => {
      expect(parseBeatmapRef(input)).toEqual({ ok: false, reason: "unrecognized" });
    },
  );
});

const EMPTY = { slots: [] };

describe("parsePoolText", () => {
  it("parses slot labels in the common spreadsheet shapes", () => {
    const text = [
      "NM1 129891",
      "nm2\t2116202",
      "HD1: https://osu.ppy.sh/beatmapsets/39804#osu/129891",
      "HR 1 1872396",
      "TB 1872396",
      "",
      "# comments are skipped",
      "DT1 129891 FREEDOM DiVE extra columns",
    ].join("\n");
    expect(parsePoolText(text, EMPTY)).toEqual({
      slots: [
        { mod: "NM", index: 1, beatmapId: 129891 },
        { mod: "NM", index: 2, beatmapId: 2116202 },
        { mod: "HD", index: 1, beatmapId: 129891 },
        { mod: "HR", index: 1, beatmapId: 1872396 },
        { mod: "TB", index: 1, beatmapId: 1872396 },
        { mod: "DT", index: 1, beatmapId: 129891 },
      ],
      newBuckets: [],
      errors: [],
    });
  });

  it("reads bare IDs and links, one per line or comma/space separated, as no-slot maps", () => {
    const { slots, errors } = parsePoolText(
      "129891\n1872396, 2000001\nhttps://osu.ppy.sh/b/5 6\n",
      { slots: [{ mod: null, index: 1, beatmapId: 1 }] },
    );
    expect(errors).toEqual([]);
    expect(slots).toEqual([
      { mod: null, index: 2, beatmapId: 129891 },
      { mod: null, index: 3, beatmapId: 1872396 },
      { mod: null, index: 4, beatmapId: 2000001 },
      { mod: null, index: 5, beatmapId: 5 },
      { mod: null, index: 6, beatmapId: 6 },
    ]);
  });

  it("reads an ID followed by title columns as one no-slot map", () => {
    expect(parsePoolText("129891\tFREEDOM DiVE\txi", EMPTY).slots).toEqual([
      { mod: null, index: 1, beatmapId: 129891 },
    ]);
  });

  it("creates a custom bucket for an unknown code, with the next free color, and reuses it", () => {
    const { slots, newBuckets, errors } = parsePoolText("EZ1 129891\nez2 5\nHT 7", {
      slots: [],
      buckets: [
        { code: "NM" },
        { code: "HD" },
        { code: "HR" },
        { code: "DT" },
        { code: "FM" },
        { code: "FL", color: 0 },
        { code: "TB" },
      ],
    });
    expect(errors).toEqual([]);
    expect(newBuckets).toEqual([
      { code: "EZ", color: 1 },
      { code: "HT", color: 2 },
    ]);
    expect(slots).toEqual([
      { mod: "EZ", index: 1, beatmapId: 129891 },
      { mod: "EZ", index: 2, beatmapId: 5 },
      { mod: "HT", index: 1, beatmapId: 7 },
    ]);
  });

  it("matches existing codes that end in a digit before splitting off an index", () => {
    const buckets: BucketEntry[] = [
      { code: "NM" },
      { code: "HD" },
      { code: "HR" },
      { code: "DT" },
      { code: "FM" },
      { code: "RC1", color: 0 },
      { code: "TB" },
    ];
    expect(parsePoolText("RC1 2 555\nrc13 556", { slots: [], buckets }).slots).toEqual([
      { mod: "RC1", index: 2, beatmapId: 555 },
      { mod: "RC1", index: 3, beatmapId: 556 },
    ]);
  });

  it("keeps unicode codes as typed", () => {
    expect(parsePoolText("難1 5", EMPTY).newBuckets).toEqual([{ code: "難", color: 0 }]);
  });

  it("refuses a ninth custom bucket", () => {
    const buckets: BucketEntry[] = [
      { code: "NM" },
      { code: "HD" },
      { code: "HR" },
      { code: "DT" },
      { code: "FM" },
      ...Array.from({ length: 8 }, (_, i) => ({
        code: `C${String.fromCharCode(65 + i)}`,
        color: i,
      })),
      { code: "TB" },
    ];
    const { errors, newBuckets } = parsePoolText("EZ1 5", { slots: [], buckets });
    expect(newBuckets).toEqual([]);
    expect(errors[0]?.reason).toBe("This pool already has 8 custom slots.");
  });

  it("reports bad lines by line number, keeps the good ones, and creates no bucket for a bad line", () => {
    const { slots, errors, newBuckets } = parsePoolText(
      "NM1 129891\nnonsense\nEZ1 abc\nHD1 https://osu.ppy.sh/s/39804\nNM1 2116202\nNM0 5\nhttps://osu.ppy.sh/s/39804",
      EMPTY,
    );
    expect(slots).toEqual([{ mod: "NM", index: 1, beatmapId: 129891 }]);
    expect(newBuckets).toEqual([]);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(errors[0]?.reason).toBe(POOL_LINE_HELP);
    expect(errors[3]?.reason).toContain("NM1");
    expect(errors[5]?.reason).toMatch(/whole beatmapset/);
  });

  it("handles Windows line endings", () => {
    expect(parsePoolText("NM1 1\r\nNM2 2\r\n", EMPTY).slots).toHaveLength(2);
  });

  it("doesn't turn a numbered list into a slot called 1", () => {
    const { slots, newBuckets, errors } = parsePoolText("1. 129891", EMPTY);
    expect(slots).toEqual([]);
    expect(newBuckets).toEqual([]);
    expect(errors[0]?.reason).toBe(POOL_LINE_HELP);
  });

  it("explains a set link even when more columns follow it", () => {
    expect(parsePoolText("https://osu.ppy.sh/s/39804 129891", EMPTY).errors[0]?.reason).toMatch(
      /whole beatmapset/,
    );
  });

  describe("parsePoolText codes that end in a digit", () => {
    it("reads 'RC1 2 555' as RC1 slot 2 even before an RC1 slot exists", () => {
      const { slots, newBuckets, errors } = parsePoolText("RC1 2 555\nÜ2 1 556", EMPTY);
      expect(errors).toEqual([]);
      expect(slots).toEqual([
        { mod: "RC1", index: 2, beatmapId: 555 },
        { mod: "Ü2", index: 1, beatmapId: 556 },
      ]);
      expect(newBuckets.map((b) => b.code)).toEqual(["RC1", "Ü2"]);
    });

    it("reads 'EZ12' as EZ slot 12 when both EZ and EZ1 exist", () => {
      const buckets: BucketEntry[] = [
        { code: "NM" },
        { code: "HD" },
        { code: "HR" },
        { code: "DT" },
        { code: "FM" },
        { code: "EZ", color: 0 },
        { code: "EZ1", color: 1 },
        { code: "TB" },
      ];
      expect(parsePoolText("EZ12 555\nEZ1 2 556", { slots: [], buckets }).slots).toEqual([
        { mod: "EZ", index: 12, beatmapId: 555 },
        { mod: "EZ1", index: 2, beatmapId: 556 },
      ]);
    });
  });
});
