/**
 * @file tests/key.test.ts
 * @desc Pack key v1 to v3: round trips, canonical order, exact layout, every rejection path, extraction
 *       from pasted text.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Wed Sep 23, 2026
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { base64UrlToBytes, bytesToBase64Url } from "../src/base64url.js";
import { canonicalBuckets } from "../src/buckets.js";
import { MAX_SLOTS, MOD_BUCKETS } from "../src/constants.js";
import { crc16CcittFalse } from "../src/crc16.js";
import {
  decodePackKey,
  encodePackKey,
  extractPackKey,
  PACK_KEY_ERROR_MESSAGES,
  PackKeyError,
} from "../src/key.js";
import { MOD_ACRONYMS, modSetProblem } from "../src/mods.js";
import { sortSlots } from "../src/pool.js";
import type { BucketEntry, Pool } from "../src/schema.js";

const POOL: Pool = {
  name: "EGC Quals",
  slots: [
    { mod: "TB", index: 1, beatmapId: 1872396 },
    { mod: "NM", index: 2, beatmapId: 2116202 },
    { mod: "NM", index: 1, beatmapId: 129891 },
    { mod: "HD", index: 1, beatmapId: 129891 },
  ],
};

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(PackKeyError);
    expect((error as PackKeyError).code).toBe(code);
    return;
  }
  throw new Error(`expected PackKeyError(${code})`);
};

/** Re-sign a tampered body so only the intended defect is present. */
const signed = (body: number[]) => {
  const bytes = Uint8Array.from(body);
  const crc = crc16CcittFalse(bytes);
  return `pk1.${bytesToBase64Url(Uint8Array.from([...body, crc >> 8, crc & 0xff]))}`;
};

const packArb = fc
  .record({
    name: fc
      .string({ unit: "grapheme", minLength: 1, maxLength: 20 })
      .filter((s) => s.trim().length > 0 && s.length <= 64),
    slots: fc.uniqueArray(
      fc.record({
        mod: fc.constantFrom(...MOD_BUCKETS),
        index: fc.integer({ min: 1, max: 99 }),
        beatmapId: fc.integer({ min: 1, max: 2_147_483_647 }),
      }),
      { maxLength: MAX_SLOTS, selector: (s) => `${s.mod}${s.index}` },
    ),
  })
  .map((p) => ({ ...p, name: p.name.trim() }));

describe("encodePackKey / decodePackKey", () => {
  it("round-trips any valid pack, unicode names included", () => {
    fc.assert(
      fc.property(packArb, (pack) => {
        const decoded = decodePackKey(encodePackKey(pack));
        expect(decoded.name).toBe(pack.name);
        expect(new Set(decoded.slots.map((s) => JSON.stringify(s)))).toEqual(
          new Set(pack.slots.map((s) => JSON.stringify(s))),
        );
      }),
    );
  });

  it("round-trips emoji and CJK names exactly", () => {
    const pack = {
      name: "春の大会 🌸 Finals",
      slots: [{ mod: "NM" as const, index: 1, beatmapId: 1 }],
    };
    expect(decodePackKey(encodePackKey(pack)).name).toBe("春の大会 🌸 Finals");
  });

  it("is canonical: slot order doesn't change the key", () => {
    const shuffled = { ...POOL, slots: [...POOL.slots].reverse() };
    expect(encodePackKey(shuffled)).toBe(encodePackKey(POOL));
  });

  it("decodes slots in bucket order, then index", () => {
    expect(decodePackKey(encodePackKey(POOL)).slots.map((s) => `${s.mod}${s.index}`)).toEqual([
      "NM1",
      "NM2",
      "HD1",
      "TB1",
    ]);
  });

  it("uses the documented v1 byte layout", () => {
    const key = encodePackKey({ name: "a", slots: [{ mod: "HR", index: 2, beatmapId: 300 }] });
    expect(key.startsWith("pk1.")).toBe(true);
    const bytes = base64UrlToBytes(key.slice(4));
    // version, name len, "a", count, mod HR=2, index 2, id 300 = 0xAC 0x02, then CRC
    expect([...bytes.subarray(0, 8)]).toEqual([1, 1, 0x61, 1, 2, 2, 0xac, 0x02]);
    const crc = crc16CcittFalse(bytes.subarray(0, 8));
    expect([...bytes.subarray(8)]).toEqual([crc >> 8, crc & 0xff]);
  });

  it("keeps a 20-map pool short", () => {
    const slots = Array.from({ length: 20 }, (_, i) => ({
      mod: MOD_BUCKETS[i % 5] ?? "NM",
      index: Math.floor(i / 5) + 1,
      beatmapId: 4_000_000 + i,
    }));
    expect(encodePackKey({ name: "Round of 16 Pool", slots }).length).toBeLessThan(200);
  });

  it("refuses to encode an invalid pack", () => {
    expect(() => encodePackKey({ name: "   ", slots: [] })).toThrow();
  });
});

