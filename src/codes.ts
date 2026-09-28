/**
 * @file src/codes.ts
 * @desc How a bucket code reads in text: the characters a code may hold, and the rule slot labels
 *       and the pasted-pool parser share (a code that ends in a digit takes its slot number after
 *       a space, so "RC1 2" is RC1 slot 2). Internal: not exported from the package.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Sep 28, 2026
 * @modified Mon Sep 28, 2026
 */

/** One character of a bucket code, as regex source: a letter or digit in any script. */
export const CODE_CHAR = "[\\p{L}\\p{N}]";

/**
 * @function codeEndsInDigit
 * @param code {string} a bucket code
 * @returns {boolean} true when its last character is a digit in any script ("RC1", "Ü２")
 */
export const codeEndsInDigit = (code: string): boolean => /\p{N}$/u.test(code);
