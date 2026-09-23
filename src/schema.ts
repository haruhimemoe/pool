/**
 * @file src/schema.ts
 * @desc Pool identity schemas (zod): what a pack key, a draft, and a stored pool contain (no
 *       beatmap metadata). A slot's `mod` is a bucket code or null (no slot); `buckets` is the
 *       pool's full ordered bucket list, omitted when it is the six built-ins in default order.
 *       Custom buckets may carry mods (forced or freemod).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Wed Sep 23, 2026
 */

import { z } from "zod";
import {
  BUCKET_CODE_PATTERN,
  isModBucket,
  MAX_CUSTOM_BUCKETS,
  MAX_NAME_LENGTH,
  MAX_SLOT_INDEX,
  MAX_SLOTS,
  MOD_BUCKETS,
  type ModBucket,
  PALETTE_SIZE,
} from "./constants.js";
import { MAX_FORCED_MODS, MOD_ACRONYMS, MOD_SET_MESSAGES, modSetProblem } from "./mods.js";

export const beatmapIdSchema = z.number().int().min(1).max(2_147_483_647);
export const bucketCodeSchema = z.string().regex(BUCKET_CODE_PATTERN);
export const paletteColorSchema = z
  .number()
  .int()
  .min(0)
  .max(PALETTE_SIZE - 1);

export const modAcronymSchema = z.enum(MOD_ACRONYMS);

/**
 * A custom slot's mods as stored: forced (1 to 3 mods, valid together, in MOD_ACRONYMS order) or
 * freemod. Absent means no mods; "none" is never stored.
 */
// A discriminated union, so a bad forced set reports its own message (not just "Invalid input").
export const storedSlotModsSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("forced"),
    set: z
      .array(modAcronymSchema)
      .min(1)
      .max(MAX_FORCED_MODS)
      .superRefine((set, ctx) => {
        const problem = modSetProblem(set);
        if (problem) ctx.addIssue({ code: "custom", message: MOD_SET_MESSAGES[problem] });
      }),
  }),
  z.strictObject({ kind: z.literal("free") }),
]);

export type StoredSlotMods = z.infer<typeof storedSlotModsSchema>;

export const builtInBucketSchema = z.strictObject({ code: z.enum(MOD_BUCKETS) });
export const customBucketSchema = z.strictObject({
  code: bucketCodeSchema,
  color: paletteColorSchema,
  mods: storedSlotModsSchema.optional(),
});
export const bucketEntrySchema = z.union([builtInBucketSchema, customBucketSchema]);

export type BuiltInBucket = { code: ModBucket };
export type CustomBucket = z.infer<typeof customBucketSchema>;
export type BucketEntry = BuiltInBucket | CustomBucket;
/** A bucket code, or null for "no slot". */
export type SlotBucket = string | null;

export const poolSlotSchema = z.object({
  mod: bucketCodeSchema.nullable(),
  index: z.number().int().min(1).max(MAX_SLOT_INDEX),
  beatmapId: beatmapIdSchema,
});

export type PoolSlot = z.infer<typeof poolSlotSchema>;

/**
 * @function slotKey
 * @param slot {{ mod: SlotBucket; index: number }} a slot's identity
 * @returns {string} unique per (mod, index); no slot is its own group
 */
export const slotKey = (slot: { mod: SlotBucket; index: number }): string =>
  `${slot.mod === null ? "" : `b:${slot.mod}`}#${slot.index}`;

const slotsSchema = z
  .array(poolSlotSchema)
  .max(MAX_SLOTS)
  .refine((slots) => new Set(slots.map(slotKey)).size === slots.length, {
    message: "each slot (bucket + number) can only appear once",
  });

const bucketsSchema = z.array(bucketEntrySchema).max(MOD_BUCKETS.length + MAX_CUSTOM_BUCKETS);

const DEFAULT_LIST: BucketEntry[] = MOD_BUCKETS.map((code) => ({ code }));
const isCustom = (entry: BucketEntry): entry is CustomBucket => "color" in entry;

/**
 * @function checkPoolBuckets
 * @param pool {{ slots; buckets? }} a parsed pool
 * @param ctx {z.RefinementCtx} zod refinement context
 * @returns {void} adds an issue for: a built-in missing or listed twice, a custom code that clashes
 *          (case-insensitively) with a built-in or another custom, more than 8 customs, or a slot
 *          whose bucket isn't in the list
 */
export const checkPoolBuckets = (
  pool: { slots: PoolSlot[]; buckets?: BucketEntry[] | undefined },
  ctx: z.RefinementCtx,
): void => {
  const issue = (message: string, path: (string | number)[]) =>
    ctx.addIssue({ code: "custom", message, path });
  const list = pool.buckets ?? DEFAULT_LIST;
  const seen = new Set<string>();
  list.forEach((entry, i) => {
    // Codes compare case-insensitively everywhere (upper-cased), but are stored as typed.
    const folded = entry.code.toUpperCase();
    if (seen.has(folded)) issue(`slot ${entry.code} is listed more than once`, ["buckets", i]);
    seen.add(folded);
    if (isCustom(entry) && isModBucket(folded)) {
      issue(`${entry.code} is a built-in slot`, ["buckets", i]);
    }
  });
  for (const code of MOD_BUCKETS) {
    if (!list.some((entry) => !isCustom(entry) && entry.code === code)) {
      issue(`the slot list is missing ${code}`, ["buckets"]);
    }
  }
  if (list.filter(isCustom).length > MAX_CUSTOM_BUCKETS) {
    issue(`a pool can have at most ${MAX_CUSTOM_BUCKETS} custom slots`, ["buckets"]);
  }
  const codes = new Set(list.map((entry) => entry.code));
  pool.slots.forEach((slot, i) => {
    if (slot.mod !== null && !codes.has(slot.mod)) {
      issue(`slot ${slot.mod} isn't one of this pool's slots`, ["slots", i, "mod"]);
    }
  });
};

/** The unrefined pool object, for `.extend()` (e.g. a stored pool with more fields); refine the result yourself. */
export const poolFields = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  slots: slotsSchema,
  buckets: bucketsSchema.optional(),
});

/** A complete pool as encoded in a key: non-empty trimmed name. */
export const poolSchema = poolFields.superRefine(checkPoolBuckets);

/** A pool being edited: the name may be empty mid-typing. */
export const poolDraftSchema = poolFields
  .extend({ name: z.string().max(MAX_NAME_LENGTH) })
  .superRefine(checkPoolBuckets);

export type Pool = z.infer<typeof poolSchema>;
