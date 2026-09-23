/**
 * @file src/mods.ts
 * @desc Mods on slots: the six mods a slot can force, which sets are valid and their canonical
 *       order, the pk3 bitmask, what each bucket plays with (SlotMods), and which mod sets a
 *       slot's star ratings are calculated for. MOD_ACRONYMS order is the pk3 bitmask (bit i =
 *       MOD_ACRONYMS[i]): append only, never reorder. Imports only types from schema.ts, because
 *       schema.ts imports this module.
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Sep 23, 2026
 * @modified Wed Sep 23, 2026
 */

import type { ModBucket } from "./constants.js";
import type { BucketEntry } from "./schema.js";

export const MOD_ACRONYMS = Object.freeze(["EZ", "HD", "HR", "DT", "HT", "FL"] as const);

/** osu!'s four rulesets, as the osu! API names them. */
export const RULESETS = Object.freeze(["osu", "taiko", "fruits", "mania"] as const);
export type Ruleset = (typeof RULESETS)[number];

export type ModAcronym = (typeof MOD_ACRONYMS)[number];

/**
 * What a slot's maps are played with. Stored custom slots only ever hold "forced" or "free".
 * Read-only, because slotModsFor hands out shared frozen values for the built-ins.
 */
export type SlotMods =
  | { readonly kind: "none" }
  | { readonly kind: "forced"; readonly set: readonly ModAcronym[] }
  | { readonly kind: "free" };

export const NO_MODS: SlotMods = Object.freeze({ kind: "none" });

export const MAX_FORCED_MODS = 3;

/** Pairs osu! won't combine. NC plays like DT, so it isn't offered at all. */
const CONFLICTS: readonly (readonly [ModAcronym, ModAcronym])[] = [
  ["EZ", "HR"],
  ["DT", "HT"],
];

export const MOD_SET_MESSAGES = Object.freeze({
  empty: "Pick at least one mod.",
  unknown: "Mods are EZ, HD, HR, DT, HT and FL.",
  duplicate: "Each mod can only be picked once.",
  tooMany: `A slot can force at most ${MAX_FORCED_MODS} mods.`,
  conflict: "EZ with HR, and DT with HT, can't be forced together.",
  order: "List mods in the order EZ, HD, HR, DT, HT, FL.",
} as const);

export type ModSetProblem = keyof typeof MOD_SET_MESSAGES;

/**
 * @function isModAcronym
 * @param value {string} untrusted input
 * @returns {boolean} true only for an exact acronym from MOD_ACRONYMS
 */
export const isModAcronym = (value: string): value is ModAcronym =>
  (MOD_ACRONYMS as readonly string[]).includes(value);

const rank = (mod: ModAcronym): number => MOD_ACRONYMS.indexOf(mod);

/**
 * @function modSetProblem
 * @param set {readonly string[]} a forced mod set as sent
 * @returns {ModSetProblem | null} why it can't be forced, or null when it's valid and canonical
 */
export const modSetProblem = (set: readonly string[]): ModSetProblem | null => {
  if (set.length === 0) return "empty";
  if (!set.every(isModAcronym)) return "unknown";
  const mods = set as readonly ModAcronym[];
  if (new Set(mods).size !== mods.length) return "duplicate";
  if (mods.length > MAX_FORCED_MODS) return "tooMany";
  if (CONFLICTS.some(([a, b]) => mods.includes(a) && mods.includes(b))) return "conflict";
  if (mods.some((mod, i) => i > 0 && rank(mod) < rank(mods[i - 1] as ModAcronym))) return "order";
  return null;
};

/**
 * @function modBlockedReason
 * @param set {readonly ModAcronym[]} the forced set so far
 * @param mod {ModAcronym} a mod the user might add
 * @returns {string | null} why it can't be added (for a disabled chip's title), or null
 */
export const modBlockedReason = (set: readonly ModAcronym[], mod: ModAcronym): string | null => {
  if (set.includes(mod)) return null;
  const clash = CONFLICTS.find(
    ([a, b]) => (a === mod && set.includes(b)) || (b === mod && set.includes(a)),
  );
  if (clash) return `${clash[0]} and ${clash[1]} can't be used together.`;
  if (set.length >= MAX_FORCED_MODS) return MOD_SET_MESSAGES.tooMany;
  return null;
};

