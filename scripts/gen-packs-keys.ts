/**
 * @file scripts/gen-packs-keys.ts
 * @desc Builds random pools and damaged keys, runs them through packs.haruhime.moe's own codec,
 *       and prints the answers as JSON (tests/fixtures/packs-keys.json), with the packs commit.
 *       Kept as the record of how that frozen fixture was made (`bun scripts/gen-packs-keys.ts
 *       <packs root>`, seeded, read-only on packs). Never rerun it to replace the fixture: packs
 *       now uses this package, so a rerun would compare the package with itself.
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Sep 23, 2026
 * @modified Wed Sep 23, 2026
 */

import { execFileSync } from "node:child_process";

const root = process.argv[2];
if (!root) throw new Error("usage: bun scripts/gen-packs-keys.ts <packs root>");
const { encodePackKey, decodePackKey } = await import(`${root}/src/utils/pack-key.ts`);
const { MOD_BUCKETS } = await import(`${root}/src/constants/mods.ts`);
const commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

// mulberry32: small, seeded, good enough to spread cases.
let seed = 0x5eed2026;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)] as T;
const shuffle = <T>(items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = int(0, i);
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
};

// Untrimmed names exercise the schema's trim; 64 CJK characters and 32 emoji (64 UTF-16 units)
// push the name's byte length past a one-byte varint.
const NAMES = [
  "EGC Quals",
  "a",
  "OWC 2026 Grand Finals",
  "東方杯",
  "Pool 🎵",
  "  spaced  ",
  "\ttabbed\t",
  "x".repeat(64),
  "Ümlaut Cup",
  "東".repeat(64),
  "🎵".repeat(32),
];
// Twelve characters, lowercase, CJK, Greek, and a letter outside the BMP (𝒜).
const CODES = [
  "EZ",
  "RC",
  "LN",
  "Speed",
  "Tech",
  "HB",
  "Aim",
  "SV",
  "ワン",
  "X1",
  "Alt2",
  "Q",
  "Abcdefghijkl",
  "rc",
  "𝒜",
  "Ωmega",
];
const FORCED = [
  ["EZ"],
  ["HD", "HR"],
  ["DT"],
  ["EZ", "HD"],
  ["HD", "DT", "FL"],
  ["HT"],
  ["HR", "FL"],
  ["EZ", "HT", "FL"],
];
const ID_RANGES = [
  [1, 99],
  [100, 1_000_000],
  [1_000_000, 5_000_000],
  [2_000_000_000, 2_147_483_647],
] as const;

type Bucket = { code: string; color?: number; mods?: unknown };
const cases: { pool: unknown; key: string; decoded: unknown }[] = [];
for (let attempts = 0; cases.length < 400 && attempts < 10_000; attempts++) {
  // 0: built-ins only (pk1), 1: reordered and no-slot maps, 2: custom slots, 3: custom slots with mods.
  const kind = cases.length % 4;
  const buckets: Bucket[] = MOD_BUCKETS.map((code: string) => ({ code }));
  // Sometimes spell out the default list: it must give the same key as leaving it out.
  const explicitDefault = kind === 0 && random() < 0.25;
  if (kind >= 2) {
    for (const code of shuffle([...CODES]).slice(0, int(1, 8))) {
      const entry: Bucket = { code, color: int(0, 9) };
      if (kind === 3 && random() < 0.7) {
        entry.mods = random() < 0.5 ? { kind: "free" } : { kind: "forced", set: pick(FORCED) };
      }
      buckets.splice(int(0, buckets.length), 0, entry);
    }
  }
  if (kind === 1 || (kind >= 2 && random() < 0.3)) shuffle(buckets);
  const codes: (string | null)[] = buckets.map((bucket) => bucket.code);
  if (kind === 1 || random() < 0.2) codes.push(null);

  // Fill exactly n slots (retrying collisions), hitting the 64-slot maximum often.
  const n = random() < 0.15 ? 64 : int(0, 64);
  const used = new Set<string>();
  const slots: { mod: string | null; index: number; beatmapId: number }[] = [];
  for (let tries = 0; slots.length < n && tries < 10_000; tries++) {
    const mod = kind === 0 ? pick(MOD_BUCKETS as readonly string[]) : pick(codes);
    const index = random() < 0.9 ? int(1, 9) : int(10, 99);
    const slot = `${mod}#${index}`;
    if (used.has(slot)) continue;
    used.add(slot);
    const [lo, hi] = pick(ID_RANGES);
    slots.push({ mod, index, beatmapId: int(lo, hi) });
  }

  const pool = { name: pick(NAMES), slots, ...(kind === 0 && !explicitDefault ? {} : { buckets }) };
  let key: string;
  try {
    key = encodePackKey(pool);
  } catch {
    continue; // packs refuses it (e.g. a code clash); only encodable pools are fixtures.
  }
  cases.push({ pool, key, decoded: decodePackKey(key) });
}

// Damaged keys: one character changed, cut short, a wrong prefix, stray text, or a body byte
// changed with the checksum recomputed (so the decoder, not the CRC, must catch it). Record
// packs' answer: its error code, or the pool when it still reads the key.
const crc16 = (bytes: Uint8Array) => {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
};
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const fromB64 = (text: string) =>
  Uint8Array.from(
    atob(text.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((text.length + 3) % 4)),
    (char) => char.charCodeAt(0),
  );
const toB64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const damage = (key: string): string => {
  const [prefix = "", body = ""] = key.split(".");
  switch (int(0, 4)) {
    case 0: {
      const at = int(0, body.length - 1);
      return `${prefix}.${body.slice(0, at)}${pick([...B64])}${body.slice(at + 1)}`;
    }
    case 1:
      return `${prefix}.${body.slice(0, int(0, body.length - 1))}`;
    case 2:
      return `${pick(["pk1", "pk2", "pk3", "pk4", "pk0", "pk01", "PK1"])}.${body}`;
    case 3:
      return pick([`  ${key}\n`, `${key}=`, `${key}==`, `${prefix}.`, `${key}!`]);
    default: {
      const inner = fromB64(body).slice(0, -2);
      inner[int(0, inner.length - 1)] = int(0, 255);
      const crc = crc16(inner);
      return `${prefix}.${toB64(Uint8Array.from([...inner, crc >> 8, crc & 0xff]))}`;
    }
  }
};
const rejected: { key: string; code: string | null; decoded?: unknown }[] = [];
for (const [index, entry] of cases.entries()) {
  if (index % 2 === 1) continue;
  for (let copy = 0; copy < 2; copy++) {
    const key = damage(entry.key);
    try {
      rejected.push({ key, code: null, decoded: decodePackKey(key) });
    } catch (error) {
      rejected.push({ key, code: (error as { code: string }).code });
    }
  }
}

console.log(
  JSON.stringify({ source: { repo: "haruhimemoe/packs.haruhime.moe", commit }, cases, rejected }),
);
