/**
 * @file tests/key-decoder.test.ts
 * @desc Hand-built key bodies (valid CRC) that must be refused: every decoder branch the random
 *       and legacy fixtures don't reach, each with the error code packs gives, plus the looser
 *       rules docs/pack-key.md pins (BOM, base64 tail bits, whitespace, code points, uppercasing).
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Sep 23, 2026
 * @modified Wed Sep 23, 2026
 */

import { describe, expect, it } from "vitest";
import { bytesToBase64Url } from "../src/base64url.js";
import { crc16CcittFalse } from "../src/crc16.js";
import { decodePackKey, encodePackKey, PackKeyError, type PackKeyErrorCode } from "../src/index.js";

// A key from raw body bytes: the CRC is computed, so only the body's meaning is under test.
const keyOf = (prefix: number, body: number[]): string => {
  const crc = crc16CcittFalse(Uint8Array.from(body));
  return `pk${prefix}.${bytesToBase64Url(Uint8Array.from([...body, crc >> 8, crc & 0xff]))}`;
};
const codeOf = (key: string): PackKeyErrorCode | "ok" => {
  try {
    decodePackKey(key);
    return "ok";
  } catch (error) {
    if (error instanceof PackKeyError) return error.code;
    throw error;
  }
};

const NAME = [1, 0x61]; // "a"
const BUILT_INS = [0, 1, 2, 3, 4, 5];
const table = (...entries: number[][]) => [6 + entries.length - 1, ...entries.flat()];

describe("decodePackKey refuses", () => {
  it.each([
    ["a body byte that doesn't match the prefix", keyOf(2, [1, ...NAME, 0]), "version"],
    ["non-base64url text", "pk1.ab$c", "encoding"],
    ["a key too short to hold a checksum", "pk1.AQ", "malformed"],
    ["a name that runs past the end", keyOf(1, [1, 5, 0x61]), "malformed"],
    ["a pk1 slot with an unknown bucket byte", keyOf(1, [1, ...NAME, 1, 9, 1, 1]), "malformed"],
    ["more than 64 maps", keyOf(1, [1, ...NAME, 65]), "malformed"],
    ["trailing bytes", keyOf(1, [1, ...NAME, 0, 0]), "malformed"],
    ["a table with too few entries", keyOf(2, [2, ...NAME, 5, 0, 1, 2, 3, 4, 0]), "malformed"],
    ["an unknown table byte", keyOf(2, [2, ...NAME, 6, 0, 1, 2, 3, 4, 0x20, 0]), "malformed"],
    [
      "a custom entry cut off before its color",
      keyOf(2, [2, ...NAME, 7, ...BUILT_INS, 0xfe]),
      "malformed",
    ],
    [
      "a mods entry in a pk2 key",
      keyOf(2, [2, ...NAME, ...table(BUILT_INS, [0xfd, 0, 1, 0x58, 2]), 0]),
      "malformed",
    ],
    [
      "an unknown mods mode",
      keyOf(3, [3, ...NAME, ...table(BUILT_INS, [0xfd, 0, 1, 0x58, 7]), 0]),
      "malformed",
    ],
    [
      "forced mods cut off before the bitmask",
      keyOf(3, [3, ...NAME, ...table(BUILT_INS, [0xfd, 0, 1, 0x58, 1])]),
      "malformed",
    ],
    [
      "a slot pointing past the table",
      keyOf(2, [2, ...NAME, ...table(BUILT_INS), 1, 6, 1, 1]),
      "malformed",
    ],
  ] as const)("%s", (_, key, code) => {
    expect(codeOf(key)).toBe(code);
  });

  it("accepts the same shapes when they're well-formed (so the cases above test one thing)", () => {
    expect(codeOf(keyOf(1, [1, ...NAME, 0]))).toBe("ok");
    expect(codeOf(keyOf(3, [3, ...NAME, ...table(BUILT_INS, [0xfd, 0, 1, 0x58, 2]), 0]))).toBe(
      "ok",
    );
  });
});

