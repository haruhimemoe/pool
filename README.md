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

`zod` (4.0.16 or later in 4.x) is a peer dependency, so your app and this package share one copy and its schemas compose with yours. CI typechecks a consumer against both 4.0.16 and the newest zod; older 4.0.x releases break the published types.

## Use

```ts
import {
  addBuckets,
  addSlot,
  decodePackKey,
  encodePackKey,
  mergeSlots,
  parsePoolText,
  type Pool,
} from "@haruhimemoe/pool";

let pool: Pool = { name: "EGC Quals", slots: [] };
pool = addSlot(pool, "NM", 129891); // NM1
pool = addSlot(pool, "HD", 2116202); // HD1

const key = encodePackKey(pool); // "pk1.…"
decodePackKey(key); // the same pool, validated, slots in pool order

const { slots, newBuckets, errors } = parsePoolText("NM2 75\nRC1 4000000", pool);
// Create the pasted custom slots (RC) first, then merge the maps into them.
pool = mergeSlots(addBuckets(pool, newBuckets), slots);
// errors lists the lines that were skipped, with a line number, a code and a reason.
```

`encodePackKey` validates first and throws zod's `ZodError` for a pool that isn't complete (an empty name, a bad slot). `decodePackKey` throws a `PackKeyError` whose `code` says what's wrong (`empty`, `prefix`, `version`, `encoding`, `checksum`, `malformed`). `PACK_KEY_ERROR_MESSAGES` has default wording; show your own by code if you prefer. `parsePoolText` errors carry a `code` the same way.

`mergeSlots` leaves out anything that would make the pool invalid (a slot in a bucket the pool doesn't have, a number past 99), so skipping `addBuckets` silently drops the custom slots' maps. `planMerge(pool.slots, slots)` previews what a merge will add, replace and drop.

Why "pack key" and not "pool key"? That's the format's name: packs.haruhime.moe published it, and every key starts `pk`. The data is a `Pool`; a pool travels as a pack key.

## Words

- **Bucket:** a group of slots, like `NM`, `HD`, `TB`, or a custom one like `RC` or `EZ`. The six built-ins are always there; a pool may add up to 8 custom buckets, each with a color and optionally mods. The functions say bucket (`addBucket`, `renameBucket`); messages and the spec say "custom slot" for a custom bucket, because that's what hosts call it.
- **Slot:** a map's place in a bucket, like `NM1` or `RC2`. A `PoolSlot` is one map in one slot: `{ mod, index, beatmapId }`. The key spec calls these "maps".
- **`mod`** on a `PoolSlot` is its bucket's code (`"NM"`, `"RC"`), or `null` for a map with no slot. It isn't a mod: a custom bucket's mods are in that bucket's `mods` field, and `slotModsFor` gives any bucket's mods.

## What's in it

| Area | Exports |
| --- | --- |
| Shape and validation | `Pool`, `PoolSlot`, `BucketEntry`, `CustomBucket`, `poolSchema` (a complete pool, as in a key), `poolDraftSchema` (the name may be empty while typing), `poolFields` (unrefined, to `.extend()`; refine with `checkPoolBuckets`), `poolSlotSchema`, `storedSlotModsSchema`, `beatmapIdSchema`, `bucketCodeSchema`, `paletteColorSchema`, `modAcronymSchema`, `builtInBucketSchema`, `customBucketSchema`, `bucketEntrySchema`, `slotKey` |
| Limits and names | `MAX_SLOTS` (64), `MAX_SLOT_INDEX` (99), `MAX_NAME_LENGTH` (64), `MOD_BUCKETS`, `MOD_BUCKET_NAMES`, `isModBucket`, `MAX_CUSTOM_BUCKETS` (8), `MAX_BUCKET_CODE_LENGTH` (12), `BUCKET_CODE_PATTERN`, `NO_SLOT_NAME`, `PALETTE` (custom slot color names by id), `PALETTE_SIZE` |
| Mods | `MOD_ACRONYMS`, `isModAcronym`, `MAX_FORCED_MODS` (3), `SlotMods`, `NO_MODS`, `slotModsFor`, `modSetProblem`, `MOD_SET_MESSAGES`, `modBlockedReason`, `toggleMod`, `modSetsFor`, `freemodSets`, `modsToBitmask`, `bitmaskToMods`, `modsLabel`, `slotModsSummary`, `RULESETS` |
| Buckets | `bucketsOf`, `DEFAULT_BUCKETS`, `isCustomBucket`, `canonicalBuckets`, `withBuckets`, `findBucket`, `matchBucketCode`, `insertBeforeTb`, `nextFreeColor`, `addBucket`, `addBuckets`, `renameBucket`, `recolorBucket`, `moveBucket`, `removeBucket`, `setBucketMods`, `checkBucketCode`, `BUCKET_CODE_MESSAGES`, `slotLabel`, `slotTitle`, `bucketName`, `bucketOptionLabel` |
| Slots | `sortSlots`, `addSlot`, `removeSlot`, `moveSlot`, `mergeSlots`, `planMerge`, `nextSlotIndex` |
| Pasted text | `parseBeatmapRef`, `BEATMAP_REF_MESSAGES`, `parsePoolText` (errors have a `SlotLineErrorCode`), `POOL_LINE_HELP` |
| Pack keys | `encodePackKey`, `decodePackKey`, `extractPackKey`, `PackKeyError`, `PACK_KEY_ERROR_MESSAGES`, `PACK_KEY_VERSIONS` |

That's every runtime export; `tests/exports.test.ts` pins the list. The shared tables (`DEFAULT_BUCKETS`, `NO_MODS`, `PALETTE`, `MOD_BUCKETS`, the `*_MESSAGES` records and the rest) are frozen, and `bucketsOf` and `slotModsFor` return read-only types, so one app module can't change them for another.

## Compatibility

Keys are forever. Every `pk1.`, `pk2.` and `pk3.` key ever made must open, and the same pool must always produce the same key. Three test sets guard this:

- `tests/fixtures/legacy-keys.json`: hand-picked keys, pinned since each version shipped.
- `tests/fixtures/packs-keys.json`: 400 random pools that packs.haruhime.moe's own codec encoded and decoded, and 400 damaged keys with the answer packs gave, recorded at a known packs commit. This package must match every one. packs.haruhime.moe's repository is private, so this file is a frozen record: `scripts/gen-packs-keys.ts` shows how it was made, but only the owner can rerun it.
- `tests/key-decoder.test.ts`: hand-built keys for each rule in the spec's "Decoder rules".

A new key format is a new version (`pk4.`). It gets a section in [docs/pack-key.md](docs/pack-key.md), and older pools keep their keys.

## License

MIT. See [LICENSE](LICENSE).

## Develop

```sh
bun install
bun run check && bun run typecheck && bun run test && bun run test:dist
```

### Releasing

Releases publish from GitHub through `.github/workflows/release.yml` with npm trusted publishing. A version with a prerelease part (`0.2.0-rc.1`) goes to the `next` dist-tag, anything else to `latest`.

npm only lets you add a trusted publisher to a package that already exists, so the first 0.1.0 is published by hand. From a clean checkout of the tagged commit, run `bun install --frozen-lockfile`, `bun run build` and every check above, then `npm publish --access public --provenance=false`. Then add the trusted publisher (npm 11.15.0 or later, with 2FA): `npm trust github @haruhimemoe/pool --file release.yml --repo haruhimemoe/pool --env npm --allow-publish`. Every later release goes through release.yml.
