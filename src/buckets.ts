/**
 * @file src/buckets.ts
 * @desc A pool's bucket list: the default six built-ins, custom buckets (code + palette color),
 *       lookups, the canonical form (omitted when it equals the default), and custom code checks.
 *       The edits are in bucket-edits.ts and the labels in labels.ts.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Mon Sep 28, 2026
 */

import { codeEndsInDigit } from "./codes.js";
import {
  BUCKET_CODE_PATTERN,
  isModBucket,
  MAX_BUCKET_CODE_LENGTH,
  MAX_CUSTOM_BUCKETS,
  MOD_BUCKETS,
  PALETTE_SIZE,
} from "./constants.js";
import type { BucketEntry, CustomBucket } from "./schema.js";

/**
 * The six built-ins in default order. Frozen, entries included: every pool without a list shares
 * it.
 */
export const DEFAULT_BUCKETS: readonly Readonly<BucketEntry>[] = Object.freeze(
  MOD_BUCKETS.map((code) => Object.freeze({ code })),
);

/**
 * @function isCustomBucket
 * @param entry {BucketEntry} bucket
 * @returns {boolean} true for a pool-defined bucket (it has a color)
 */
export const isCustomBucket = (entry: BucketEntry): entry is CustomBucket => "color" in entry;

/**
 * @function bucketsOf
 * @param pool {{ buckets? }} a pool
 * @returns {readonly Readonly<BucketEntry>[]} its bucket list, or the default when it has none (a
 *          read-only view: edit through the bucket functions)
 */
export const bucketsOf = (pool: {
  buckets?: readonly BucketEntry[] | undefined;
}): readonly Readonly<BucketEntry>[] => pool.buckets ?? DEFAULT_BUCKETS;

const sameEntry = (a: BucketEntry, b: BucketEntry): boolean =>
  a.code === b.code &&
  (isCustomBucket(a) ? isCustomBucket(b) && a.color === b.color : !isCustomBucket(b));

/**
 * @function canonicalBuckets
 * @param list {readonly BucketEntry[]} a full bucket list
 * @returns {BucketEntry[] | undefined} a copy, or undefined when it equals the default
 */
export const canonicalBuckets = (list: readonly BucketEntry[]): BucketEntry[] | undefined =>
  list.length === DEFAULT_BUCKETS.length &&
  list.every((entry, i) => {
    const other = DEFAULT_BUCKETS[i];
    return other !== undefined && sameEntry(entry, other);
  })
    ? undefined
    : list.map((entry) => ({ ...entry }));

/**
 * @function findBucket
 * @param list {readonly BucketEntry[]} bucket list
 * @param code {string} exact code
 * @returns {BucketEntry | undefined} the entry with exactly that code, or undefined
 */
export const findBucket = (list: readonly BucketEntry[], code: string): BucketEntry | undefined =>
  list.find((entry) => entry.code === code);

/**
 * @function matchBucketCode
 * @param list {readonly BucketEntry[]} bucket list
 * @param text {string} a code as typed or pasted, any case
 * @returns {string | null} the stored code it matches case-insensitively, or null
 */
export const matchBucketCode = (list: readonly BucketEntry[], text: string): string | null => {
  const folded = text.toUpperCase();
  return list.find((entry) => entry.code.toUpperCase() === folded)?.code ?? null;
};

/** Default English text for each reason checkBucketCode refuses a code. */
export const BUCKET_CODE_MESSAGES = Object.freeze({
  empty: "Type a code for the slot.",
  long: `Slot codes are at most ${MAX_BUCKET_CODE_LENGTH} characters.`,
  chars: "Use letters and digits only.",
  digits: "A code needs at least one letter.",
  builtIn: "That's a built-in slot.",
  taken: "This pool already has a slot with that code.",
  clash: "A code can't be another slot's code plus a number, like NM1 next to NM.",
  full: `A pool can have at most ${MAX_CUSTOM_BUCKETS} custom slots.`,
} as const);

/** Why checkBucketCode refuses a code. */
export type BucketCodeError = keyof typeof BUCKET_CODE_MESSAGES;

/**
 * True when one code is the other plus ASCII digits and the shorter one ends in a letter ("NM"
 * and "NM1", in any case): slotLabel prints NM slot 1 as "NM1", which reads back as NM1's slot 1.
 * A code that ends in a digit gets a space in its labels ("RC1 2"), so RC1 and RC12 never clash.
 */
const clashes = (a: string, b: string): boolean => {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return (
    !codeEndsInDigit(short) && long.startsWith(short) && /^\d+$/.test(long.slice(short.length))
  );
};

/**
 * @function checkBucketCode
 * @param list {readonly BucketEntry[]} current bucket list
 * @param code {string} proposed custom code (already trimmed)
 * @param options {{ renaming?: string }} the code being renamed, which may keep its own spelling in
 *        another case
 * @returns {BucketCodeError | null} why the code can't be used, or null
 */
export const checkBucketCode = (
  list: readonly BucketEntry[],
  code: string,
  { renaming }: { renaming?: string } = {},
): BucketCodeError | null => {
  if (code === "") return "empty";
  if (Array.from(code).length > MAX_BUCKET_CODE_LENGTH) return "long";
  if (!BUCKET_CODE_PATTERN.test(code)) return "chars";
  // "12 1 555" would read as three no-slot maps, and "1. 129891" is a numbered list.
  if (/^\p{N}+$/u.test(code)) return "digits";
  const folded = code.toUpperCase();
  if (isModBucket(folded)) return "builtIn";
  const others = list.filter((entry) => entry.code !== renaming).map((e) => e.code.toUpperCase());
  if (others.includes(folded)) return "taken";
  if (others.some((other) => clashes(other, folded))) return "clash";
  if (renaming === undefined && list.filter(isCustomBucket).length >= MAX_CUSTOM_BUCKETS) {
    return "full";
  }
  return null;
};

/**
 * @function nextFreeColor
 * @param list {readonly BucketEntry[]} bucket list
 * @returns {number} the lowest palette id no custom bucket uses, or 0 when all are used
 */
export const nextFreeColor = (list: readonly BucketEntry[]): number => {
  const used = new Set(list.filter(isCustomBucket).map((entry) => entry.color));
  for (let color = 0; color < PALETTE_SIZE; color++) if (!used.has(color)) return color;
  return 0;
};

/**
 * @function insertBeforeTb
 * @param list {readonly BucketEntry[]} bucket list
 * @param entry {BucketEntry} bucket to insert
 * @returns {BucketEntry[]} new list with the entry just before TB (or last when TB is absent)
 */
export const insertBeforeTb = (list: readonly BucketEntry[], entry: BucketEntry): BucketEntry[] => {
  const tb = list.findIndex((e) => e.code === "TB");
  const at = tb === -1 ? list.length : tb;
  return [...list.slice(0, at), entry, ...list.slice(at)];
};