describe("non-canonical keys the spec says open", () => {
  it("accepts overlong varints, maps out of order and a spelled-out default table", () => {
    // pk2 with the default table written out, two NM maps listed 2 then 1, and slot 1's number as
    // an overlong varint (0x81 0x00).
    const key = keyOf(2, [2, ...NAME, ...table(BUILT_INS), 2, 0, 2, 7, 0, 0x81, 0x00, 5]);
    const pool = decodePackKey(key);
    expect(pool).toStrictEqual({
      name: "a",
      slots: [
        { mod: "NM", index: 1, beatmapId: 5 },
        { mod: "NM", index: 2, beatmapId: 7 },
      ],
    });
    expect(encodePackKey(pool).startsWith("pk1.")).toBe(true);
  });

  it("re-encodes a pk3 key with no mods as pk2", () => {
    const key = keyOf(3, [3, ...NAME, ...table(BUILT_INS, [0xfe, 0, 1, 0x58]), 1, 6, 1, 9]);
    expect(encodePackKey(decodePackKey(key)).startsWith("pk2.")).toBe(true);
  });
});

describe("the looser rules the spec pins (keys are forever)", () => {
  const utf8 = (text: string) => [...new TextEncoder().encode(text)];
  const str = (bytes: number[]) => [bytes.length, ...bytes];
  const BOM = [0xef, 0xbb, 0xbf];
  const withCode = (code: number[]) =>
    keyOf(2, [2, ...NAME, ...table(BUILT_INS, [0xfe, 0, ...str(code)]), 0]);
  const codeIn = (key: string) => decodePackKey(key).buckets?.find((b) => "color" in b)?.code;

  it("reads blank input as empty", () => {
    expect(codeOf(" \t\n")).toBe("empty");
  });

  it("drops one leading byte order mark from a string, and only one", () => {
    expect(codeIn(withCode([...BOM, 0x41]))).toBe("A");
    expect(codeOf(withCode([...BOM, ...BOM, 0x41]))).toBe("malformed");
  });

  it("ignores the unused bits of the last base64url character", () => {
    const key = encodePackKey({ name: "ab", slots: [{ mod: "NM", index: 1, beatmapId: 1 }] });
    expect(key).toBe("pk1.AQJhYgEAAQEETQ");
    for (const last of "QRSTUVWXYZabcdef") {
      expect(decodePackKey(`${key.slice(0, -1)}${last}`)).toStrictEqual(decodePackKey(key));
    }
  });

  it("trims ECMAScript whitespace only", () => {
    const key = keyOf(1, [1, ...NAME, 0]);
    expect(codeOf(`　﻿${key} `)).toBe("ok");
    for (const other of ["\u0085", "᠎", "​"]) {
      expect(codeOf(`${other}${key}`)).toBe("prefix");
    }
    expect(decodePackKey(keyOf(1, [1, ...str(utf8("　a ")), 0])).name).toBe("a");
  });

  it("counts code points in a code and takes letters and numbers from any script", () => {
    expect(codeOf(withCode(utf8("𝒜".repeat(12))))).toBe("ok");
    expect(codeOf(withCode(utf8("𝒜".repeat(13))))).toBe("malformed");
    for (const ok of ["Ü", "難", "Ⅻ", "½"]) expect(codeOf(withCode(utf8(ok)))).toBe("ok");
    expect(codeOf(withCode(utf8("é")))).toBe("malformed");
  });

  it("compares codes after toUpperCase (full mapping, no locale)", () => {
    const two = (a: string, b: string) =>
      codeOf(
        keyOf(2, [
          2,
          ...NAME,
          ...table(BUILT_INS, [0xfe, 0, ...str(utf8(a))], [0xfe, 1, ...str(utf8(b))]),
          0,
        ]),
      );
    for (const [a, b] of [
      ["ß", "SS"],
      ["ı", "I"],
      ["ſ", "S"],
      ["ﬀ", "FF"],
    ] as const) {
      expect(two(a, b)).toBe("malformed");
    }
    expect(two("i", "İ")).toBe("ok");
    expect(codeOf(withCode(utf8("hd")))).toBe("malformed");
  });
});
