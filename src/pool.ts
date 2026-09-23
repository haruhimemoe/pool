/**
 * @file src/pool.ts
 * @desc Pure pool editing helpers over Pool. Every function returns a new value (or the same
 *       pool when an edit is refused). Pool order: no-slot maps, then the pool's buckets in order.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Wed Sep 23, 2026
 */

import { bucketsOf, DEFAULT_BUCKETS, findBucket } from "./buckets.js";
import { MAX_SLOT_INDEX, MAX_SLOTS } from "./constants.js";
import {
  type BucketEntry,
  type Pool,
  type PoolSlot,
  poolSlotSchema,
  type SlotBucket,
  slotKey,
} from "./schema.js";

/**
 * @function sortSlots
 * @param slots {readonly PoolSlot[]} any order
 * @param buckets {readonly BucketEntry[]} the pool's bucket order (default: the six built-ins)
 * @returns {PoolSlot[]} new array: no-slot first, then bucket order, then slot index
 */
export const sortSlots = (
  slots: readonly PoolSlot[],
  buckets: readonly BucketEntry[] = DEFAULT_BUCKETS,
): PoolSlot[] => {
  const rank = new Map(buckets.map((entry, i) => [entry.code, i]));
  const rankOf = (mod: SlotBucket): number =>
    mod === null ? -1 : (rank.get(mod) ?? buckets.length);
  return [...slots].sort((a, b) => rankOf(a.mod) - rankOf(b.mod) || a.index - b.index);
};

/**
 * @function nextSlotIndex
 * @param slots {readonly PoolSlot[]} current slots
 * @param mod {SlotBucket} bucket, or null for no slot
 * @returns {number} one past the highest index in that group (1 when empty)
 */
export const nextSlotIndex = (slots: readonly PoolSlot[], mod: SlotBucket): number =>
  Math.max(0, ...slots.filter((s) => s.mod === mod).map((s) => s.index)) + 1;

/** A slot may only name a bucket the pool has (null = no slot), or validation fails on save. */
const hasBucket = (pool: Pool, mod: SlotBucket): boolean =>
  mod === null || findBucket(bucketsOf(pool), mod) !== undefined;

const withSlots = (pool: Pool, slots: PoolSlot[]): Pool => ({
  ...pool,
  slots: sortSlots(slots, bucketsOf(pool)),
});

/**
 * @function addSlot
 * @param pool {Pool} current pool
 * @param mod {SlotBucket} bucket to append to, or null for no slot
 * @param beatmapId {number} difficulty id
 * @returns {Pool} new pool, or the same pool object when it is full, the group is at 99, or
 *          the bucket doesn't exist
 */
export const addSlot = (pool: Pool, mod: SlotBucket, beatmapId: number): Pool => {
  const index = nextSlotIndex(pool.slots, mod);
  if (pool.slots.length >= MAX_SLOTS || index > MAX_SLOT_INDEX || !hasBucket(pool, mod)) {
    return pool;
  }
  return withSlots(pool, [...pool.slots, { mod, index, beatmapId }]);
};

/**
 * @function removeSlot
 * @param pool {Pool} current pool
 * @param mod {SlotBucket} bucket, or null for no slot
 * @param index {number} slot number to remove
 * @returns {Pool} new pool with later slots in the same group shifted down by one, or the same
 *          pool when no slot matches
 */
export const removeSlot = (pool: Pool, mod: SlotBucket, index: number): Pool => {
  if (!pool.slots.some((s) => s.mod === mod && s.index === index)) return pool;
  return withSlots(
    pool,
    pool.slots
      .filter((s) => !(s.mod === mod && s.index === index))
      .map((s) => (s.mod === mod && s.index > index ? { ...s, index: s.index - 1 } : s)),
  );
};

/**
 * @function moveSlot
 * @param pool {Pool} current pool
 * @param from {{ mod: SlotBucket; index: number }} the slot to move
 * @param to {SlotBucket} target bucket, or null for no slot
 * @returns {Pool} pool with the map at the end of the target group and the old group closed up,
 *          or the same pool when the slot is missing, the group is the same, the target is at 99,
 *          or the target bucket doesn't exist (a stale pick after a rename or delete)
 */
export const moveSlot = (
  pool: Pool,
  from: { mod: SlotBucket; index: number },
  to: SlotBucket,
): Pool => {
  const slot = pool.slots.find((s) => s.mod === from.mod && s.index === from.index);
  const index = nextSlotIndex(pool.slots, to);
  if (!slot || from.mod === to || index > MAX_SLOT_INDEX || !hasBucket(pool, to)) return pool;

  const rest = removeSlot(pool, from.mod, from.index);
  return withSlots(rest, [...rest.slots, { ...slot, mod: to, index }]);
};

export type MergePlan = { added: PoolSlot[]; replaced: PoolSlot[]; dropped: PoolSlot[] };

/**
 * @function planMerge
 * @param slots {readonly PoolSlot[]} current slots
 * @param incoming {readonly PoolSlot[]} slots to upsert by (mod, index)
 * @param buckets {readonly BucketEntry[]} the pool's bucket list; when given, a slot in a bucket
 *        that isn't in it is dropped. Leave it out to preview a paste before its new buckets exist.
 * @returns {MergePlan} new slots that fit, slots that swap in a different map, and dropped slots:
 *          new ones past MAX_SLOTS, any that fail poolSlotSchema (a number past 99, a bad beatmap
 *          ID), and any in an unknown bucket. An incoming slot identical to an existing one is in
 *          none of the lists.
 */
export const planMerge = (
  slots: readonly PoolSlot[],
  incoming: readonly PoolSlot[],
  buckets?: readonly BucketEntry[],
): MergePlan => {
  const byKey = new Map(slots.map((s) => [slotKey(s), s]));
  const plan: MergePlan = { added: [], replaced: [], dropped: [] };
  for (const slot of incoming) {
    const unknownBucket =
      buckets !== undefined && slot.mod !== null && findBucket(buckets, slot.mod) === undefined;
    if (unknownBucket || !poolSlotSchema.safeParse(slot).success) {
      plan.dropped.push(slot);
      continue;
    }
    const key = slotKey(slot);
    const current = byKey.get(key);
    if (current) {
      if (current.beatmapId !== slot.beatmapId) plan.replaced.push(slot);
    } else if (byKey.size < MAX_SLOTS) {
      plan.added.push(slot);
    } else {
      plan.dropped.push(slot);
      continue;
    }
    byKey.set(key, slot);
  }
  return plan;
};

/**
 * @function mergeSlots
 * @param pool {Pool} current pool
 * @param incoming {readonly PoolSlot[]} slots to upsert by (mod, index)
 * @returns {Pool} new pool; replacements always apply, new slots stop at MAX_SLOTS, and slots
 *          planMerge drops (a bad number or ID, a bucket the pool doesn't have) are left out, so
 *          a valid pool stays valid. Add a paste's new buckets first (addBuckets).
 */
export const mergeSlots = (pool: Pool, incoming: readonly PoolSlot[]): Pool => {
  const { added, replaced } = planMerge(pool.slots, incoming, bucketsOf(pool));
  const byKey = new Map(pool.slots.map((s) => [slotKey(s), s]));
  for (const slot of [...added, ...replaced]) byKey.set(slotKey(slot), slot);
  return withSlots(pool, [...byKey.values()]);
};
