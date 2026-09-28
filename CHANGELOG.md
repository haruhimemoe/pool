# Changelog

All notable changes to `@haruhimemoe/pool` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Pack keys never change for an existing pool; a new key format is a new key version.

## [Unreleased]

### Changed

- `checkBucketCode` refuses a code that is another slot's code plus a number (`NM1` next to `NM`, `RC` next to `RC1`) with the new `clash` error, so `addBucket` and `renameBucket` refuse it too. With both codes, `slotLabel` prints NM slot 1 as `NM1`, which `parsePoolText` reads as NM1's slot 1. Pools that already have such codes still validate and open.
- `parsePoolText` reports a line that would create such a code with the new `clash` error code.

### Fixed

- `parsePoolText` splits lines on a lone CR, U+2028 and U+2029 too. Before, every line after the first was lost without an error.
- `parsePoolText` reads a slot line whose beatmap is followed by a comma (`NM1 129891, Freedom Dive`), as ID lines already did.
- `moveBucket` (and `withBuckets`) put the slots in the new pool order. Before, they kept the old order, unlike every other edit and `decodePackKey`.

## [0.1.0] - 2026-09-23

### Added

- The `Pool` shape and zod schemas (`poolSchema`, `poolDraftSchema`, `poolFields`), with zod `^4.0.16` as a peer dependency.
- Mods on custom slots: forced sets (1 to 3, never EZ with HR or DT with HT) or freemod, with helpers for star-rating mod sets.
- Pure bucket and slot editing (`addSlot`, `moveSlot`, `mergeSlots`, `addBucket`, …); a refused edit returns the same object.
- `parsePoolText` for pasted pools, spreadsheet rows and osu! links, with coded errors.
- The pack key codec: `encodePackKey`, `decodePackKey` and `extractPackKey` for `pk1.`, `pk2.` and `pk3.` keys, byte for byte compatible with packs.haruhime.moe.
- `docs/pack-key.md`, the key format's specification, including the exact decoder rules.

[unreleased]: https://github.com/haruhimemoe/pool/compare/45a21de34de0bcc1795914bf258768fe8a0e84fe...HEAD
[0.1.0]: https://github.com/haruhimemoe/pool/tree/45a21de34de0bcc1795914bf258768fe8a0e84fe