describe("decodePackKey rejections", () => {
  const key = encodePackKey(POOL);

  it.each(["", "   \n"])("empty input %j", (input) => {
    expectCode(() => decodePackKey(input), "empty");
  });

  it.each(["hello", "pk.abc", "PK1.abc", "k1.abc"])("wrong prefix %j", (input) => {
    expectCode(() => decodePackKey(input), "prefix");
  });

  it("a newer key version", () => {
    expectCode(() => decodePackKey(key.replace("pk1.", "pk4.")), "version");
  });

  it("a version with a leading zero", () => {
    expectCode(() => decodePackKey(key.replace("pk1.", "pk01.")), "version");
  });

  it("characters outside base64url", () => {
    expectCode(() => decodePackKey(`${key.slice(0, 10)}+${key.slice(11)}`), "encoding");
  });

  it("a flipped character (checksum)", () => {
    const i = 12;
    const swapped = key[i] === "A" ? "B" : "A";
    expectCode(() => decodePackKey(key.slice(0, i) + swapped + key.slice(i + 1)), "checksum");
  });

  it("a truncated key", () => {
    // Cut 4 chars (3 bytes) so the base64 length class is unchanged and only the CRC can object.
    expectCode(() => decodePackKey(key.slice(0, -4)), "checksum");
  });

  it.each([
    ["too short to hold a checksum", [1]],
    ["version byte 2 inside a pk1 key", [2, 0, 0]],
    ["name length past the end", [1, 9, 0x61]],
    ["invalid UTF-8 name", [1, 1, 0xff, 0]],
    ["unknown mod index", [1, 1, 0x61, 1, 6, 1, 1]],
    ["trailing bytes", [1, 1, 0x61, 0, 7]],
    ["index 0", [1, 1, 0x61, 1, 0, 0, 1]],
    ["duplicate slot", [1, 1, 0x61, 2, 0, 1, 1, 0, 1, 2]],
    ["an empty name", [1, 0, 0]],
  ])("%s", (label, body) => {
    const code = label === "version byte 2 inside a pk1 key" ? "version" : "malformed";
    expectCode(() => decodePackKey(signed(body)), code);
  });

  it("more than 64 slots", () => {
    expectCode(() => decodePackKey(signed([1, 1, 0x61, 65])), "malformed");
  });
});

describe("extractPackKey", () => {
  const key = encodePackKey(POOL);

  it.each([
    [key, key],
    [`  ${key}\n`, key],
    [`https://packs.haruhime.moe/k#${key}`, key],
    [`/k#${key}`, key],
    [`here: https://packs.haruhime.moe/k#${key}. enjoy`, key],
    [`(${key})`, key],
  ])("finds the key in %j", (input, expected) => {
    expect(extractPackKey(input)).toBe(expected);
  });

  it("returns null when there is no key", () => {
    expect(extractPackKey("no key here")).toBeNull();
  });
});

const BUILT_INS: BucketEntry[] = MOD_BUCKETS.map((code) => ({ code }));
const CUSTOM: Pool = {
  name: "Custom",
  slots: [
    { mod: "EZ", index: 1, beatmapId: 300 },
    { mod: null, index: 1, beatmapId: 5 },
    { mod: "NM", index: 1, beatmapId: 7 },
  ],
  buckets: [
    { code: "TB" },
    ...BUILT_INS.slice(0, 3),
    { code: "EZ", color: 0 },
    ...BUILT_INS.slice(3, 5),
  ],
};

