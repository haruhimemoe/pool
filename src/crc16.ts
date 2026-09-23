/**
 * @file src/crc16.ts
 * @desc CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection, no final xor).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Wed Sep 23, 2026
 */

/**
 * @function crc16CcittFalse
 * @param bytes {Uint8Array} input
 * @returns {number} 16-bit checksum
 */
export const crc16CcittFalse = (bytes: Uint8Array): number => {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
};
