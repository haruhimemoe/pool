/**
 * @file tests/labels.test.ts
 * @desc Slot labels and titles, and bucket names for headings and select options.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Sep 28, 2026
 * @modified Mon Sep 28, 2026
 */

import { describe, expect, it } from "vitest";
import { bucketName, bucketOptionLabel, slotLabel, slotTitle } from "../src/labels.js";

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
