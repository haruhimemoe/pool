/**
 * @file tests/service.test.ts
 * @desc The pools and packs service contract: the pack input (defaults, limits, the content filter
 *       on the name, description and slot codes), the ref, the PUT body (exactly a pack input,
 *       unknown keys refused, visibility required) and packs' answers. The same cases as packs'
 *       saved-pack and pools-service tests. (Offensive strings below are test inputs only.)
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Sep 28, 2026
 * @modified Mon Sep 28, 2026
 */

import { describe, expect, it } from "vitest";
import { MOD_BUCKETS } from "../src/constants.js";
import {
  createPackInputSchema,
  DEFAULT_PACK_VISIBILITY,
  MAX_DESCRIPTION_LENGTH,
  normalizeDescription,
  PACK_VISIBILITIES,
  POOLS_SYNC_STATES,
  type PoolsPackBody,
  packInputSchema,
  poolsPackBodySchema,
  poolsRefSchema,
  poolsStatsAnswerSchema,
  poolsSyncAnswerSchema,
} from "../src/service.js";

const SLOTS = [{ mod: "NM", index: 1, beatmapId: 129891 }];
const BUILT_INS = MOD_BUCKETS.map((code) => ({ code }));

describe("packInputSchema", () => {
  it("defaults visibility to unlisted and trims the name", () => {
    expect(packInputSchema.parse({ name: "  Finals  ", slots: SLOTS })).toEqual({
      name: "Finals",
      slots: SLOTS,
      visibility: "unlisted",
    });
    expect(DEFAULT_PACK_VISIBILITY).toBe("unlisted");
    expect(PACK_VISIBILITIES).toEqual(["private", "unlisted", "public"]);
    expect(Object.isFrozen(PACK_VISIBILITIES) && Object.isFrozen(POOLS_SYNC_STATES)).toBe(true);
  });

  it("needs at least one map", () => {
    const result = packInputSchema.safeParse({ name: "Finals", slots: [] });
    expect(result.error?.issues[0]?.message).toBe("Add at least one map before saving.");
  });

  it("rejects an unknown visibility, a blank name and duplicate slots", () => {
    expect(
      packInputSchema.safeParse({ name: "F", slots: SLOTS, visibility: "friends" }).success,
    ).toBe(false);
    expect(packInputSchema.safeParse({ name: "   ", slots: SLOTS }).success).toBe(false);
    expect(packInputSchema.safeParse({ name: "F", slots: [...SLOTS, ...SLOTS] }).success).toBe(
      false,
    );
  });

  it("drops fields the client may not set", () => {
    const parsed = packInputSchema.parse({
      name: "F",
      slots: SLOTS,
      ownerId: "x",
      slug: "chosen1234",
    });
    expect(parsed).not.toHaveProperty("ownerId");
    expect(parsed).not.toHaveProperty("slug");
  });

  it.each([
    [{ name: "f4gg0t pool" }, ["name"], "Please keep the name free of slurs."],
    [
      { name: "Finals", description: "for retards only" },
      ["description"],
      "Please keep the description free of slurs.",
    ],
  ])("refuses slurs in %j", (fields, path, message) => {
    const result = packInputSchema.safeParse({ slots: SLOTS, ...fields });
    expect(result.error?.issues[0]).toMatchObject({ path, message });
  });

  it("refuses slurs in a custom slot's code, which shows wherever the pack's slots do", () => {
    const result = packInputSchema.safeParse({
      name: "Finals",
      slots: [{ mod: "F4GG0T", index: 1, beatmapId: 129891 }],
      buckets: [...BUILT_INS.slice(0, 5), { code: "F4GG0T", color: 0 }, { code: "TB" }],
    });
    expect(result.error?.issues[0]).toMatchObject({
      path: ["buckets", 5, "code"],
      message: "Please keep the slot names free of slurs.",
    });
  });

  it("lets ordinary codes, names and swearing through", () => {
    const buckets = [...BUILT_INS, { code: "SV", color: 0 }];
    const sv = [{ mod: "SV", index: 1, beatmapId: 129891 }];
    expect(packInputSchema.safeParse({ name: "Finals", slots: sv, buckets }).success).toBe(true);
    expect(packInputSchema.safeParse({ name: "Scunthorpe Cup", slots: SLOTS }).success).toBe(true);
    expect(packInputSchema.safeParse({ name: "fuck this pool", slots: SLOTS }).success).toBe(true);
  });

  it("doesn't run the blocklist on text already over the limit", () => {
    const start = performance.now();
    const result = packInputSchema.safeParse({
      name: "k".repeat(16_000),
      slots: SLOTS,
      description: "n".repeat(16_000),
    });
    expect(result.success).toBe(false);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("descriptions", () => {
  const body = { name: "p", slots: SLOTS };

  it("normalizes line endings and trims", () => {
    expect(normalizeDescription("  one\r\ntwo\rthree  ")).toBe("one\ntwo\nthree");
    expect(packInputSchema.parse({ ...body, description: "  one\r\ntwo  " }).description).toBe(
      "one\ntwo",
    );
  });

  it("allows 500 characters after trimming and refuses 501", () => {
    const at = `  ${"x".repeat(MAX_DESCRIPTION_LENGTH)}  `;
    expect(packInputSchema.safeParse({ ...body, description: at }).success).toBe(true);
    const tooLong = packInputSchema.safeParse({ ...body, description: "x".repeat(501) });
    expect(tooLong.error?.issues[0]?.message).toBe(
      "Keep the description to 500 characters or fewer.",
    );
  });

  it("leaves the description out when it isn't sent", () => {
    expect(packInputSchema.parse(body).description).toBeUndefined();
  });
});

describe("poolsRefSchema", () => {
  it.each(["otdb-58", "otdb-58-2", "host-k3j9x0ab", "community-0a1b2c3d", "a", "a".repeat(64)])(
    "takes %j",
    (ref) => {
      expect(poolsRefSchema.safeParse(ref).success).toBe(true);
    },
  );

  it.each(["", "OTDB-58", "otdb_58", "otdb 58", "a".repeat(65), "../x"])("refuses %j", (ref) => {
    expect(poolsRefSchema.safeParse(ref).success).toBe(false);
  });
});

describe("poolsPackBodySchema", () => {
  const BODY = {
    name: "Ricma 2 Quarterfinals",
    visibility: "public",
    slots: [{ mod: "NM", index: 1, beatmapId: 101 }],
  };

  it("types the body pools builds", () => {
    const sent: PoolsPackBody = {
      name: "Ricma 2 Quarterfinals",
      description:
        "Ricma 2 Quarterfinals. Pool details and sources: https://pools.haruhime.moe/pools/otdb-58",
      visibility: "unlisted",
      slots: [{ mod: "RC", index: 1, beatmapId: 101 }],
      buckets: [...BUILT_INS.slice(0, 5), { code: "RC", color: 0 }, { code: "TB" }],
    };
    expect(poolsPackBodySchema.safeParse(sent).success).toBe(true);
  });

  it("parses a pack input exactly as packInputSchema does", () => {
    const body = { ...BODY, description: "Ricma 2\r\nQuarterfinals  " };
    expect(poolsPackBodySchema.parse(body)).toEqual(packInputSchema.parse(body));
  });

  it("refuses a key a pack input doesn't have", () => {
    const issue = poolsPackBodySchema.safeParse({ ...BODY, year: 2023 }).error?.issues[0];
    expect(issue).toMatchObject({ code: "unrecognized_keys", keys: ["year"] });
  });

  it("requires visibility instead of defaulting it", () => {
    const { visibility: _visibility, ...rest } = BODY;
    const issue = poolsPackBodySchema.safeParse(rest).error?.issues[0];
    expect(issue).toMatchObject({
      path: ["visibility"],
      message: "Send visibility: public or unlisted.",
    });
  });

  it("still applies the content filter and the pack rules", () => {
    expect(poolsPackBodySchema.safeParse({ ...BODY, name: "f4gg0t pool" }).success).toBe(false);
    expect(poolsPackBodySchema.safeParse({ ...BODY, slots: [] }).success).toBe(false);
    expect(poolsPackBodySchema.safeParse("a string").success).toBe(false);
  });
});

describe("packs' answers", () => {
  it.each(["created", "updated", "unchanged"])("reads a %s answer", (state) => {
    const answer = { slug: "abcdefghij", state, listed: true };
    expect(poolsSyncAnswerSchema.parse(answer)).toEqual(answer);
  });

  it.each([
    { slug: "a/b", state: "created", listed: true },
    { slug: "a".repeat(33), state: "created", listed: true },
    { slug: "abcdefghij", state: "deleted", listed: true },
    { slug: "abcdefghij", state: "created" },
  ])("refuses %j", (answer) => {
    expect(poolsSyncAnswerSchema.safeParse(answer).success).toBe(false);
  });

  it("reads a stats batch's counts", () => {
    expect(poolsStatsAnswerSchema.parse({ updated: 3, remaining: 0 })).toEqual({
      updated: 3,
      remaining: 0,
    });
    expect(poolsStatsAnswerSchema.safeParse({ updated: -1, remaining: 0 }).success).toBe(false);
    expect(poolsStatsAnswerSchema.safeParse({ updated: 1.5, remaining: 0 }).success).toBe(false);
  });
});

describe("createPackInputSchema", () => {
  it("matches packInputSchema with no options", () => {
    const made = createPackInputSchema().parse({ name: "Pool", slots: SLOTS });
    expect(made).toEqual(packInputSchema.parse({ name: "Pool", slots: SLOTS }));
  });

  it("takes its own description limit, default visibility and content filter", () => {
    const schema = createPackInputSchema({
      maxDescriptionLength: 10,
      defaultVisibility: "private",
      contentFilter: false,
    });
    expect(schema.parse({ name: "Pool", slots: SLOTS }).visibility).toBe("private");
    expect(
      schema.safeParse({ name: "Pool", slots: SLOTS, description: "x".repeat(11) }).success,
    ).toBe(false);
    expect(schema.safeParse({ name: "faggot", slots: SLOTS }).success).toBe(true);
    expect(packInputSchema.safeParse({ name: "faggot", slots: SLOTS }).success).toBe(false);
  });
});