/**
 * @function toggleMod
 * @param set {readonly ModAcronym[]} the forced set so far
 * @param mod {ModAcronym} the chip pressed
 * @returns {ModAcronym[]} the set without it (when picked) or with it in canonical order; a copy
 *          of the same set when the mod is blocked
 */
export const toggleMod = (set: readonly ModAcronym[], mod: ModAcronym): ModAcronym[] => {
  if (set.includes(mod)) return set.filter((m) => m !== mod);
  if (modBlockedReason(set, mod) !== null) return [...set];
  return MOD_ACRONYMS.filter((m) => m === mod || set.includes(m));
};

/**
 * @function modsToBitmask
 * @param set {readonly ModAcronym[]} mods
 * @returns {number} pk3 bitmask: EZ 1, HD 2, HR 4, DT 8, HT 16, FL 32
 */
export const modsToBitmask = (set: readonly ModAcronym[]): number =>
  set.reduce((mask, mod) => mask | (1 << rank(mod)), 0);

/**
 * @function bitmaskToMods
 * @param mask {number} a pk3 bitmask byte
 * @returns {ModAcronym[]} its mods in canonical order (empty for 0; validation rejects that later)
 * @throws {RangeError} for a bit no mod uses, a negative number, or a non-integer
 */
export const bitmaskToMods = (mask: number): ModAcronym[] => {
  if (!Number.isInteger(mask) || mask < 0 || mask >= 1 << MOD_ACRONYMS.length) {
    throw new RangeError("unknown mod bit");
  }
  return MOD_ACRONYMS.filter((_, i) => (mask & (1 << i)) !== 0);
};

/**
 * @function modsLabel
 * @param set {readonly ModAcronym[]} mods
 * @returns {string} "HDHR"; "" for no mods
 */
export const modsLabel = (set: readonly ModAcronym[]): string => set.join("");

const forced = (mod: ModAcronym): SlotMods =>
  Object.freeze({ kind: "forced", set: Object.freeze([mod]) });
const FREEMOD: SlotMods = Object.freeze({ kind: "free" });

const BUILT_IN_MODS: Readonly<Record<ModBucket, SlotMods>> = Object.freeze({
  NM: NO_MODS,
  HD: forced("HD"),
  HR: forced("HR"),
  DT: forced("DT"),
  FM: FREEMOD,
  TB: FREEMOD,
});

/**
 * @function slotModsFor
 * @param entry {BucketEntry} a bucket
 * @returns {SlotMods} NM none; HD, HR, DT that mod; FM and TB freemod; a custom slot its own
 *          setting (none when absent). Built-ins get shared frozen values.
 */
export const slotModsFor = (entry: BucketEntry): SlotMods =>
  "color" in entry ? (entry.mods ?? NO_MODS) : BUILT_IN_MODS[entry.code];

const FREEMOD_SETS: readonly (readonly ModAcronym[])[] = [["HD"], ["HR"], ["HD", "HR"], ["EZ"]];
/** EZ and HR hardly apply on mania, so the row shows HD only there. */
const MANIA_FREEMOD_SETS: readonly (readonly ModAcronym[])[] = [["HD"]];

/**
 * @function freemodSets
 * @param mode {Ruleset} the map's ruleset
 * @returns {readonly (readonly ModAcronym[])[]} the sets a freemod slot shows, in display order
 */
export const freemodSets = (mode: Ruleset): readonly (readonly ModAcronym[])[] =>
  mode === "mania" ? MANIA_FREEMOD_SETS : FREEMOD_SETS;

/**
 * @function modSetsFor
 * @param mods {SlotMods} what the slot plays with
 * @param mode {Ruleset} the map's ruleset
 * @returns {readonly (readonly ModAcronym[])[]} the sets to calculate: none, the forced set, or
 *          the freemod sets
 */
export const modSetsFor = (mods: SlotMods, mode: Ruleset): readonly (readonly ModAcronym[])[] => {
  if (mods.kind === "none") return [];
  if (mods.kind === "forced") return [mods.set];
  return freemodSets(mode);
};

/**
 * @function slotModsSummary
 * @param mods {SlotMods} a custom slot's setting
 * @returns {string | null} "Forced HD DT", "Freemod", or null for no mods
 */
export const slotModsSummary = (mods: SlotMods): string | null => {
  if (mods.kind === "none") return null;
  return mods.kind === "free" ? "Freemod" : `Forced ${mods.set.join(" ")}`;
};
