/**
 * @file tests/key-legacy.test.ts
 * @desc Old keys never break: every recorded pk1/pk2 key decodes to the same pool,
 *       and that pool still encodes to the exact same key. Never edit the fixture; a failure here
 *       means an existing key changed.
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Sep 23, 2026
 * @modified Wed Sep 23, 2026
 */

import { describe, expect, it } from "vitest";
import { bucketsOf, canonicalBuckets } from "../src/buckets.js";
import { decodePackKey, encodePackKey } from "../src/key.js";
import { sortSlots } from "../src/pool.js";
import type { Pool } from "../src/schema.js";
import legacy from "./fixtures/legacy-keys.json" with { type: "json" };

/** What decoding gives back: slots in pool order, buckets only when not the default. */
const normalized = (pack: Pool): Pool => {
  const list = bucketsOf(pack);
  const buckets = canonicalBuckets(list);
  const slots = sortSlots(pack.slots, list);
  return buckets ? { name: pack.name, slots, buckets } : { name: pack.name, slots };
};

describe.each(legacy)("$label", ({ pack, key }) => {
  // JSON widens codes to string; the pack is valid, the test proves it.
  const ref = pack as unknown as Pool;

  it("still encodes to the same key, byte for byte", () => {
    expect(encodePackKey(ref)).toBe(key);
  });

  it("still decodes to the same pool", () => {
    expect(decodePackKey(key)).toEqual(normalized(ref));
  });
});

it("covers both versions", () => {
  expect(new Set(legacy.map(({ key }) => key.slice(0, 4)))).toEqual(new Set(["pk1.", "pk2."]));
});
