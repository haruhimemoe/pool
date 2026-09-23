/**
 * @file tests/crc16.test.ts
 * @desc CRC-16/CCITT-FALSE against the standard check value and single-bit sensitivity.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Tue Sep 22, 2026
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { crc16CcittFalse } from "../src/crc16.js";

describe("crc16CcittFalse", () => {
  it("matches the catalogue check value for '123456789'", () => {
    expect(crc16CcittFalse(new TextEncoder().encode("123456789"))).toBe(0x29b1);
  });

  it("is 0xFFFF for empty input", () => {
    expect(crc16CcittFalse(new Uint8Array())).toBe(0xffff);
  });

  it("changes when any single bit flips", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 64 }),
        fc.nat(),
        fc.nat({ max: 7 }),
        (bytes, at, bit) => {
          const flipped = Uint8Array.from(bytes);
          const i = at % flipped.length;
          flipped[i] = (flipped[i] ?? 0) ^ (1 << bit);
          expect(crc16CcittFalse(flipped)).not.toBe(crc16CcittFalse(bytes));
        },
      ),
    );
  });
});
