# Changelog

All notable changes to `@haruhimemoe/pool`. Pack keys never change for an existing pool; a new key format is a new version.

## 0.1.0 (unreleased)

- First release, extracted from packs.haruhime.moe: the pool shape and zod schemas, mods on custom slots, bucket and slot editing, pasted-pool parsing, and the pk1/pk2/pk3 pack key codec.
- Renamed from packs' code: `PackRef` is `Pool`, `PackSlotRef` is `PoolSlot`, `packRefSchema` is `poolSchema`, `packDraftSchema` is `poolDraftSchema`, `packRefFields` is `poolFields`, `checkPackBuckets` is `checkPoolBuckets`. The key functions keep their names.
- Messages say "pool" instead of "pack". The key `version` error no longer names packs.
- `freemodSets` and `modSetsFor` take a `Ruleset` ("osu" | "taiko" | "fruits" | "mania").
- `PALETTE` lists color names only. Apps map ids to their own styles.
