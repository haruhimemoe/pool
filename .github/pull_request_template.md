## Summary

<!-- What changed and why. Link the issue if there is one. -->

## Checklist

- [ ] `bun run check && bun run typecheck && bun run test:coverage && bun run test:dist`
- [ ] A test covers it (a fast-check property for a new codec invariant)
- [ ] `tests/fixtures/` untouched: existing keys still open and encode the same
- [ ] A new, removed or renamed export updates `tests/exports.test.ts` and the README's API section
- [ ] A line under `## [Unreleased]` in `CHANGELOG.md`
