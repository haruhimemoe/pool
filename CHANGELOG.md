# Changelog

All notable changes to `@haruhimemoe/pool`. Pack keys never change for an existing pool; a new key format is a new version.

## 0.1.0 (unreleased)

- First release, extracted from packs.haruhime.moe: the pool shape and zod schemas, mods on custom slots, bucket and slot editing, pasted-pool parsing, and the pk1/pk2/pk3 pack key codec.
- Renamed from packs' code: `PackRef` is `Pool`, `PackSlotRef` is `PoolSlot`, `packRefSchema` is `poolSchema`, `packDraftSchema` is `poolDraftSchema`, `packRefFields` is `poolFields`, `checkPackBuckets` is `checkPoolBuckets`. The key functions keep their names.
- Messages say "pool" instead of "pack". The key `version` error no longer names packs.
- `freemodSets` and `modSetsFor` take a `Ruleset` ("osu" | "taiko" | "fruits" | "mania").
- `PALETTE` lists color names only. Apps map ids to their own styles.
- `parsePoolText` errors have a `code` (`SlotLineErrorCode`) next to the English `reason`, and the custom slot limit message uses `MAX_CUSTOM_BUCKETS`.
- The unused `ModdedRating` type isn't carried over.
- `docs/pack-key.md` is written as the format's spec, with the decoder rules another implementation needs.
- zod peer range `^4.0.16`, the oldest release the published types work with.
- Shared tables are frozen (`DEFAULT_BUCKETS` and its entries, `NO_MODS` and the built-in `SlotMods`, `PALETTE`, `MOD_BUCKETS`, `MOD_ACRONYMS`, `RULESETS`, `PACK_KEY_VERSIONS`, `MOD_BUCKET_NAMES` and every `*_MESSAGES` record). `SlotMods` is read-only, and `bucketsOf` returns `readonly Readonly<BucketEntry>[]`.
- `parsePoolText` reports `full-group` for a no-slot map that would be numbered past 99, and says "Slot numbers go from 1 to 99." for a bad slot number.
- `planMerge` drops slots that fail `poolSlotSchema` and, given the pool's buckets as a new third argument, slots in an unknown bucket. `mergeSlots` passes them, so it never builds an invalid pool.
- `removeSlot` returns the same pool when no slot matches (it used to renumber anyway).
- Pool names with a lone surrogate fail validation: a key can't carry them.
- `extractPackKey` ignores a `pk1.` glued to the end of a word (`apk1.…`).
- The key `version` message no longer assumes the key is newer: it can also be damaged.
- `docs/pack-key.md` spells out the decoder's exact whitespace set, byte order mark handling, base64 tail bits, code point counting, uppercasing and Unicode-version caveat, and the `empty` code. No key decodes differently.
- The full export list is in the README.
