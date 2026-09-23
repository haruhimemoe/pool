/**
 * @file src/constants.ts
 * @desc Pool limits, the six built-in mod buckets, custom bucket rules, and the custom bucket
 *       color palette. MOD_BUCKETS and PALETTE order are pack key wire values: append only, never
 *       reorder.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Wed Sep 23, 2026
 */

export const MAX_SLOTS = 64;
export const MAX_NAME_LENGTH = 64;
export const MAX_SLOT_INDEX = 99;

export const MOD_BUCKETS = ["NM", "HD", "HR", "DT", "FM", "TB"] as const;

export type ModBucket = (typeof MOD_BUCKETS)[number];

export const MOD_BUCKET_NAMES: Record<ModBucket, string> = {
  NM: "No Mod",
  HD: "Hidden",
  HR: "Hard Rock",
  DT: "Double Time",
  FM: "Free Mod",
  TB: "Tiebreaker",
};

/**
 * @function isModBucket
 * @param value {string} untrusted input
 * @returns {boolean} true only for an exact bucket code
 */
export const isModBucket = (value: string): value is ModBucket =>
  (MOD_BUCKETS as readonly string[]).includes(value);

/** Custom buckets one pool may add to the six built-ins. */
export const MAX_CUSTOM_BUCKETS = 8;
export const MAX_BUCKET_CODE_LENGTH = 12;
/** Custom bucket codes: letters (any script) and digits, 1 to 12 characters. */
export const BUCKET_CODE_PATTERN = /^[\p{L}\p{N}]{1,12}$/u;
export const NO_SLOT_NAME = "No slot";

/**
 * The colors a custom bucket can pick, by stored id (the index). Names only: each app maps them
 * to its own styles. Append only.
 */
export const PALETTE = [
  "Green",
  "Teal",
  "Pink",
  "Lime",
  "Cyan",
  "Fuchsia",
  "Yellow",
  "Red",
  "Indigo",
  "Stone",
] as const;

export const PALETTE_SIZE = PALETTE.length;
