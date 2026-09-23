/**
 * @file tests/packs-equivalence.test.ts
 * @desc Random pools that packs.haruhime.moe's own codec encoded and decoded, and damaged keys
 *       with the answer packs gave (scripts/gen-packs-keys.ts, at the commit in `source`): this
 *       package must write the same keys byte for byte and read every key the same way, so keys
 *       move freely between apps.
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Sep 23, 2026
 * @modified Wed Sep 23, 2026
 */

import { describe, expect, it } from "vitest";
import { decodePackKey, encodePackKey, type Pool } from "../src/index.js";
import fixture from "./fixtures/packs-keys.json" with { type: "json" };

const { cases, rejected } = fixture;

describe("keys made by packs.haruhime.moe", () => {
  it("covers every key version", () => {
    const versions = new Set(cases.map((entry) => entry.key.slice(0, 4)));
    expect([...versions].sort()).toEqual(["pk1.", "pk2.", "pk3."]);
  });

  it.each(cases.map((entry, index) => [index, entry] as const))(
    "case %i encodes to the same key and decodes to the same pool",
    (_, entry) => {
      expect(encodePackKey(entry.pool as Pool)).toBe(entry.key);
      expect(decodePackKey(entry.key)).toStrictEqual(entry.decoded);
      expect(encodePackKey(entry.decoded as Pool)).toBe(entry.key);
    },
  );

  it("records which packs commit made the fixture", () => {
    expect(fixture.source.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it.each(rejected.map((entry, index) => [index, entry] as const))(
    "damaged key %i gets the same answer packs gave",
    (_, entry) => {
      if (entry.code === null) {
        expect(decodePackKey(entry.key)).toStrictEqual(entry.decoded);
        return;
      }
      expect(() => decodePackKey(entry.key)).toThrow(
        expect.objectContaining({ name: "PackKeyError", code: entry.code }),
      );
    },
  );
});
