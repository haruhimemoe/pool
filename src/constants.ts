/**
 * @file src/constants.ts
 * @desc Pool limits, the six built-in mod buckets, custom bucket rules, and the custom bucket
 *       color palette. MOD_BUCKETS and PALETTE order are pack key wire values: append only, never
 *       reorder. Every exported table is frozen: apps share one copy.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Mon Sep 28, 2026
 */

import { CODE_CHAR } from "./codes.js";

/** Maps one pool may hold. */
export const MAX_SLOTS = 64;
/** A pool name's longest length, in UTF-16 code units. */
export const MAX_NAME_LENGTH = 64;
/** The highest slot number (NM99). */
export const MAX_SLOT_INDEX = 99;

/** The six built-in buckets in default order. The index is a pack key wire value: append only. */
export const MOD_BUCKETS = Object.freeze(["NM", "HD", "HR", "DT", "FM", "TB"] as const);

/** A built-in bucket's code. */
export type ModBucket = (typeof MOD_BUCKETS)[number];

/** Each built-in bucket's English name, for headings and tooltips. */
export const MOD_BUCKET_NAMES: Readonly<Record<ModBucket, string>> = Object.freeze({
  NM: "No Mod",
  HD: "Hidden",
  HR: "Hard Rock",
  DT: "Double Time",
  FM: "Free Mod",
  TB: "Tiebreaker",
});

/**
 * @function isModBucket
 * @param value {string} untrusted input
 * @returns {boolean} true only for an exact bucket code
 */
export const isModBucket = (value: string): value is ModBucket =>
  (MOD_BUCKETS as readonly string[]).includes(value);

/** Custom buckets one pool may add to the six built-ins. */
export const MAX_CUSTOM_BUCKETS = 8;
/** A custom bucket code's longest length, in code points. */
export const MAX_BUCKET_CODE_LENGTH = 12;
/** Custom bucket codes: letters (any script) and digits, 1 to 12 characters. */
export const BUCKET_CODE_PATTERN = new RegExp(`^${CODE_CHAR}{1,${MAX_BUCKET_CODE_LENGTH}}$`, "u");
/** What UI calls the group of maps without a slot. */
export const NO_SLOT_NAME = "No slot";

/**
 * The colors a custom bucket can pick, by stored id (the index). Names only: each app maps them
 * to its own styles. Append only.
 */
export const PALETTE = Object.freeze([
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
] as const);

/** How many colors PALETTE has. */
export const PALETTE_SIZE = PALETTE.length;
