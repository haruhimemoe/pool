# Contributing

## Setup

You need [Bun](https://bun.sh) (the version in `package.json`'s `packageManager` field) and Node 22.12 or later (`.nvmrc` has the version CI uses).

```sh
bun install
```

Read [AGENTS.md](./AGENTS.md) first, especially "Keys are forever".

## Making a change

1. Branch from `main` (`feat/<topic>`, `fix/<topic>`).
2. Write a failing test in `tests/`, make it pass, keep commits small and Conventional.
3. Run the full check before opening a PR:

   ```sh
   bun run check && bun run typecheck && bun run test && bun run test:dist
   ```

   `bun run check:fix` applies Biome's formatting and import order. CI also runs `bun run test:coverage` (at least 95% of `src/` lines, branches, functions and statements) and `bun run check:consumer <zod version>` with zod 4.0.16 and the newest zod. That one typechecks the packed package in a fresh project and needs the npm registry.

4. Add a line to `CHANGELOG.md` under `## [Unreleased]`, in the right [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) section (Added, Changed, Deprecated, Removed, Fixed, Security).

## Tests

- `tests/fixtures/legacy-keys.json`: hand-picked `pk1.` and `pk2.` keys, pinned since those versions shipped (`tests/key-legacy.test.ts`).
- `tests/fixtures/packs-keys.json`: 400 random pools that packs.haruhime.moe's own codec encoded and decoded, plus 400 damaged keys with the answer packs gave (`tests/packs-equivalence.test.ts`). **This file is a frozen record and must never be regenerated or hand-edited.** `scripts/gen-packs-keys.ts` shows how it was made. It can't be rerun now: packs.haruhime.moe uses this package, so a rerun would compare the package with itself.
- `tests/key-decoder.test.ts`: hand-built keys for each rule in the spec's "Decoder rules".
- `tests/exports.test.ts`: the exact list of runtime exports. Changing it is a semver decision and needs a changelog line.
- Add a fast-check property test when a new codec invariant appears.

Releases are cut by the maintainers.
