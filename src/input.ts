/**
 * @file src/input.ts
 * @desc Turns what hosts paste (IDs, osu! links, spreadsheet rows like "NM1 129891" or "EZ2 5")
 *       into slots, creating custom buckets for unknown codes.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Wed Sep 23, 2026
 */

import {
  bucketsOf,
  checkBucketCode,
  insertBeforeTb,
  matchBucketCode,
  nextFreeColor,
  slotLabel,
} from "./buckets.js";
import { nextSlotIndex } from "./pool.js";
import {
  type BucketEntry,
  beatmapIdSchema,
  type CustomBucket,
  type PoolSlot,
  slotKey,
} from "./schema.js";

export type BeatmapRefResult =
  | { ok: true; beatmapId: number }
  | { ok: false; reason: "set-only" | "unrecognized" };

export const BEATMAP_REF_MESSAGES: Record<"set-only" | "unrecognized", string> = {
  "set-only":
    "That link is a whole beatmapset. Open the difficulty you want on osu! and copy that link.",
  unrecognized: "Paste a beatmap ID or an osu.ppy.sh beatmap link.",
};

const DIFFICULTY_LINKS = [
  /osu\.ppy\.sh\/beatmapsets\/\d+\/?#(?:osu|taiko|fruits|mania)\/(\d+)/i,
  /osu\.ppy\.sh\/beatmaps\/(\d+)/i,
  /osu\.ppy\.sh\/b\/(\d+)/i,
];
const SET_LINKS = [/osu\.ppy\.sh\/beatmapsets\/\d+/i, /osu\.ppy\.sh\/s\/\d+/i];

const toBeatmapId = (digits: string): BeatmapRefResult => {
  const id = Number(digits);
  return beatmapIdSchema.safeParse(id).success
    ? { ok: true, beatmapId: id }
    : { ok: false, reason: "unrecognized" };
};

/**
 * @function parseBeatmapRef
 * @param token {string} a difficulty ID or an osu.ppy.sh difficulty link
 * @returns {BeatmapRefResult} the beatmap (difficulty) id, or why it couldn't be read
 */
export const parseBeatmapRef = (token: string): BeatmapRefResult => {
  const text = token.trim();
  if (/^\d+$/.test(text)) return toBeatmapId(text);
  for (const pattern of DIFFICULTY_LINKS) {
    const digits = pattern.exec(text)?.[1];
    if (digits) return toBeatmapId(digits);
  }
  if (SET_LINKS.some((pattern) => pattern.test(text))) return { ok: false, reason: "set-only" };
  return { ok: false, reason: "unrecognized" };
};

/** "<code>[<n>][:.-] <id or link>" after a code that is already known. */
const AFTER_CODE = /^\s?(\d{1,2})?\s*[:.-]?\s+(\S+)/u;
/** Same, for a code we haven't seen: 1-12 letters/digits, shortest first so "EZ1" is EZ + 1. */
const SLOT_LINE = /^([\p{L}\p{N}]{1,12}?)\s?(\d{1,2})?\s*[:.-]?\s+(\S+)/u;

export const POOL_LINE_HELP =
  "Start the line with a slot like NM1 or EZ2, or paste only beatmap IDs or links.";

export type SlotLineError = { line: number; text: string; reason: string };

type LineParts = { code: string; index: string | undefined; ref: string };

/** "<code> <n> <id or link>" with a space before the slot number: the whole first token is the code. */
const SPACED_LINE = /^([\p{L}\p{N}]{1,12})\s+(\d{1,2})\s*[:.-]?\s+(\S+)/u;

/**
 * Longest known code first, so an "RC1" bucket wins over reading "RC" + index 1. A code ending
 * in a digit, glued to more digits ("EZ12"), is only taken when no shorter code fits: by the label
 * rule "EZ12" is EZ slot 12, and EZ1 slot 2 is written "EZ1 2".
 */
const splitKnownCode = (line: string, list: readonly BucketEntry[]): LineParts | null => {
  const codes = list.map((e) => e.code).sort((a, b) => b.length - a.length);
  let glued: LineParts | null = null;
  for (const code of codes) {
    if (line.slice(0, code.length).toUpperCase() !== code.toUpperCase()) continue;
    const after = line.slice(code.length);
    const rest = AFTER_CODE.exec(after);
    if (!rest) continue;
    const parts = { code, index: rest[1], ref: rest[2] ?? "" };
    if (/\p{N}$/u.test(code) && /^\d/.test(after)) glued ??= parts;
    else return parts;
  }
  return glued;
};

