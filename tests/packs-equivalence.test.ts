/**
 * @file tests/packs-equivalence.test.ts
 * @desc 400 random pools that packs.haruhime.moe's own codec encoded and decoded
 *       (scripts/gen-packs-keys.ts, 100 pk1, 204 pk2, 96 pk3): this package must write the same
 *       key byte for byte and read it back to the same pool, so keys move freely between apps.
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Sep 23, 2026
 * @modified Wed Sep 23, 2026
 */

import { describe, expect, it } from "vitest";
import { decodePackKey, encodePackKey, type Pool } from "../src/index.js";
import cases from "./fixtures/packs-keys.json" with { type: "json" };

describe("keys made by packs.haruhime.moe", () => {
  it("covers every key version", () => {
    const versions = new Set(cases.map((entry) => entry.key.slice(0, 4)));
    expect([...versions].sort()).toEqual(["pk1.", "pk2.", "pk3."]);
  });

  it.each(cases.map((entry, index) => [index, entry] as const))(
    "case %i encodes to the same key and decodes to the same pool",
    (_, entry) => {
      expect(encodePackKey(entry.pool as Pool)).toBe(entry.key);
      expect(decodePackKey(entry.key)).toEqual(entry.decoded);
    },
  );
});