/** What decoding should give back: slots in pool order, buckets only when not default. */
const normalized = (pack: Pool): Pool => {
  const buckets = canonicalBuckets(pack.buckets ?? BUILT_INS);
  const slots = sortSlots(pack.slots, pack.buckets ?? BUILT_INS);
  return buckets ? { name: pack.name.trim(), slots, buckets } : { name: pack.name.trim(), slots };
};

const codeArb = fc
  .stringMatching(/^[A-Za-z0-9À-Öぁ-ゖ]{1,12}$/)
  .filter((c) => !(MOD_BUCKETS as readonly string[]).includes(c.toUpperCase()));

const v2Arb = fc
  .record({
    name: fc.constantFrom("Pool", "春の大会 🌸", "a"),
    order: fc.shuffledSubarray([...MOD_BUCKETS], { minLength: 6, maxLength: 6 }),
    customs: fc.uniqueArray(fc.record({ code: codeArb, color: fc.integer({ min: 0, max: 9 }) }), {
      maxLength: 3,
      selector: (c) => c.code.toUpperCase(),
    }),
  })
  .chain(({ name, order, customs }) => {
    const buckets: BucketEntry[] = [...order.map((code) => ({ code })), ...customs];
    const mods: (string | null)[] = [null, ...buckets.map((b) => b.code)];
    return fc
      .uniqueArray(
        fc.record({
          mod: fc.constantFrom(...mods),
          index: fc.integer({ min: 1, max: 99 }),
          beatmapId: fc.integer({ min: 1, max: 2_147_483_647 }),
        }),
        { maxLength: MAX_SLOTS, selector: (s) => `${s.mod}#${s.index}` },
      )
      .map((slots): Pool => ({ name, slots, buckets }));
  });

describe("pack key v2", () => {
  it("round-trips custom buckets, bucket order, and no-slot maps", () => {
    const key = encodePackKey(CUSTOM);
    expect(key.startsWith("pk2.")).toBe(true);
    expect(decodePackKey(key)).toEqual(normalized(CUSTOM));
  });

  it("round-trips any valid v2 pack", () => {
    fc.assert(
      fc.property(v2Arb, (pack) => {
        expect(decodePackKey(encodePackKey(pack))).toEqual(normalized(pack));
      }),
    );
  });

  it("keeps using pk1 for packs v1 can hold, so old keys never change", () => {
    expect(encodePackKey(POOL).startsWith("pk1.")).toBe(true);
    expect(encodePackKey({ ...POOL, buckets: BUILT_INS })).toBe(encodePackKey(POOL));
  });

  it("uses pk2 for a single no-slot map even with default buckets", () => {
    expect(
      encodePackKey({ name: "a", slots: [{ mod: null, index: 1, beatmapId: 1 }] }).startsWith(
        "pk2.",
      ),
    ).toBe(true);
  });

  it("uses the documented v2 byte layout", () => {
    const key = encodePackKey({
      name: "a",
      slots: [
        { mod: null, index: 1, beatmapId: 5 },
        { mod: "É", index: 2, beatmapId: 300 },
      ],
      buckets: [...BUILT_INS.slice(0, 5), { code: "É", color: 9 }, { code: "TB" }],
    });
    const bytes = base64UrlToBytes(key.slice(4));
    // version 2, name, table of 7 (0..4, custom 0xFE color 9 len 2 "É", 5), 2 slots
    expect([...bytes.subarray(0, bytes.length - 2)]).toEqual([
      2, 1, 0x61, 7, 0, 1, 2, 3, 4, 0xfe, 9, 2, 0xc3, 0x89, 5, 2, 0xff, 1, 5, 5, 2, 0xac, 0x02,
    ]);
  });

  it("is canonical: slot order doesn't change the key", () => {
    expect(encodePackKey({ ...CUSTOM, slots: [...CUSTOM.slots].reverse() })).toBe(
      encodePackKey(CUSTOM),
    );
  });

  it("decodes a pk2 key holding only default buckets to a pack without a buckets field", () => {
    const body = [2, 1, 0x61, 6, 0, 1, 2, 3, 4, 5, 1, 0, 1, 1];
    expect(decodePackKey(signed(body).replace("pk1.", "pk2."))).toEqual({
      name: "a",
      slots: [{ mod: "NM", index: 1, beatmapId: 1 }],
    });
  });

  it.each([
    ["a table shorter than the six built-ins", [2, 1, 0x61, 5, 0, 1, 2, 3, 4, 0]],
    ["an unknown table byte", [2, 1, 0x61, 6, 0, 1, 2, 3, 4, 9, 0]],
    ["a missing built-in", [2, 1, 0x61, 6, 0, 1, 2, 3, 4, 4, 0]],
    ["an unknown color", [2, 1, 0x61, 7, 0, 1, 2, 3, 4, 5, 0xfe, 10, 1, 0x45, 0]],
    ["a code past the end", [2, 1, 0x61, 7, 0, 1, 2, 3, 4, 5, 0xfe, 0, 9, 0x45]],
    ["a slot pointing past the table", [2, 1, 0x61, 6, 0, 1, 2, 3, 4, 5, 1, 6, 1, 1]],
    [
      "a custom code that is a built-in",
      [2, 1, 0x61, 7, 0, 1, 2, 3, 4, 5, 0xfe, 0, 2, 0x6e, 0x6d, 0],
    ],
    ["trailing bytes", [2, 1, 0x61, 6, 0, 1, 2, 3, 4, 5, 0, 7]],
  ])("rejects %s", (_label, body) => {
    expectCode(() => decodePackKey(signed(body).replace("pk1.", "pk2.")), "malformed");
  });

  it("rejects a version byte that doesn't match the prefix", () => {
    expectCode(() => decodePackKey(signed([1, 1, 0x61, 0]).replace("pk1.", "pk2.")), "version");
  });
});

