# Contributing

## Setup

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

4. Add a line to `CHANGELOG.md` under `## [Unreleased]`, in the right [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) section (Added, Changed, Deprecated, Removed, Fixed, Security).

## Tests

- `tests/fixtures/legacy-keys.json`: hand-picked keys, pinned since each version shipped.
- `tests/fixtures/packs-keys.json`: 400 random pools that packs.haruhime.moe's own codec encoded and decoded, plus 400 damaged keys with the answer packs gave, recorded at a known packs commit (`tests/packs-equivalence.test.ts`). **This file is a frozen record and must never be regenerated or hand-edited.** `scripts/gen-packs-keys.ts` documents how it was made, but only the maintainer can rerun it: it reads from packs.haruhime.moe's own codec, and that repository is private.
- `tests/key-decoder.test.ts`: hand-built keys for each rule in the spec's "Decoder rules".
- Add a fast-check property test when a new codec invariant appears.

Releases are cut by the maintainers.
