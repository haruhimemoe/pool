/**
 * @file src/service.ts
 * @desc @haruhimemoe/pool/service: the contract between pools.haruhime.moe and packs.haruhime.moe.
 *       A pack input (what packs saves: name, description, visibility, slots, buckets, with the
 *       content filter on every published text), the PUT /api/service/pools/{ref} body pools
 *       sends (exactly a pack input, unknown keys refused, visibility required), the ref, and
 *       packs' answers. Its own entry point, since it loads the content filter's word list.
 *       Moved from packs (src/schemas/saved-pack.ts, src/schemas/pools-service.ts) and pools
 *       (src/lib/packs-client.ts, src/utils/pack-input.ts), which each had their own copy.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Sep 28, 2026
 * @modified Mon Sep 28, 2026
 */

import { z } from "zod";
import { MAX_NAME_LENGTH } from "./constants.js";
import { hasBlockedLanguage } from "./content-filter.js";
import { checkPoolBuckets, poolFields } from "./schema.js";

/** Who can see a saved pack: only its owner, anyone with the link, or everyone (listed). */
export const PACK_VISIBILITIES = Object.freeze(["private", "unlisted", "public"] as const);
/** One of PACK_VISIBILITIES. */
export const packVisibilitySchema = z.enum(PACK_VISIBILITIES);
/** One of PACK_VISIBILITIES. */
export type PackVisibility = z.infer<typeof packVisibilitySchema>;
/** What packInputSchema gives a pack input that doesn't say. */
export const DEFAULT_PACK_VISIBILITY: PackVisibility = "unlisted";

/** A pack description's longest length, in UTF-16 code units (like the name), after trimming. */
export const MAX_DESCRIPTION_LENGTH = 500;

/**
 * @function normalizeDescription
 * @param text {string} a description as typed
 * @returns {string} CRLF and CR turned into LF, trimmed
 */
export const normalizeDescription = (text: string): string => text.replace(/\r\n?/g, "\n").trim();

/** A pack description: line endings normalized, trimmed, at most 500; "" means none. */
export const packDescriptionSchema = z
  .string()
  .transform(normalizeDescription)
  .pipe(
    z
      .string()
      .max(
        MAX_DESCRIPTION_LENGTH,
        `Keep the description to ${MAX_DESCRIPTION_LENGTH} characters or fewer.`,
      ),
  );

/** Text over its limit already fails; skipping the blocklist keeps huge bodies cheap. */
const isClean =
  (max: number) =>
  (text: string): boolean =>
    text.length > max || !hasBlockedLanguage(text);
const cleanMessage = (field: string) => `Please keep the ${field} free of slurs.`;

/**
 * What packs saves (POST /api/packs, PUT /api/packs/{slug}, and the pools service's PUT body):
 * the pool's fields, a visibility (unlisted when left out) and an optional description. The name,
 * the description and every custom slot code go through the content filter, since packs can list
 * them publicly. At least one map. Unknown keys (ownerId, slug) are dropped.
 */
export const packInputSchema = poolFields
  .extend({
    name: poolFields.shape.name.refine(isClean(MAX_NAME_LENGTH), cleanMessage("name")),
    visibility: packVisibilitySchema.default(DEFAULT_PACK_VISIBILITY),
    description: packDescriptionSchema
      .refine(isClean(MAX_DESCRIPTION_LENGTH), cleanMessage("description"))
      .optional(),
  })
  .superRefine(checkPoolBuckets)
  .superRefine((pack, ctx) => {
    for (const [i, bucket] of (pack.buckets ?? []).entries()) {
      if (hasBlockedLanguage(bucket.code)) {
        ctx.addIssue({
          code: "custom",
          path: ["buckets", i, "code"],
          message: cleanMessage("slot names"),
        });
      }
    }
  })
  .refine((pack) => pack.slots.length > 0, {
    message: "Add at least one map before saving.",
    path: ["slots"],
  });

/** A pack input as packInputSchema returns it. */
export type PackInput = z.output<typeof packInputSchema>;
/** A pack input as a client sends it (visibility and description optional). */
export type PackInputBody = z.input<typeof packInputSchema>;

/** A pools pool id, packs' `ref` for its pack (`otdb-58`, `otdb-58-2`, `host-k3j9x0ab`). */
export const POOLS_REF_PATTERN = /^[a-z0-9-]{1,64}$/;
/** A pools pool id: POOLS_REF_PATTERN. */
export const poolsRefSchema = z.string().regex(POOLS_REF_PATTERN);

/**
 * The PUT /api/service/pools/{ref} body: a strict object first, so a key a pack input doesn't have
 * is a 400 instead of being dropped, and visibility is required instead of defaulting; then
 * packInputSchema itself, with every limit, the content filter and the bucket checks.
 */
export const poolsPackBodySchema = z
  .strictObject({
    name: z.unknown().optional(),
    description: z.unknown().optional(),
    visibility: packVisibilitySchema.optional(),
    slots: z.unknown().optional(),
    buckets: z.unknown().optional(),
  })
  .refine((body) => body.visibility !== undefined, {
    message: "Send visibility: public or unlisted.",
    path: ["visibility"],
  })
  .pipe(packInputSchema);

/** The PUT body pools sends: a pack input with visibility always set. */
export type PoolsPackBody = PackInputBody & { visibility: PackVisibility };

/** What a PUT did to the pack: made it, changed it, or found it already the same. */
export const POOLS_SYNC_STATES = Object.freeze(["created", "updated", "unchanged"] as const);
/** One of POOLS_SYNC_STATES. */
export type PoolsSyncState = (typeof POOLS_SYNC_STATES)[number];

/** packs' answer to the PUT: the pack's slug, what happened, and whether packs lists it. */
export const poolsSyncAnswerSchema = z.object({
  slug: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  state: z.enum(POOLS_SYNC_STATES),
  /** False when a moderator hid the pack or it's unlisted. */
  listed: z.boolean(),
});
/** packs' answer to the PUT (poolsSyncAnswerSchema). */
export type PoolsSyncAnswer = z.infer<typeof poolsSyncAnswerSchema>;

/** packs' answer to POST /api/service/pools/stats: packs updated this batch, and packs left. */
export const poolsStatsAnswerSchema = z.object({
  updated: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});
/** packs' answer to one stats batch (poolsStatsAnswerSchema). */
export type PoolsStatsAnswer = z.infer<typeof poolsStatsAnswerSchema>;