const signedAs = (version: number, body: number[]) => signed(body).replace("pk1.", `pk${version}.`);

const modsArb = fc.oneof(
  fc.constant(undefined),
  fc.constant({ kind: "free" as const }),
  fc
    .subarray([...MOD_ACRONYMS], { minLength: 1, maxLength: 3 })
    .filter((set) => modSetProblem(set) === null)
    .map((set) => ({ kind: "forced" as const, set })),
);

const v3Arb = fc
  .record({
    name: fc.constantFrom("Pool", "春の大会 🌸", "a"),
    customs: fc.uniqueArray(
      fc.record({ code: codeArb, color: fc.integer({ min: 0, max: 9 }), mods: modsArb }),
      { maxLength: 4, selector: (c) => c.code.toUpperCase() },
    ),
  })
  .chain(({ name, customs }) => {
    const buckets: BucketEntry[] = [
      ...BUILT_INS.slice(0, 5),
      ...customs.map(({ code, color, mods }) => (mods ? { code, color, mods } : { code, color })),
      { code: "TB" },
    ];
    const mods: (string | null)[] = [null, ...buckets.map((b) => b.code)];
    return fc
      .uniqueArray(
        fc.record({
          mod: fc.constantFrom(...mods),
          index: fc.integer({ min: 1, max: 99 }),
          beatmapId: fc.integer({ min: 1, max: 2_147_483_647 }),
        }),
        { maxLength: 20, selector: (s) => `${s.mod}#${s.index}` },
      )
      .map((slots): Pool => ({ name, slots, buckets }));
  });

