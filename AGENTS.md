# AGENTS.md

`@haruhimemoe/pool`: an osu! tournament mappool as data. Shape, validation, mod rules, pure edits, pasted-text parsing, and the pack key codec. No network, storage or UI.

## Rules

- **Keys are forever.** Never change how an existing pool encodes. `tests/fixtures/legacy-keys.json` and `tests/fixtures/packs-keys.json` must pass unchanged; never regenerate or edit them to make a change pass. A new capability that must go in keys is a new version (`pk4.`), used only by pools that need it, with a section and a history line in `docs/pack-key.md`.
- **Append-only wire tables.** `MOD_BUCKETS`, `MOD_ACRONYMS` and `PALETTE` order are stored values. Append; never reorder or remove.
- **Pure functions.** Edits return new objects, or the same object when they refuse. No mutation, no I/O, no globals beyond `TextEncoder`, `TextDecoder`, `btoa` and `atob`.
- **zod is a peer dependency** (^4). Don't add runtime dependencies.
- **Public API is pinned** by `tests/exports.test.ts`. Adding or removing an export is a semver decision: note it in `CHANGELOG.md`.
- **Test first.** fast-check property tests cover the codec; add a property when a new invariant appears.
- Code style: Biome (2 spaces, double quotes, 100 columns). Every file starts with the `@file / @desc / @author / @created / @modified` header. Exported functions get JSDoc with `@function`, `@param`, `@returns`. Imports in `src/` use `.js` extensions.

## Before calling a change done

```sh
bun run check && bun run typecheck && bun run test && bun run test:dist
```
