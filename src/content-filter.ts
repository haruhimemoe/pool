/**
 * @file src/content-filter.ts
 * @desc @haruhimemoe/pool/content-filter: a basic blocklist for text people publish (pool and pack
 *       names, descriptions, slot codes): slurs and hate slogans. Ordinary swearing is allowed. It
 *       sees through case, accents, common leetspeak (f4g, n1gg3r), Cyrillic lookalikes,
 *       stretched letters, and single separators (r.e.t.a.r.d), and matches whole words (plus a
 *       few endings) so ordinary words that contain a term (Niger, spice, Pakistan) pass. It is a
 *       first line, not moderation: admins still hide what gets through. The offensive strings
 *       below exist only to be refused. Its own entry point, so the word list loads only where
 *       it's imported. Moved from packs.haruhime.moe and pools.haruhime.moe, which had the same
 *       copy.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Sep 22, 2026
 * @modified Mon Sep 28, 2026
 */

/** Slurs: whole words, plural or past forms. */
const SLURS = [
  "chink",
  "gook",
  "spic",
  "kike",
  "wetback",
  "beaner",
  "raghead",
  "towelhead",
  "jigaboo",
  "paki",
  "fag",
  "dyke",
  "tranny",
  "trannie",
  "shemale",
  "retard",
  "retarded",
] as const;
// Plural only: "es"/"ed" would catch spices and spiced.
const SLUR_ENDINGS = "s|z";

/** Hate slogans: whole phrases, any spacing or punctuation (or none) between the words. */
const PHRASES = [
  "heil hitler",
  "sieg heil",
  "white power",
  "gas the jews",
  "ku klux klan",
] as const;
// Not "kkk": Brazilian players type it (and kkkkkk) as laughter.

/** Read before the leetspeak pass: "1488", "14/88", "14 88", "14-88". */
const NUMBER_CODES = /(?<!\d)14[\s/-]?88(?!\d)/;

const LOOKALIKES: Record<string, string> = {
  // Cyrillic letters that look Latin.
  а: "a",
  в: "b",
  е: "e",
  і: "i",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x",
  // Leetspeak.
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
  "!": "i",
  "|": "i",
};

/**
 * Each letter may repeat (fuuu), with at most one non-space separator between letters (f.a.g,
 * f-a-g). Spaces don't count as separators, so neighbouring words ("go ok") never join up.
 */
const letters = (word: string): string => Array.from(word, (char) => `${char}+`).join("[^a-z\\s]?");
const phrase = (term: string): string => term.split(" ").map(letters).join("[^a-z]*");
const whole = (terms: readonly string[], endings: string): RegExp =>
  new RegExp(`(?<![a-z])(?:${terms.map(phrase).join("|")})(?:${endings})?(?![a-z])`);

const PATTERNS: readonly RegExp[] = [
  whole(SLURS, SLUR_ENDINGS),
  whole(PHRASES, ""),
  // Refused even inside other words (sandn…), except the ordinary words that contain them:
  // snigger, niggardly.
  new RegExp(`(?<!s)${letters("nigger")}|${letters("nigga")}(?!r)|${letters("faggot")}`),
];

const fold = (text: string): string => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * @function hasBlockedLanguage
 * @param text {string} anything a person typed
 * @returns {boolean} true when it holds a slur or a hate slogan
 */
export const hasBlockedLanguage = (text: string): boolean => {
  // Invisible format characters (zero-width spaces) would otherwise split a word in two.
  const folded = fold(text).replace(/\p{Cf}/gu, "");
  if (NUMBER_CODES.test(folded)) return true;
  const plain = folded
    // Digits and symbols stand in for letters only inside words ("n1gg3r"), never in plain
    // numbers ("Japan 1994").
    .replace(/\S+/g, (token) =>
      /\p{L}/u.test(token) ? Array.from(token, (char) => LOOKALIKES[char] ?? char).join("") : token,
    )
    // Long runs of one letter add nothing but backtracking: keep at most two (for "gg").
    .replace(/([a-z])\1{2,}/g, "$1$1");
  return PATTERNS.some((pattern) => pattern.test(plain));
};
