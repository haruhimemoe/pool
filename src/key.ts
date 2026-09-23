/**
 * @file src/key.ts
 * @desc The pack key codec: a pool's identity (name, slots, bucket list including custom slots'
 *       mods) as binary, CRC-16 protected, base64url. "pk1." when the pool uses the default
 *       buckets and no no-slot maps, "pk2." for custom slots, a changed order, or no-slot maps,
 *       and "pk3." only when a custom slot has mods, so every older key encodes exactly as
 *       before. Metadata is never in a key. docs/pack-key.md documents every version.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Wed Sep 23, 2026
 */

import { base64UrlToBytes, bytesToBase64Url } from "./base64url.js";
import { bucketsOf, canonicalBuckets, isCustomBucket } from "./buckets.js";
import { MAX_CUSTOM_BUCKETS, MAX_SLOTS, MOD_BUCKETS, type ModBucket } from "./constants.js";
import { crc16CcittFalse } from "./crc16.js";
import { bitmaskToMods, modsToBitmask } from "./mods.js";
import { sortSlots } from "./pool.js";
import {
  type BucketEntry,
  type Pool,
  type PoolSlot,
  poolSchema,
  type StoredSlotMods,
} from "./schema.js";
import { decodeVarint, encodeVarint } from "./varint.js";

/** Every key version this build reads. Append only; the pack-key guide documents each one. */
export const PACK_KEY_VERSIONS = [1, 2, 3] as const;

export type PackKeyVersion = (typeof PACK_KEY_VERSIONS)[number];

const KEY_PATTERN = /^pk(\d+)\.(.*)$/s;
const KEY_IN_TEXT = /pk\d+\.[A-Za-z0-9_-]+/;
/** Bucket table entry: a custom bucket follows (color, code length, code). */
const CUSTOM_ENTRY = 0xfe;
/** Bucket table entry, pk3 only: a custom bucket with mods (color, code, mode, [bitmask]). */
const CUSTOM_WITH_MODS_ENTRY = 0xfd;
const MODS_FORCED = 1;
const MODS_FREE = 2;
/** Slot bucket byte meaning "no slot". */
const NO_SLOT = 0xff;

export type PackKeyErrorCode =
  | "empty"
  | "prefix"
  | "version"
  | "encoding"
  | "checksum"
  | "malformed";

export const PACK_KEY_ERROR_MESSAGES: Record<PackKeyErrorCode, string> = {
  empty: "Paste a pack key first.",
  prefix: "That doesn't look like a pack key. Keys start with pk1., pk2. or pk3.",
  version: "This key uses a newer format than this app can read.",
  encoding:
    "This key has characters that don't belong in a pack key. Check that it was copied whole.",
  checksum: "This key is damaged or incomplete. Copy it again from where you got it.",
  malformed: "This key is damaged or incomplete. Copy it again from where you got it.",
};

export class PackKeyError extends Error {
  readonly code: PackKeyErrorCode;

