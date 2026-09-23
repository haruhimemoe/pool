/**
 * @file src/buckets.ts
 * @desc A pool's bucket list: the default six built-ins, custom buckets (code + palette color),
 *       labels, code validation, and pure edits, and mods. Every edit returns the same pool object
 *       when it refuses, and keeps `buckets` canonical (omitted when it equals the default).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Wed Sep 23, 2026
 */

import {
  BUCKET_CODE_PATTERN,
  isModBucket,
  MAX_BUCKET_CODE_LENGTH,
  MAX_CUSTOM_BUCKETS,
  MOD_BUCKET_NAMES,
  MOD_BUCKETS,
  NO_SLOT_NAME,
  PALETTE_SIZE,
} from "./constants.js";
import { modSetProblem, type SlotMods } from "./mods.js";
import type { BucketEntry, CustomBucket, Pool, SlotBucket } from "./schema.js";

/** The six built-ins in default order. Frozen, entries included: every pool without a list shares it. */
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
 * @function withBuckets
 * @param pool {Pool} a pool
 * @param list {readonly BucketEntry[]} its new bucket list
 * @returns {Pool} name + slots + the canonical list (field omitted for the default)
 */
export const withBuckets = (pool: Pool, list: readonly BucketEntry[]): Pool => {
  const buckets = canonicalBuckets(list);
  return buckets
    ? { name: pool.name, slots: pool.slots, buckets }
    : { name: pool.name, slots: pool.slots };
};

/**
 * @function findBucket
 * @param list {readonly BucketEntry[]} bucket list
 * @param code {string} exact code
 * @returns {BucketEntry | undefined}
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

/**
 * @function bucketName
 * @param entry {BucketEntry | null} bucket, or null for no slot
 * @returns {string} "Hidden", "EZ", or "No slot"
 */
export const bucketName = (entry: BucketEntry | null): string => {
  if (entry === null) return NO_SLOT_NAME;
  return isCustomBucket(entry) ? entry.code : MOD_BUCKET_NAMES[entry.code];
};

/**
 * @function bucketOptionLabel
 * @param entry {BucketEntry} bucket
 * @returns {string} "HD · Hidden" for built-ins, the code for customs
 */
export const bucketOptionLabel = (entry: BucketEntry): string =>
  isCustomBucket(entry) ? entry.code : `${entry.code} · ${MOD_BUCKET_NAMES[entry.code]}`;

/**
 * @function slotLabel
 * @param slot {{ mod: SlotBucket; index: number }} a slot
 * @returns {string} "NM1", "Speed2", "RC1 2" (space when the code ends in a digit), or "4" for no slot
 */
export const slotLabel = (slot: { mod: SlotBucket; index: number }): string => {
  if (slot.mod === null) return String(slot.index);
  return /\p{N}$/u.test(slot.mod) ? `${slot.mod} ${slot.index}` : `${slot.mod}${slot.index}`;
};

/**
 * @function slotTitle
 * @param slot {{ mod: SlotBucket; index: number }} a slot
 * @returns {string} slotLabel, but "No slot 4" for no-slot maps (for accessible names)
 */
export const slotTitle = (slot: { mod: SlotBucket; index: number }): string =>
  slot.mod === null ? `${NO_SLOT_NAME} ${slot.index}` : slotLabel(slot);

export const BUCKET_CODE_MESSAGES = Object.freeze({
  empty: "Type a code for the slot.",
  long: `Slot codes are at most ${MAX_BUCKET_CODE_LENGTH} characters.`,
  chars: "Use letters and digits only.",
  builtIn: "That's a built-in slot.",
  taken: "This pool already has a slot with that code.",
  full: `A pool can have at most ${MAX_CUSTOM_BUCKETS} custom slots.`,
} as const);

export type BucketCodeError = keyof typeof BUCKET_CODE_MESSAGES;

/**
 * @function checkBucketCode
 * @param list {readonly BucketEntry[]} current bucket list
 * @param code {string} proposed custom code (already trimmed)
 * @param options {{ renaming?: string }} the code being renamed, which may keep its own spelling in another case
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
  const folded = code.toUpperCase();
  if (isModBucket(folded)) return "builtIn";
  if (list.some((entry) => entry.code !== renaming && entry.code.toUpperCase() === folded)) {
    return "taken";
  }
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

const isColor = (color: number): boolean =>
  Number.isInteger(color) && color >= 0 && color < PALETTE_SIZE;

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

/**
 * @function addBucket
 * @param pool {Pool} pool
 * @param code {string} new custom code
 * @param color {number} palette id
 * @returns {Pool} pool with the bucket before TB, or the same pool when refused
 */
