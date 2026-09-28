/**
 * @file src/labels.ts
 * @desc What UI shows for a pool: bucket names and select labels, slot labels ("NM1", "RC1 2")
 *       that the pasted-pool parser reads back as the same slot, and a pool name made safe to
 *       show (keys carry names as typed, control and bidi characters included).
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Sep 28, 2026
 * @modified Mon Sep 28, 2026
 */

import { isCustomBucket } from "./buckets.js";
import { codeEndsInDigit } from "./codes.js";
import { MOD_BUCKET_NAMES, NO_SLOT_NAME } from "./constants.js";
import type { BucketEntry, SlotBucket } from "./schema.js";

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
 * @returns {string} "NM1", "Speed2", "RC1 2" (a space when the code ends in a digit), or "4" for
 *          no slot
 */
export const slotLabel = (slot: { mod: SlotBucket; index: number }): string => {
  if (slot.mod === null) return String(slot.index);
  return codeEndsInDigit(slot.mod) ? `${slot.mod} ${slot.index}` : `${slot.mod}${slot.index}`;
};

/**
 * @function slotTitle
 * @param slot {{ mod: SlotBucket; index: number }} a slot
 * @returns {string} slotLabel, but "No slot 4" for no-slot maps (for accessible names)
 */
export const slotTitle = (slot: { mod: SlotBucket; index: number }): string =>
  slot.mod === null ? `${NO_SLOT_NAME} ${slot.index}` : slotLabel(slot);

/** Runs of control characters (Cc: NUL, tab, CR, LF, ESC, …) and line or paragraph separators. */
const CONTROL_RUNS = /[\p{Cc}\u2028\u2029]+/gu;
/** Bidi formatting: the Arabic letter mark, LRM, RLM, the embeddings, overrides and isolates. */
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

/**
 * @function displayPoolName
 * @param name {string} a pool name, which keys carry as typed (so treat it as untrusted)
 * @returns {string} the name with each run of control characters and line breaks turned into one
 *          space and bidi controls (such as U+202E) removed, then trimmed. May be "" (a name of
 *          only controls): pick your own fallback. Escape it for HTML, file names and headers as
 *          usual.
 */
export const displayPoolName = (name: string): string =>
  name.replace(CONTROL_RUNS, " ").replace(BIDI_CONTROLS, "").trim();
