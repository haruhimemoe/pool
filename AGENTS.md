# AGENTS.md

`@haruhimemoe/pool`: an osu! tournament mappool as data. Shape, validation, mod rules, pure edits, pasted-text parsing, and the pack key codec (`pk1.`, `pk2.`, `pk3.`). No network, storage or UI. packs.haruhime.moe depends on it.

## Rules

- **Keys are forever.** Never change how an existing pool encodes, or refuse a key that opens today. `docs/pack-key.md` is the spec; the codec and the spec change together.
- **Frozen fixtures.** `tests/fixtures/legacy-keys.json` and `tests/fixtures/packs-keys.json` must pass unchanged. Never regenerate or edit them to make a change pass. `packs-keys.json` in particular can't be remade: `scripts/gen-packs-keys.ts` read packs.haruhime.moe's own codec, and packs now uses this package, so a rerun would only compare the package with itself. A failure in these tests means an existing key changed.
- **New key formats are new versions.** A capability that must go in keys is `pk4.`, used only by pools that need it, appended to `PACK_KEY_VERSIONS`, with a section and a history line in `docs/pack-key.md`. Every other pool keeps its key byte for byte.
- **Append-only wire tables.** `MOD_BUCKETS`, `MOD_ACRONYMS` (the pk3 bitmask bit order) and `PALETTE` order are stored values, and so are the table bytes in `src/key.ts` (`0xFE`, `0xFD`, `0xFF`, mode `1`/`2`). Append; never reorder, renumber or remove.
- **Pure functions.** Edits return new objects, or the same object when they refuse. No mutation, no I/O. From the host, only `TextEncoder`, `TextDecoder`, `btoa` and `atob`. Exported tables are frozen.
- **zod is a peer dependency** (`^4.0.16`; `bun run check:consumer 4.0.15` fails on the published types, 4.0.16 passes). Don't add runtime dependencies.
- **Public API is pinned** by `tests/exports.test.ts`, and the README's API section lists every export. Adding, removing or renaming an export is a semver decision: update the test, the README and `CHANGELOG.md` together.
- **Test first.** fast-check property tests cover base64url, CRC-16, varints and the codec; add a property when a new invariant appears. Tests never touch the network.
- **Changelog.** Keep a Changelog 1.1.0. User-visible changes get a line under `## [Unreleased]`. Never rewrite a released entry.
- **Code style.** Biome (2 spaces, double quotes, trailing commas, 100 columns). Every file starts with the `@file / @desc / @author / @created / @modified` header. Exported functions get JSDoc with `@function`, `@param`, `@returns` (and `@throws` when they throw). Imports in `src/` use `.js` extensions. Plain, short sentences in docs and messages, no em dashes.

## Layout

- `src/index.ts`: re-exports every module below. The package has one entry point.
- `src/schema.ts`: zod schemas and the `Pool`, `PoolSlot` and bucket types; `checkPoolBuckets`.
- `src/constants.ts`: limits, built-in buckets, the custom slot code pattern, `PALETTE`.
- `src/mods.ts`: mod acronyms, forced set rules, the pk3 bitmask, `slotModsFor`, star rating mod sets. Imports only types from `schema.ts` (which imports it).
- `src/buckets.ts`: bucket list helpers, labels, code checks, and the bucket edits.
- `src/pool.ts`: slot order and the slot edits (`addSlot`, `removeSlot`, `moveSlot`, `mergeSlots`, `planMerge`).
- `src/input.ts`: `parseBeatmapRef` and `parsePoolText`.
- `src/key.ts`: the pack key codec, `PackKeyError`, `extractPackKey`.
- `src/base64url.ts`, `src/crc16.ts`, `src/varint.ts`: codec internals, not exported from the package.
- `docs/pack-key.md`: the key format spec, including the decoder rules. Ships in the npm package.
- `tests/`: `schema`, `mods`, `buckets`, `pool`, `input`, `key`, `base64url`, `crc16` and `varint` test their modules; `key-decoder` has hand-built keys per decoder rule; `key-legacy` and `packs-equivalence` run the frozen fixtures in `tests/fixtures/`; `exports` pins the public API; `extras` pins edge cases.
- `scripts/smoke.mjs`: imports the built `dist/` and round-trips a key per version (`bun run test:dist`).
- `scripts/check-consumer.mjs`: packs the package, installs it with a given zod, typechecks and runs a strict consumer.
- `scripts/gen-packs-keys.ts`: how `packs-keys.json` was made. Never rerun it.
- `.github/workflows/ci.yml`: check, typecheck, coverage, build and pack dry run; `dist` on Node 22.12 and 24; the consumer check on zod 4.0.16 and latest.
- `.github/workflows/release.yml`: publishes to npm when a GitHub release is published.

## Before calling a change done

```sh
bun run check && bun run typecheck && bun run test:coverage && bun run test:dist
```

`test:coverage` is `test` with the 95% coverage floor CI enforces.
