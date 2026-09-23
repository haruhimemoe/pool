/**
 * @file scripts/gen-packs-keys.ts
 * @desc One-off: builds random pools, encodes and decodes them with packs.haruhime.moe's own
 *       codec, and prints them as JSON (tests/fixtures/packs-keys.json). Run from a packs checkout
 *       with `bun <this file> <packs root>`; it only reads packs. Seeded, so reruns match.
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Sep 23, 2026
 * @modified Wed Sep 23, 2026
 */

const root = process.argv[2];
if (!root) throw new Error("usage: bun scripts/gen-packs-keys.ts <packs root>");
const { encodePackKey, decodePackKey } = await import(`${root}/src/utils/pack-key.ts`);
const { MOD_BUCKETS } = await import(`${root}/src/constants/mods.ts`);

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

const NAMES = [
  "EGC Quals",
  "a",
  "OWC 2026 Grand Finals",
  "東方杯",
  "Pool 🎵",
  "  spaced  ",
  "x".repeat(64),
  "Ümlaut Cup",
];
const CODES = ["EZ", "RC", "LN", "Speed", "Tech", "HB", "Aim", "SV", "ワン", "X1", "Alt2", "Q"];
const FORCED = [
  ["EZ"],
  ["HD", "HR"],
  ["DT"],
  ["EZ", "HD"],
  ["HD", "DT", "FL"],
  ["HT"],
  ["HR", "FL"],
];
const ID_RANGES = [
  [1, 99],
  [100, 1_000_000],
  [1_000_000, 5_000_000],
  [2_000_000_000, 2_147_483_647],
] as const;

const cases: { pool: unknown; key: string; decoded: unknown }[] = [];
let attempts = 0;
while (cases.length < 400 && attempts < 10_000) {
  attempts++;
  const kind = cases.length % 4; // 0: pk1-shaped, 1: reordered/no-slot, 2: customs, 3: customs with mods
  const buckets: { code: string; color?: number; mods?: unknown }[] = MOD_BUCKETS.map(
    (code: string) => ({ code }),
  );
  if (kind >= 2) {
    for (const code of shuffle([...CODES]).slice(0, int(1, 8))) {
      const entry: { code: string; color: number; mods?: unknown } = { code, color: int(0, 9) };
      if (kind === 3 && random() < 0.7)
        entry.mods = random() < 0.5 ? { kind: "free" } : { kind: "forced", set: pick(FORCED) };
      buckets.splice(int(0, buckets.length), 0, entry);
    }
  }
  if (kind === 1 || (kind >= 2 && random() < 0.3)) shuffle(buckets);
  const codes: (string | null)[] = buckets.map((b) => b.code);
  if (kind === 1 || random() < 0.2) codes.push(null);
  const used = new Set<string>();
  const slots = [];
  for (let n = int(0, 64); slots.length < n; ) {
    const mod = kind === 0 ? pick(MOD_BUCKETS as readonly string[]) : pick(codes);
    const index = random() < 0.9 ? int(1, 9) : int(10, 99);
    const k = `${mod}#${index}`;
    if (used.has(k)) {
      n--;
      continue;
    }
    used.add(k);
    const [lo, hi] = pick(ID_RANGES);
    slots.push({ mod, index, beatmapId: int(lo, hi) });
  }
  const pool = { name: pick(NAMES).trim() || "a", slots, ...(kind === 0 ? {} : { buckets }) };
  let key: string;
  try {
    key = encodePackKey(pool);
  } catch {
    continue; // packs refuses it (e.g. a code clash); only encodable pools are fixtures.
  }
  cases.push({ pool, key, decoded: decodePackKey(key) });
}
console.log(JSON.stringify(cases));