describe("pack key v3", () => {
  const MODDED: Pool = {
    name: "a",
    slots: [{ mod: "EZ", index: 1, beatmapId: 5 }],
    buckets: [
      ...BUILT_INS.slice(0, 5),
      { code: "EZ", color: 0, mods: { kind: "forced", set: ["EZ"] } },
      { code: "X", color: 1, mods: { kind: "free" } },
      { code: "Y", color: 2 },
      { code: "TB" },
    ],
  };

  it("uses the documented v3 byte layout", () => {
    const key = encodePackKey(MODDED);
    expect(key.startsWith("pk3.")).toBe(true);
    const bytes = base64UrlToBytes(key.slice(4));
    // version 3, name "a", table of 9: built-ins 0..4, EZ = 0xFD color 0 "EZ" forced mask 1,
    // X = 0xFD color 1 "X" free, Y = 0xFE color 2 "Y" (no mods), TB 5; one map in slot 5 (EZ).
    expect([...bytes.subarray(0, bytes.length - 2)]).toEqual([
      3, 1, 0x61, 9, 0, 1, 2, 3, 4, 0xfd, 0, 2, 0x45, 0x5a, 1, 1, 0xfd, 1, 1, 0x58, 2, 0xfe, 2, 1,
      0x59, 5, 1, 5, 1, 5,
    ]);
    const crc = crc16CcittFalse(bytes.subarray(0, bytes.length - 2));
    expect([...bytes.subarray(bytes.length - 2)]).toEqual([crc >> 8, crc & 0xff]);
  });

  it("writes forced HD and DT as bitmask 10", () => {
    const key = encodePackKey({
      name: "a",
      slots: [],
      buckets: [...BUILT_INS, { code: "Z", color: 0, mods: { kind: "forced", set: ["HD", "DT"] } }],
    });
    const bytes = base64UrlToBytes(key.slice(4));
    expect([...bytes.subarray(10, 16)]).toEqual([0xfd, 0, 1, 0x5a, 1, 10]);
  });

  it("round-trips mods", () => {
    expect(decodePackKey(encodePackKey(MODDED))).toEqual(normalized(MODDED));
  });

  it("round-trips any pack with or without mods, and uses pk3 exactly when a slot has mods", () => {
    fc.assert(
      fc.property(v3Arb, (pack) => {
        const key = encodePackKey(pack);
        const hasMods = (pack.buckets ?? []).some((b) => "mods" in b);
        expect(key.startsWith("pk3.")).toBe(hasMods);
        expect(decodePackKey(key)).toEqual(normalized(pack));
      }),
    );
  });

  it("changes the key when a slot's mods change", () => {
    const free: Pool = {
      ...MODDED,
      buckets: (MODDED.buckets ?? []).map((b) =>
        b.code === "EZ" ? { code: "EZ", color: 0, mods: { kind: "free" } } : b,
      ),
    };
    expect(encodePackKey(free)).not.toBe(encodePackKey(MODDED));
  });

  it("decodes a pk3 key that holds no mods to the same pool a pk1 key holds", () => {
    const decoded = decodePackKey(signedAs(3, [3, 1, 0x61, 6, 0, 1, 2, 3, 4, 5, 1, 0, 1, 1]));
    expect(decoded).toEqual({ name: "a", slots: [{ mod: "NM", index: 1, beatmapId: 1 }] });
    expect(encodePackKey(decoded).startsWith("pk1.")).toBe(true);
  });

  it("decodes a freemod custom slot", () => {
    expect(
      decodePackKey(signedAs(3, [3, 1, 0x61, 7, 0, 1, 2, 3, 4, 5, 0xfd, 0, 1, 0x45, 2, 0])),
    ).toEqual({
      name: "a",
      slots: [],
      buckets: [...BUILT_INS, { code: "E", color: 0, mods: { kind: "free" } }],
    });
  });

  const table = [3, 1, 0x61, 7, 0, 1, 2, 3, 4, 5, 0xfd, 0, 1, 0x45];
  it.each([
    ["an unknown mods mode", [...table, 3, 0]],
    ["a bitmask bit no mod uses", [...table, 1, 0x40, 0]],
    ["a valid bit (HD) mixed with one no mod uses", [...table, 1, 0x42, 0]],
    ["an empty forced set", [...table, 1, 0, 0]],
    ["EZ with HR", [...table, 1, 5, 0]],
    ["DT with HT", [...table, 1, 24, 0]],
    ["four forced mods", [...table, 1, 43, 0]],
    ["mods past the end", [...table, 1]],
    ["a mode byte past the end", [...table]],
  ])("rejects %s", (_label, body) => {
    expectCode(() => decodePackKey(signedAs(3, body)), "malformed");
  });

  it("rejects a 0xFD entry inside a pk2 key", () => {
    expectCode(
      () => decodePackKey(signedAs(2, [2, 1, 0x61, 7, 0, 1, 2, 3, 4, 5, 0xfd, 0, 1, 0x45, 2, 0])),
      "malformed",
    );
  });

  it("rejects a pk3 prefix on a version 2 body", () => {
    expectCode(() => decodePackKey(signedAs(3, [2, 1, 0x61, 6, 0, 1, 2, 3, 4, 5, 0])), "version");
  });

  it("names every version in the prefix error", () => {
    expect(PACK_KEY_ERROR_MESSAGES.prefix).toBe(
      "That doesn't look like a pack key. Keys start with pk1., pk2. or pk3.",
    );
  });
});
