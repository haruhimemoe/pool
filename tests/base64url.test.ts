/**
 * @file tests/base64url.test.ts
 * @desc base64url (no padding) encode/decode with strict alphabet checking.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Tue Sep 22, 2026
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { base64UrlToBytes, bytesToBase64Url } from "../src/base64url.js";

describe("base64url", () => {
  it("encodes with the url alphabet and no padding", () => {
    expect(bytesToBase64Url(Uint8Array.from([0xfb, 0xff, 0xbf]))).toBe("-_-_");
    expect(bytesToBase64Url(Uint8Array.from([0x01]))).toBe("AQ");
  });

  it("round-trips arbitrary bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
        expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
      }),
    );
  });

  it.each(["AQ==", "A+Q", "A/Q", "A Q", "A", "AQ!"])("rejects %j", (text) => {
    expect(() => base64UrlToBytes(text)).toThrow();
  });
});
