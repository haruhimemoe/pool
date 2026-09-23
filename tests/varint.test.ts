/**
 * @file tests/varint.test.ts
 * @desc Unsigned LEB128 varints: known encodings, round trips, and every failure mode.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Tue Sep 22, 2026
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeVarint, encodeVarint } from "../src/varint.js";

const encode = (value: number) => {
  const out: number[] = [];
  encodeVarint(value, out);
  return out;
};

describe("encodeVarint", () => {
  it.each([
    [0, [0x00]],
    [127, [0x7f]],
    [128, [0x80, 0x01]],
    [300, [0xac, 0x02]],
    [129891, [0xe3, 0xf6, 0x07]],
    [0xffffffff, [0xff, 0xff, 0xff, 0xff, 0x0f]],
  ])("encodes %d", (value, bytes) => {
    expect(encode(value)).toEqual(bytes);
  });

  it.each([-1, 1.5, 2 ** 32, Number.NaN])("rejects %d", (value) => {
    expect(() => encode(value)).toThrow(RangeError);
  });
});

describe("decodeVarint", () => {
  it("round-trips any uint32 at any offset", () => {
    fc.assert(
      fc.property(fc.nat({ max: 0xffffffff }), fc.nat({ max: 8 }), (value, pad) => {
        const bytes = Uint8Array.from([...Array(pad).fill(0x55), ...encode(value), 0x99]);
        expect(decodeVarint(bytes, pad)).toEqual({ value, next: bytes.length - 1 });
      }),
    );
  });

  it("rejects a truncated varint", () => {
    expect(() => decodeVarint(Uint8Array.from([0x80, 0x80]), 0)).toThrow(RangeError);
  });

  it("rejects more than 5 bytes", () => {
    expect(() => decodeVarint(Uint8Array.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x01]), 0)).toThrow(
      RangeError,
    );
  });

  it("rejects a 5-byte value above 0xFFFFFFFF", () => {
    expect(() => decodeVarint(Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0x1f]), 0)).toThrow(
      RangeError,
    );
  });
});
