/**
 * @file src/varint.ts
 * @desc Unsigned LEB128 varints capped at 32 bits (5 bytes). Arithmetic avoids 32-bit bitwise ops
 *       so values above 2^31 stay correct.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Wed Sep 23, 2026
 */

const MAX_VARINT = 0xffff_ffff;
const MAX_BYTES = 5;

/**
 * @function encodeVarint
 * @param value {number} integer in [0, 0xFFFFFFFF]
 * @param out {number[]} byte sink, appended in place
 * @throws {RangeError} when value is negative, fractional, NaN, or too large
 */
export const encodeVarint = (value: number, out: number[]): void => {
  if (!Number.isInteger(value) || value < 0 || value > MAX_VARINT) {
    throw new RangeError(`varint out of range: ${value}`);
  }
  let rest = value;
  while (rest >= 0x80) {
    out.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  out.push(rest);
};

/**
 * @function decodeVarint
 * @param bytes {Uint8Array} source
 * @param offset {number} index of the first varint byte
 * @returns {{ value: number; next: number }} decoded value and the index after it
 * @throws {RangeError} when truncated, longer than 5 bytes, or above 0xFFFFFFFF
 */
export const decodeVarint = (
  bytes: Uint8Array,
  offset: number,
): { value: number; next: number } => {
  let value = 0;
  let scale = 1;
  for (let i = 0; i < MAX_BYTES; i++) {
    const byte = bytes[offset + i];
    if (byte === undefined) throw new RangeError("varint truncated");
    value += (byte & 0x7f) * scale;
    if ((byte & 0x80) === 0) {
      if (value > MAX_VARINT) throw new RangeError("varint out of range");
      return { value, next: offset + i + 1 };
    }
    scale *= 0x80;
  }
  throw new RangeError("varint longer than 5 bytes");
};
