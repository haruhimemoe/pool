/**
 * @file tests/content-filter.test.ts
 * @desc The blocklist for published text: slurs and hate slogans, including common disguises,
 *       without catching ordinary words that contain them. Swearing is allowed. The same cases as
 *       packs.haruhime.moe's and pools.haruhime.moe's tests. (Offensive strings below are test
 *       inputs only.)
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Mon Sep 28, 2026
 */

import { describe, expect, it } from "vitest";
import { hasBlockedLanguage } from "../src/content-filter.js";

describe("hasBlockedLanguage", () => {
  it.each([
    "nigger",
    "niggas",
    "sandnigger",
    "faggot",
    "fags",
    "tranny",
    "retard",
    "retarded pool",
    "kike",
    "chink",
    "spic",
    "heil hitler",
    "Sieg Heil",
    "SiegHeil",
    "whitepower",
    "1488",
    "14/88",
    "ku klux klan",
  ])("blocks %j", (text) => {
    expect(hasBlockedLanguage(text)).toBe(true);
  });

  it.each([
    ["leetspeak", "f4gg0t"],
    ["symbols", "k!ke"],
    ["digits for letters", "n1gg3r"],
    ["stretched letters", "niiiggerrr"],
    ["dashed letters", "f-a-g"],
    ["invisible characters", "nig\u200bger"],
    ["dotted letters", "r.e.t.a.r.d"],
    ["accents", "fäggot"],
    ["Cyrillic lookalikes", "fаggot"],
    ["upper case", "TRANNY"],
  ])("sees through %s (%j)", (_label, text) => {
    expect(hasBlockedLanguage(text)).toBe(true);
  });

  it.each([
    "Scunthorpe Cup",
    "Shiitake",
    "assassin",
    "Cocktail Hour",
    "Dickens",
    "Niger",
    "Nigeria Open",
    "spice",
    "spicy maps",
    "raccoon",
    "Pakistan",
    "fire retardant",
    "Hancock",
    "Sussex",
    "classic",
    "Arsenal",
    "tyranny",
    "therapist",
    "push it",
    "hash it out",
    "Kikeriki",
    "SPC 2026 Grand Finals",
    "Pokémon Cup",
    "1v1 NM HD HR DT FM TB",
    "88 Keys",
    "",
    "kkkkkk",
    "kkk que isso",
    "Released in 1994",
    "Songs from Japan 1994",
    "on 1994 maps",
    "go ok",
    "spices",
    "spiced tea",
    "snigger",
    "sniggering",
    "niggardly",
    "14.88 stars",
    "14, 88 players",
    "fuck this pool",
    "Fucking hard maps",
    "bullshit quals",
    "what the hell",
  ])("allows %j", (text) => {
    expect(hasBlockedLanguage(text)).toBe(false);
  });

  it.each([
    ["one letter", `${"k".repeat(16_000)}a`],
    ["letters and spaces", `${"k ".repeat(8_000)}a`],
    ["a slur's letters", "n".repeat(16_000)],
    ["alternating", "ni".repeat(8_000)],
    ["separators", "n.".repeat(8_000)],
  ])("stays fast on a hostile 16 KB input (%s)", (_label, text) => {
    const start = performance.now();
    hasBlockedLanguage(text);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