export const addBucket = (pool: Pool, code: string, color: number): Pool => {
  const list = bucketsOf(pool);
  if (!isColor(color) || checkBucketCode(list, code) !== null) return pool;
  return withBuckets(pool, insertBeforeTb(list, { code, color }));
};

/**
 * @function addBuckets
 * @param pool {Pool} pool
 * @param entries {readonly CustomBucket[]} buckets to add, in order
 * @returns {Pool} pool with every bucket that could be added
 */
export const addBuckets = (pool: Pool, entries: readonly CustomBucket[]): Pool =>
  entries.reduce((next, entry) => addBucket(next, entry.code, entry.color), pool);

/**
 * @function renameBucket
 * @param pool {Pool} pool
 * @param code {string} custom bucket to rename
 * @param next {string} new code
 * @returns {Pool} pool with the bucket and all its slots renamed, or the same pool when refused
 */
export const renameBucket = (pool: Pool, code: string, next: string): Pool => {
  const list = bucketsOf(pool);
  const entry = findBucket(list, code);
  if (
    !entry ||
    !isCustomBucket(entry) ||
    next === code ||
    checkBucketCode(list, next, { renaming: code }) !== null
  ) {
    return pool;
  }
  const renamed = withBuckets(
    pool,
    // Spread the entry so its color and mods come along.
    list.map((e) => (e.code === code ? { ...entry, code: next } : e)),
  );
  return { ...renamed, slots: pool.slots.map((s) => (s.mod === code ? { ...s, mod: next } : s)) };
};

/**
 * @function recolorBucket
 * @param pool {Pool} pool
 * @param code {string} custom bucket
 * @param color {number} palette id
 * @returns {Pool} pool with the new color, or the same pool when refused
 */
export const recolorBucket = (pool: Pool, code: string, color: number): Pool => {
  const list = bucketsOf(pool);
  const entry = findBucket(list, code);
  if (!entry || !isCustomBucket(entry) || !isColor(color)) return pool;
  return withBuckets(
    pool,
    list.map((e) => (e.code === code ? { ...entry, color } : e)),
  );
};

/**
 * @function moveBucket
 * @param pool {Pool} pool
 * @param code {string} any bucket
 * @param to {number} 0-based position in the list after the move
 * @returns {Pool} pool with the bucket moved, or the same pool when refused or already there
 */
export const moveBucket = (pool: Pool, code: string, to: number): Pool => {
  const list = bucketsOf(pool);
  const from = list.findIndex((e) => e.code === code);
  const entry = list[from];
  if (!entry || !Number.isInteger(to) || to < 0 || to >= list.length || to === from) return pool;
  const rest = list.filter((_, i) => i !== from);
  return withBuckets(pool, [...rest.slice(0, to), entry, ...rest.slice(to)]);
};

/**
 * @function removeBucket
 * @param pool {Pool} pool
 * @param code {string} custom bucket
 * @returns {Pool} pool without it, or the same pool for built-ins, unknown codes, or buckets with maps
 */
export const removeBucket = (pool: Pool, code: string): Pool => {
  const list = bucketsOf(pool);
  const entry = findBucket(list, code);
  if (!entry || !isCustomBucket(entry) || pool.slots.some((s) => s.mod === code)) return pool;
  return withBuckets(
    pool,
    list.filter((e) => e.code !== code),
  );
};

/**
 * @function setBucketMods
 * @param pool {Pool} pool
 * @param code {string} custom bucket
 * @param mods {SlotMods} what its maps are played with; "none" removes the setting
 * @returns {Pool} pool with the new setting, or the same pool for built-ins, unknown codes, or
 *          a forced set that isn't valid
 */
export const setBucketMods = (pool: Pool, code: string, mods: SlotMods): Pool => {
  const list = bucketsOf(pool);
  const entry = findBucket(list, code);
  if (!entry || !isCustomBucket(entry)) return pool;
  if (mods.kind === "forced" && modSetProblem(mods.set) !== null) return pool;
  const { mods: _previous, ...rest } = entry;
  const next: CustomBucket =
    mods.kind === "none"
      ? rest
      : {
          ...rest,
          mods: mods.kind === "free" ? { kind: "free" } : { kind: "forced", set: [...mods.set] },
        };
  return withBuckets(
    pool,
    list.map((e) => (e.code === code ? next : e)),
  );
};