  constructor(code: PackKeyErrorCode) {
    super(PACK_KEY_ERROR_MESSAGES[code]);
    this.name = "PackKeyError";
    this.code = code;
  }
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

const pushString = (text: string, out: number[]) => {
  const bytes = utf8Encoder.encode(text);
  encodeVarint(bytes.length, out);
  out.push(...bytes);
};

const pushSlot = (bucketByte: number, slot: PoolSlot, out: number[]) => {
  out.push(bucketByte);
  encodeVarint(slot.index, out);
  encodeVarint(slot.beatmapId, out);
};

const pushTableEntry = (entry: BucketEntry, out: number[]) => {
  if (!isCustomBucket(entry)) {
    out.push(MOD_BUCKETS.indexOf(entry.code));
    return;
  }
  if (entry.mods === undefined) {
    // Exactly the pk2 bytes, so pools without mods keep their keys.
    out.push(CUSTOM_ENTRY, entry.color);
    pushString(entry.code, out);
    return;
  }
  out.push(CUSTOM_WITH_MODS_ENTRY, entry.color);
  pushString(entry.code, out);
  if (entry.mods.kind === "forced") out.push(MODS_FORCED, modsToBitmask(entry.mods.set));
  else out.push(MODS_FREE);
};

/**
 * @function encodePackKey
 * @param pool {Pool} pool identity
 * @returns {string} "pk1.", "pk2." or "pk3." + base64url(body + CRC-16)
 * @throws {ZodError} when the pool fails poolSchema (empty name, bad slot, bad bucket list, bad mods)
 */
export const encodePackKey = (pool: Pool): string => {
  const parsed = poolSchema.parse(pool);
  const table = bucketsOf(parsed);
  const ordered = sortSlots(parsed.slots, table);
  const hasMods = table.some((entry) => isCustomBucket(entry) && entry.mods !== undefined);
  const hasTable =
    hasMods || canonicalBuckets(table) !== undefined || ordered.some((s) => s.mod === null);
  const version: PackKeyVersion = hasMods ? 3 : hasTable ? 2 : 1;
  const out: number[] = [version];
  pushString(parsed.name, out);
  if (hasTable) {
    encodeVarint(table.length, out);
    for (const entry of table) pushTableEntry(entry, out);
  }
  encodeVarint(ordered.length, out);
  for (const slot of ordered) {
    const bucketByte = hasTable
      ? slot.mod === null
        ? NO_SLOT
        : table.findIndex((e) => e.code === slot.mod)
      : MOD_BUCKETS.indexOf(slot.mod as ModBucket);
    pushSlot(bucketByte, slot, out);
  }
  const crc = crc16CcittFalse(Uint8Array.from(out));
  out.push(crc >> 8, crc & 0xff);
  return `pk${version}.${bytesToBase64Url(Uint8Array.from(out))}`;
};

/** Reads a varint length + UTF-8 string starting at offset. */
const readString = (body: Uint8Array, offset: number): { value: string; next: number } => {
  const length = decodeVarint(body, offset);
  const end = length.next + length.value;
  if (end > body.length) throw new RangeError("string runs past the end");
  return { value: utf8Decoder.decode(body.subarray(length.next, end)), next: end };
};

/**
 * Reads a mode byte and, for forced mods, the bitmask. bitmaskToMods rejects a bit no mod uses
 * (even alongside valid ones); poolSchema then rejects sets that can't be played together.
 */
const readMods = (body: Uint8Array, offset: number): { mods: StoredSlotMods; next: number } => {
  const mode = body[offset];
  if (mode === MODS_FREE) return { mods: { kind: "free" }, next: offset + 1 };
  if (mode === MODS_FORCED) {
    const mask = body[offset + 1];
    if (mask === undefined) throw new RangeError("mods run past the end");
    return { mods: { kind: "forced", set: bitmaskToMods(mask) }, next: offset + 2 };
  }
  throw new RangeError("unknown mods mode");
};

const readTable = (
  body: Uint8Array,
  start: number,
  version: PackKeyVersion,
): { table: BucketEntry[]; next: number } => {
  const count = decodeVarint(body, start);
  if (count.value < MOD_BUCKETS.length || count.value > MOD_BUCKETS.length + MAX_CUSTOM_BUCKETS) {
    throw new RangeError("bad bucket count");
  }
  const table: BucketEntry[] = [];
  let offset = count.next;
  for (let i = 0; i < count.value; i++) {
    const tag = body[offset];
    if (tag === CUSTOM_ENTRY || (tag === CUSTOM_WITH_MODS_ENTRY && version === 3)) {
      const color = body[offset + 1];
      if (color === undefined) throw new RangeError("color runs past the end");
      const code = readString(body, offset + 2);
      if (tag === CUSTOM_ENTRY) {
        table.push({ code: code.value, color });
        offset = code.next;
      } else {
        const mods = readMods(body, code.next);
        table.push({ code: code.value, color, mods: mods.mods });
        offset = mods.next;
      }
    } else {
      const code = MOD_BUCKETS[tag ?? Number.NaN];
      if (code === undefined) throw new RangeError("unknown bucket byte");
      table.push({ code });
      offset += 1;
    }
  }
  return { table, next: offset };
};

const readBody = (body: Uint8Array, version: PackKeyVersion): Pool => {
  const name = readString(body, 1);
  let offset = name.next;
  let table: BucketEntry[] | undefined;
  if (version !== 1) {
    const read = readTable(body, offset, version);
    table = read.table;
    offset = read.next;
  }

  const count = decodeVarint(body, offset);
  offset = count.next;
  if (count.value > MAX_SLOTS) throw new RangeError("too many slots");

  const slots: PoolSlot[] = [];
  for (let i = 0; i < count.value; i++) {
    const tag = body[offset] ?? Number.NaN;
    let mod: string | null;
    if (table) {
      mod = tag === NO_SLOT ? null : (table[tag]?.code ?? "");
      if (mod === "") throw new RangeError("slot points past the bucket table");
    } else {
      const builtIn = MOD_BUCKETS[tag];
      if (builtIn === undefined) throw new RangeError("unknown mod bucket");
      mod = builtIn;
    }
    const index = decodeVarint(body, offset + 1);
    const beatmapId = decodeVarint(body, index.next);
    offset = beatmapId.next;
    slots.push({ mod, index: index.value, beatmapId: beatmapId.value });
  }
  if (offset !== body.length) throw new RangeError("trailing bytes");

  const parsed = poolSchema.safeParse({ name: name.value, slots, buckets: table });
  if (!parsed.success) throw new RangeError("pool fails validation");
  const list = bucketsOf(parsed.data);
  const buckets = canonicalBuckets(list);
  const result: Pool = { name: parsed.data.name, slots: sortSlots(parsed.data.slots, list) };
  return buckets ? { ...result, buckets } : result;
};

/**
 * @function decodePackKey
 * @param input {string} a pack key, surrounding whitespace allowed
 * @returns {Pool} validated pool: slots in pool order, `buckets` only when not the default
 * @throws {PackKeyError} with a code naming what is wrong (see PACK_KEY_ERROR_MESSAGES)
 */
export const decodePackKey = (input: string): Pool => {
  const text = input.trim();
  if (text === "") throw new PackKeyError("empty");
  const match = KEY_PATTERN.exec(text);
  if (!match) throw new PackKeyError("prefix");
  // Exact spelling only: "pk01." is not version 1.
  const version = PACK_KEY_VERSIONS.find((v) => String(v) === match[1]);
  if (version === undefined) throw new PackKeyError("version");

  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(match[2] ?? "");
  } catch {
    throw new PackKeyError("encoding");
  }
  if (bytes.length < 3) throw new PackKeyError("malformed");

  const body = bytes.subarray(0, bytes.length - 2);
  const stored = ((bytes[bytes.length - 2] ?? 0) << 8) | (bytes[bytes.length - 1] ?? 0);
  if (crc16CcittFalse(body) !== stored) throw new PackKeyError("checksum");
  if (body[0] !== version) throw new PackKeyError("version");

  try {
    return readBody(body, version);
  } catch {
    throw new PackKeyError("malformed");
  }
};

/**
 * @function extractPackKey
 * @param input {string} pasted text: a bare key, a share link, or a sentence containing one
 * @returns {string | null} the first pk<version>.<base64url> run, or null
 */
export const extractPackKey = (input: string): string | null =>
  KEY_IN_TEXT.exec(input)?.[0] ?? null;