/** "RC1 2 555": a first token ending in a digit, then a slot number, then a beatmap. */
const splitSpacedCode = (line: string): LineParts | null => {
  const match = SPACED_LINE.exec(line);
  if (!match?.[1] || !/\p{N}$/u.test(match[1]) || !parseBeatmapRef(match[3] ?? "").ok) return null;
  return { code: match[1], index: match[2], ref: match[3] ?? "" };
};

/**
 * @function parsePoolText
 * @param text {string} pasted pool: slot lines ("NM1 129891", "EZ2: <link>") and/or ID lines
 *             ("129891", "1872396, 2000001"); blank lines and "#" comments are skipped
 * @param pool {{ slots; buckets? }} current pool, for numbering no-slot maps and matching codes
 * @returns {{ slots: PoolSlot[]; newBuckets: CustomBucket[]; errors: SlotLineError[] }} good
 *          lines as slots, custom buckets to create (unknown codes, next free color, before TB),
 *          and bad lines with 1-based line numbers and a reason
 */
export const parsePoolText = (
  text: string,
  pool: { slots: readonly PoolSlot[]; buckets?: readonly BucketEntry[] | undefined },
): { slots: PoolSlot[]; newBuckets: CustomBucket[]; errors: SlotLineError[] } => {
  const slots: PoolSlot[] = [];
  const newBuckets: CustomBucket[] = [];
  const errors: SlotLineError[] = [];
  const seen = new Set<string>();
  let list: BucketEntry[] = [...bucketsOf(pool)];
  let noSlotIndex = nextSlotIndex(pool.slots, null);

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const fail = (reason: string) => errors.push({ line: i + 1, text: line, reason });

    // ID lines: every leading token that is an ID or difficulty link is a no-slot map; anything
    // after the first non-ID token (titles, mapper names) is ignored.
    const tokens = line.split(/[\s,]+/u).filter(Boolean);
    const first = parseBeatmapRef(tokens[0] ?? "");
    if (first.ok) {
      for (const token of tokens) {
        const ref = parseBeatmapRef(token);
        if (!ref.ok) break;
        slots.push({ mod: null, index: noSlotIndex++, beatmapId: ref.beatmapId });
      }
      return;
    }
    if (first.reason === "set-only") {
      fail(BEATMAP_REF_MESSAGES["set-only"]);
      return;
    }

    const generic = SLOT_LINE.exec(line);
    const parts: LineParts | null =
      splitSpacedCode(line) ??
      splitKnownCode(line, list) ??
      (generic ? { code: generic[1] ?? "", index: generic[2], ref: generic[3] ?? "" } : null);
    if (!parts) {
      fail(POOL_LINE_HELP);
      return;
    }
    const index = parts.index === undefined ? 1 : Number(parts.index);
    if (index < 1) {
      fail("Slot numbers start at 1.");
      return;
    }
    const ref = parseBeatmapRef(parts.ref);
    if (!ref.ok) {
      fail(BEATMAP_REF_MESSAGES[ref.reason]);
      return;
    }

    let mod = matchBucketCode(list, parts.code);
    if (mod === null) {
      // "1. 129891" is a numbered list, not a slot called "1".
      if (/^\p{N}+$/u.test(parts.code)) {
        fail(POOL_LINE_HELP);
        return;
      }
      const problem = checkBucketCode(list, parts.code);
      if (problem === "full") {
        fail("This pool already has 8 custom slots.");
        return;
      }
      if (problem !== null) {
        fail(POOL_LINE_HELP);
        return;
      }
      const bucket: CustomBucket = { code: parts.code, color: nextFreeColor(list) };
      list = insertBeforeTb(list, bucket);
      newBuckets.push(bucket);
      mod = bucket.code;
    }

    const key = slotKey({ mod, index });
    if (seen.has(key)) {
      fail(`${slotLabel({ mod, index })} appears more than once.`);
      return;
    }
    seen.add(key);
    slots.push({ mod, index, beatmapId: ref.beatmapId });
  });

  return { slots, newBuckets, errors };
};
