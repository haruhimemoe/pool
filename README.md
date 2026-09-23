# @haruhimemoe/pool

An osu! tournament mappool as data, shared by the haruhime.moe tools (packs, pools, sheets):

- **The shape:** a name, slots (`NM1`, `HD2`, `TB1`, custom slots like `RC1`, and maps with no slot), and the bucket list, with zod schemas that validate it.
- **Mods:** which mods a custom slot forces (1 to 3, no EZ+HR or DT+HT) or whether it's freemod, and which mod sets a slot's star ratings are for.
- **Editing:** pure functions to add, move, remove and merge slots and to add, rename, recolor, reorder and remove custom slots. A refused edit returns the same object, so UI code can compare by reference.
- **Pasted pools:** beatmap IDs, osu! links and spreadsheet rows like `NM1 129891` turned into slots.
- **Pack keys:** the `pk1.` / `pk2.` / `pk3.` text that carries a whole pool. The format is specified in [docs/pack-key.md](docs/pack-key.md).

It has no network, no storage and no UI. It runs in browsers, Node 22.12+, Bun and edge runtimes.

## Install

```sh
bun add @haruhimemoe/pool zod
```

`zod` 4 is a peer dependency, so your app and this package share one copy and its schemas compose with yours.

## Use

```ts
import { addSlot, decodePackKey, encodePackKey, parsePoolText, type Pool } from "@haruhimemoe/pool";

let pool: Pool = { name: "EGC Quals", slots: [] };
pool = addSlot(pool, "NM", 129891); // NM1
pool = addSlot(pool, "HD", 2116202); // HD1

const key = encodePackKey(pool); // "pk1.…"
decodePackKey(key); // the same pool, validated, slots in pool order

const { slots, newBuckets, errors } = parsePoolText("NM2 75\nRC1 4000000", pool);
```

`decodePackKey` throws a `PackKeyError` whose `code` says what's wrong (`empty`, `prefix`, `version`, `encoding`, `checksum`, `malformed`). `PACK_KEY_ERROR_MESSAGES` has default wording; show your own if you prefer.

## What's in it

| Area | Exports |
| --- | --- |
| Shape and validation | `Pool`, `PoolSlot`, `BucketEntry`, `CustomBucket`, `poolSchema` (a complete pool, as in a key), `poolDraftSchema` (the name may be empty while typing), `poolFields` (unrefined, to `.extend()`; refine with `checkPoolBuckets`), `poolSlotSchema`, `storedSlotModsSchema`, `beatmapIdSchema`, `slotKey` |
| Limits and names | `MAX_SLOTS` (64), `MAX_SLOT_INDEX` (99), `MAX_NAME_LENGTH` (64), `MOD_BUCKETS`, `MOD_BUCKET_NAMES`, `MAX_CUSTOM_BUCKETS` (8), `BUCKET_CODE_PATTERN`, `PALETTE` (custom slot color names by id) |
| Mods | `MOD_ACRONYMS`, `SlotMods`, `slotModsFor`, `modSetProblem`, `modBlockedReason`, `toggleMod`, `modSetsFor`, `freemodSets`, `modsToBitmask`, `bitmaskToMods`, `slotModsSummary`, `RULESETS` |
| Buckets | `bucketsOf`, `DEFAULT_BUCKETS`, `canonicalBuckets`, `addBucket`, `renameBucket`, `recolorBucket`, `moveBucket`, `removeBucket`, `setBucketMods`, `checkBucketCode`, `slotLabel`, `bucketName`, … |
| Slots | `sortSlots`, `addSlot`, `removeSlot`, `moveSlot`, `mergeSlots`, `planMerge`, `nextSlotIndex` |
| Pasted text | `parseBeatmapRef`, `parsePoolText`, `POOL_LINE_HELP` |
| Pack keys | `encodePackKey`, `decodePackKey`, `extractPackKey`, `PackKeyError`, `PACK_KEY_VERSIONS` |

## Compatibility

Keys are forever. Every `pk1.`, `pk2.` and `pk3.` key ever made must open, and the same pool must always produce the same key. Two fixture sets guard this:

- `tests/fixtures/legacy-keys.json`: hand-picked keys, pinned since each version shipped.
- `tests/fixtures/packs-keys.json`: 400 random pools that packs.haruhime.moe's own codec encoded and decoded. This package must match it byte for byte.

A new key format is a new version (`pk4.`). It gets a section in [docs/pack-key.md](docs/pack-key.md), and older pools keep their keys.

## License

MIT. See [LICENSE](LICENSE).

## Develop

```sh
bun install
bun run check && bun run typecheck && bun run test && bun run test:dist
```
