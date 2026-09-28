/**
 * @file src/bucket-edits.ts
 * @desc Pure edits to a pool's bucket list: add, rename, recolor, move and remove custom slots, and
 *       set their mods. Every edit returns the same pool object when it refuses, and keeps
 *       `buckets` canonical (omitted when it equals the default).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Mon Sep 28, 2026
 */

import {
  bucketsOf,
  canonicalBuckets,
  checkBucketCode,
  findBucket,
  insertBeforeTb,
  isCustomBucket,
} from "./buckets.js";
import { PALETTE_SIZE } from "./constants.js";
import { modSetProblem, type SlotMods } from "./mods.js";
import { sortSlots } from "./pool.js";
import type { BucketEntry, CustomBucket, Pool } from "./schema.js";

/**
 * @function withBuckets
 * @param pool {Pool} a pool
 * @param list {readonly BucketEntry[]} its new bucket list
 * @returns {Pool} name + slots in the list's pool order (the same array when the order holds) +
 *          the canonical list (field omitted for the default)
 */
export const withBuckets = (pool: Pool, list: readonly BucketEntry[]): Pool => {
  const sorted = sortSlots(pool.slots, list);
  const slots = sorted.every((slot, i) => slot === pool.slots[i]) ? pool.slots : sorted;
  const buckets = canonicalBuckets(list);
  return buckets ? { name: pool.name, slots, buckets } : { name: pool.name, slots };
};

const isColor = (color: number): boolean =>
  Number.isInteger(color) && color >= 0 && color < PALETTE_SIZE;

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
  const slots = pool.slots.map((s) => (s.mod === code ? { ...s, mod: next } : s));
  return withBuckets(
    { ...pool, slots },
    // Spread the entry so its color and mods come along.
    list.map((e) => (e.code === code ? { ...entry, code: next } : e)),
  );
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
 * @returns {Pool} pool without it, or the same pool for built-ins, unknown codes, or buckets with
 *          maps
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
