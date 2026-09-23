/**
 * @file src/base64url.ts
 * @desc base64url without padding (RFC 4648 §5), strict on decode. Built on btoa/atob so it runs in
 *       every browser we support and in Node.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Wed Sep 23, 2026
 */

const BASE64URL = /^[A-Za-z0-9_-]*$/;

/**
 * @function bytesToBase64Url
 * @param bytes {Uint8Array} input
 * @returns {string} base64url text, no padding
 */
export const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

/**
 * @function base64UrlToBytes
 * @param text {string} base64url without padding
 * @returns {Uint8Array} decoded bytes
 * @throws {Error} on characters outside the url alphabet, padding, or an impossible length
 */
export const base64UrlToBytes = (text: string): Uint8Array => {
  if (!BASE64URL.test(text) || text.length % 4 === 1) throw new Error("not base64url");
  const padded =
    text.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((text.length + 3) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};
