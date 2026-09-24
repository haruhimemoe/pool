# @haruhimemoe/pool

An osu! tournament mappool as data. It's part of the haruhime.moe tools, and [packs.haruhime.moe](https://packs.haruhime.moe) uses it.

- **The shape:** a name, slots (`NM1`, `HD2`, `TB1`, custom slots like `RC1`, and maps with no slot), and the bucket list, with zod schemas that validate it.
- **Mods:** which mods a custom slot forces (1 to 3, no EZ+HR or DT+HT) or whether it's freemod, and which mod sets a slot's star ratings are for.
- **Editing:** pure functions to add, move, remove and merge slots and to add, rename, recolor, reorder and remove custom slots. A refused edit returns the same object, so UI code can compare by reference.
- **Pasted pools:** beatmap IDs, osu! links and spreadsheet rows like `NM1 129891` turned into slots.
- **Pack keys:** the `pk1.` / `pk2.` / `pk3.` text that carries a whole pool. The format is specified in [docs/pack-key.md](docs/pack-key.md).

It has no network, no storage and no UI. See [Compatibility](#compatibility) for supported runtimes.

## Install

```sh
bun add @haruhimemoe/pool zod
# or: npm install @haruhimemoe/pool zod
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

`encodePackKey` validates first and throws zod's `ZodError` for a pool that isn't complete (an empty name, a bad slot). `decodePackKey` throws a `PackKeyError` whose `code` says what's wrong. `PACK_KEY_ERROR_MESSAGES` has default wording; show your own by code if you prefer:

```ts
import { decodePackKey, PACK_KEY_ERROR_MESSAGES, PackKeyError } from "@haruhimemoe/pool";

try {
  const pool = decodePackKey("pk1.AQFhAQICrAKFPA");
  console.log(pool.name); // "a"
} catch (error) {
  if (!(error instanceof PackKeyError)) throw error;
  console.error(PACK_KEY_ERROR_MESSAGES[error.code]);
}
```

`mergeSlots` leaves out anything that would make the pool invalid (a slot in a bucket the pool doesn't have, a number past 99), so skipping `addBuckets` silently drops the custom slots' maps. `planMerge(pool.slots, slots, bucketsOf(pool))` previews what `mergeSlots(pool, slots)` will add, replace and drop.

Why "pack key" and not "pool key"? That's the format's name: packs.haruhime.moe published it, and every key starts `pk`. The data is a `Pool`; a pool travels as a pack key.

## Words

- **Bucket:** a group of slots, like `NM`, `HD`, `TB`, or a custom one like `RC` or `EZ`. The six built-ins are always there; a pool may add up to 8 custom buckets, each with a color and optionally mods. The functions say bucket (`addBucket`, `renameBucket`); messages and the spec say "custom slot" for a custom bucket, because that's what hosts call it.
- **Slot:** a map's place in a bucket, like `NM1` or `RC2`. A `PoolSlot` is one map in one slot: `{ mod, index, beatmapId }`. The key spec calls these "maps".
- **`mod`** on a `PoolSlot` is its bucket's code (`"NM"`, `"RC"`), or `null` for a map with no slot. It isn't a mod: a custom bucket's mods are in that bucket's `mods` field, and `slotModsFor` gives any bucket's mods.

## API

Every runtime export is below, grouped by area. The package exports nothing else (a test pins the list), and everything comes from the package root, `@haruhimemoe/pool`.

### Shape and validation

| Export | What it is |
| --- | --- |
| `poolSchema` | A complete pool, as in a key. The name is trimmed, then must be 1 to 64 UTF-16 code units with no lone surrogate. At most 64 slots, each (bucket, number) once. The bucket list must pass `checkPoolBuckets`. |
| `poolDraftSchema` | The same, for a pool being edited: the name may be empty and isn't trimmed. |
| `poolFields` | The unrefined `z.object` behind both, to `.extend()`. Refine the result with `checkPoolBuckets`. |
| `checkPoolBuckets(pool, ctx)` | The bucket rules as a zod refinement: each built-in exactly once, custom codes unique (ignoring case) and never a built-in's code, at most 8 custom slots, and every slot's bucket in the list. |
| `poolSlotSchema` | One map: `mod` (a bucket code or `null`), `index` (1 to 99) and `beatmapId`. |
| `beatmapIdSchema` | An integer from 1 to 2147483647. |
| `bucketCodeSchema` | A string matching `BUCKET_CODE_PATTERN`. |
| `paletteColorSchema` | An integer from 0 to 9, an index into `PALETTE`. |
| `modAcronymSchema` | One of `MOD_ACRONYMS`. |
| `storedSlotModsSchema` | A custom slot's mods as stored: `{ kind: "forced", set }` with a set that passes `modSetProblem`, or `{ kind: "free" }`. No other keys. |
| `builtInBucketSchema` | `{ code }` for one of the six built-ins. |
| `customBucketSchema` | `{ code, color, mods? }`. |
| `bucketEntrySchema` | Either of the two. |
| `slotKey(slot)` | A string unique per (bucket, number), for `Map` and `Set` keys. |

A stored pool with more fields:

```ts
import { z } from "zod";
import { checkPoolBuckets, poolFields } from "@haruhimemoe/pool";

const storedPoolSchema = poolFields
  .extend({ description: z.string() })
  .superRefine(checkPoolBuckets);
type StoredPool = z.infer<typeof storedPoolSchema>;
```

### Limits and names

| Export | Value |
| --- | --- |
| `MAX_SLOTS` | `64` maps per pool. |
| `MAX_SLOT_INDEX` | `99`, the highest slot number. |
| `MAX_NAME_LENGTH` | `64` UTF-16 code units. |
| `MAX_CUSTOM_BUCKETS` | `8` custom slots per pool. |
| `MAX_BUCKET_CODE_LENGTH` | `12` code points. |
| `BUCKET_CODE_PATTERN` | `/^[\p{L}\p{N}]{1,12}$/u`: letters and digits in any script. |
| `MOD_BUCKETS` | `["NM", "HD", "HR", "DT", "FM", "TB"]`, the built-ins in default order. |
| `MOD_BUCKET_NAMES` | `{ NM: "No Mod", HD: "Hidden", HR: "Hard Rock", DT: "Double Time", FM: "Free Mod", TB: "Tiebreaker" }`. |
| `isModBucket(value)` | `true` only for an exact built-in code (`"hd"` is `false`). |
| `NO_SLOT_NAME` | `"No slot"`. |
| `PALETTE` | Custom slot color names by id: Green, Teal, Pink, Lime, Cyan, Fuchsia, Yellow, Red, Indigo, Stone. Names only: map them to your own styles. |
| `PALETTE_SIZE` | `10`. |

### Mods

| Export | What it does |
| --- | --- |
| `MOD_ACRONYMS` | `["EZ", "HD", "HR", "DT", "HT", "FL"]`: the mods a custom slot can force, in canonical order. |
| `isModAcronym(value)` | `true` only for an exact acronym. |
| `MAX_FORCED_MODS` | `3`. |
| `NO_MODS` | The shared `{ kind: "none" }`. |
| `slotModsFor(entry)` | What a bucket's maps are played with: NM none; HD, HR and DT that mod, forced; FM and TB freemod; a custom slot its `mods`, or none. |
| `modSetProblem(set)` | Why a forced set isn't valid (`empty`, `unknown`, `duplicate`, `tooMany`, `conflict`, `order`), or `null`. |
| `MOD_SET_MESSAGES` | Default wording for each problem. |
| `modBlockedReason(set, mod)` | Why `mod` can't join `set` (a clash, or already 3 mods), or `null`. Made for a disabled toggle's title. |
| `toggleMod(set, mod)` | `set` without `mod`, or with it added in canonical order. An unchanged copy when `mod` is blocked. |
| `modSetsFor(mods, mode)` | The mod sets to calculate star ratings for: none, the forced set, or `freemodSets(mode)`. |
| `freemodSets(mode)` | The sets a freemod slot shows: HD, HR, HD+HR and EZ, or only HD on mania. |
| `modsToBitmask(set)` | The pk3 bitmask: EZ 1, HD 2, HR 4, DT 8, HT 16, FL 32. |
| `bitmaskToMods(mask)` | The reverse, in canonical order. Throws a `RangeError` for a bit no mod uses. |
| `modsLabel(set)` | `"HDHR"`, or `""` for no mods. |
| `slotModsSummary(mods)` | `"Forced HD DT"`, `"Freemod"`, or `null` for no mods. |
| `RULESETS` | `["osu", "taiko", "fruits", "mania"]`, as the osu! API names them. |

### Buckets

| Export | What it does |
| --- | --- |
| `DEFAULT_BUCKETS` | The six built-ins in default order. A pool with no `buckets` field has this list. |
| `bucketsOf(pool)` | The pool's bucket list, or `DEFAULT_BUCKETS`. Read-only: edit through the functions below. |
| `isCustomBucket(entry)` | `true` for a custom slot (it has a `color`). |
| `canonicalBuckets(list)` | A copy of the list, or `undefined` when it equals the default. |
| `withBuckets(pool, list)` | `{ name, slots, buckets }` with the canonical list (no `buckets` field for the default). |
| `findBucket(list, code)` | The entry with exactly that code, or `undefined`. |
| `matchBucketCode(list, text)` | The stored code `text` matches, ignoring case, or `null`. |
| `insertBeforeTb(list, entry)` | A new list with `entry` just before TB (last when there's no TB). |
| `nextFreeColor(list)` | The lowest palette id no custom slot uses, or `0` when all are taken. |
| `checkBucketCode(list, code, { renaming? })` | Why `code` can't be a custom slot's code (`empty`, `long`, `chars`, `builtIn`, `taken`, `full`), or `null`. Trim the code first. When renaming, pass the current code as `renaming`, so a slot can keep its own code in another case. |
| `BUCKET_CODE_MESSAGES` | Default wording for each. |
| `addBucket(pool, code, color)` | Adds a custom slot just before TB. |
| `addBuckets(pool, entries)` | `addBucket` for each entry in order, skipping the ones it refuses. It reads only `code` and `color`: set mods afterwards with `setBucketMods`. |
| `renameBucket(pool, code, next)` | Renames a custom slot and moves its maps with it. |
| `recolorBucket(pool, code, color)` | Changes a custom slot's color. |
| `moveBucket(pool, code, to)` | Moves any bucket, built-ins included, to 0-based position `to` in the new list. |
| `removeBucket(pool, code)` | Removes a custom slot that has no maps. |
| `setBucketMods(pool, code, mods)` | Sets a custom slot's mods. `{ kind: "none" }` clears them. A forced set must pass `modSetProblem`, canonical order included (`toggleMod` keeps that order). |
| `slotLabel(slot)` | `"NM1"`, `"Speed2"`, `"RC1 2"` (a space when the code ends in a digit), or `"4"` for a map with no slot. |
| `slotTitle(slot)` | Like `slotLabel`, but `"No slot 4"` for a map with no slot. Made for accessible names. |
| `bucketName(entry)` | `"Hidden"` for a built-in, the code for a custom slot, `"No slot"` for `null`. |
| `bucketOptionLabel(entry)` | `"HD · Hidden"` for a built-in, the code for a custom slot. |

The edits return the same pool when they refuse:

- `addBucket`: a bad code or color.
- `renameBucket`: a built-in, an unknown code, the same code, or a bad new code.
- `recolorBucket`: a built-in, an unknown code, or a bad color.
- `moveBucket`: an unknown code, a position out of range, or the position it's already in.
- `removeBucket`: a built-in, an unknown code, or a bucket with maps.
- `setBucketMods`: a built-in, an unknown code, or a forced set that isn't valid.

### Slots

| Export | What it does |
| --- | --- |
| `sortSlots(slots, buckets?)` | A sorted copy: maps with no slot first, then bucket order (the built-ins when `buckets` is left out), then slot number. Maps in a bucket that isn't in the list go last. |
| `nextSlotIndex(slots, mod)` | One past the highest number in that group, or `1` when it's empty. |
| `addSlot(pool, mod, beatmapId)` | Adds a map at the end of a group (`mod` is `null` for no slot). Refuses when the pool has 64 maps, the group already reaches 99, or the pool doesn't have the bucket. |
| `removeSlot(pool, mod, index)` | Removes a map. Later maps in the same group move down one. Refuses when no map matches. |
| `moveSlot(pool, from, to)` | Moves the map at `from` (`{ mod, index }`) to the end of group `to` and closes the gap. Refuses a missing map, the same group, a target group that already reaches 99, or a bucket the pool doesn't have. |
| `mergeSlots(pool, incoming)` | Upserts maps by (bucket, number). Replacements always apply, new maps stop at 64, and anything `planMerge` drops is left out, so a valid pool stays valid. |
| `planMerge(slots, incoming, buckets?)` | `{ added, replaced, dropped }`. Dropped: new maps past 64, maps that fail `poolSlotSchema`, and, when `buckets` is given, maps in a bucket not in it. Pass `bucketsOf(pool)` to preview `mergeSlots` exactly; leave it out to preview a paste before its new custom slots exist. A map identical to one already there is in no list. |

### Pasted text

| Export | What it does |
| --- | --- |
| `parsePoolText(text, pool)` | Reads a pasted pool and returns `{ slots, newBuckets, errors }` (see below). `pool` needs only `slots` and, when it has custom slots, `buckets`. |
| `parseBeatmapRef(token)` | `{ ok: true, beatmapId }` for a difficulty ID or an osu.ppy.sh difficulty link (`/beatmaps/<id>`, `/b/<id>`, `/beatmapsets/<set>#<mode>/<id>`). Otherwise `{ ok: false, reason }`, with `"set-only"` for a beatmapset link and `"unrecognized"` for anything else. |
| `BEATMAP_REF_MESSAGES` | Default wording for the two reasons. |
| `POOL_LINE_HELP` | The reason text of an `unrecognized` line. |

How `parsePoolText` reads each line:

- Blank lines and lines starting with `#` are skipped.
- A line that starts with an ID or difficulty link is an ID line. Each ID or link up to the first other token (spaces or commas between them) becomes a map with no slot, numbered after the pool's highest. The rest of the line is ignored, so `129891 Freedom Dive` works.
- Anything else is a slot line: a code, an optional slot number (1 when left out), an optional `:`, `.` or `-`, a space, then an ID or difficulty link. Text after that is ignored. `NM1 129891`, `hd2: https://osu.ppy.sh/b/75` and `EZ 5` all work. A code that ends in a digit takes its number after a space: `RC1 2 555` is RC1 slot 2.
- Codes match the pool's buckets ignoring case. An unknown code becomes a new custom slot in `newBuckets`, with the next free color, before TB. Add them with `addBuckets` before `mergeSlots`.
- `slots` holds the maps in paste order. The same slot twice in one paste is an error; a slot the pool already has is not (`mergeSlots` replaces it).

Each error is `{ line, text, code, reason }`: a 1-based line number, the trimmed line, a code, and English text you can replace by code.

| `code` | The line |
| --- | --- |
| `set-only` | Has a beatmapset link, not a difficulty. |
| `unrecognized` | Isn't a slot line or an ID line. A numbered list (`1. 129891`) lands here too. |
| `bad-index` | Has slot number 0. |
| `bad-beatmap` | Has something other than an ID or difficulty link after the slot. |
| `full` | Needs a new custom slot, and the pool already has 8. |
| `duplicate` | Repeats a slot from earlier in the paste. |
| `full-group` | Would number a map with no slot past 99. The IDs before it on the line are kept. |

### Pack keys

| Export | What it does |
| --- | --- |
| `encodePackKey(pool)` | The pool's key. `pk1.` for the six built-ins in default order with every map in a slot, `pk2.` for custom slots, a changed order or maps with no slot, and `pk3.` only when a custom slot has mods. The name is trimmed first. Throws zod's `ZodError` when the pool fails `poolSchema`. |
| `decodePackKey(input)` | The pool, validated: slots in pool order, and `buckets` only when it isn't the default. Surrounding whitespace is ignored. Throws a `PackKeyError`. |
| `extractPackKey(text)` | The first key in a longer text (a message, a link), or `null`. A key glued to a letter, digit, `-` or `_` in front of it isn't found. |
| `PackKeyError` | An `Error` with `name` `"PackKeyError"`, a `code` (below), and that code's default text as `message`. |
| `PACK_KEY_ERROR_MESSAGES` | Default wording by code. |
| `PACK_KEY_VERSIONS` | `[1, 2, 3]`, the key versions this release reads. |

| `code` | The input |
| --- | --- |
| `empty` | Is blank. |
| `prefix` | Doesn't start with `pk`, a number and a dot. |
| `version` | Has a version this release can't read (like `pk4.`; `pk01.` isn't version 1), or a first byte that doesn't match the prefix. |
| `encoding` | Has a body that isn't base64url. |
| `checksum` | Fails the checksum, usually because it was cut off or mistyped. |
| `malformed` | Breaks one of the byte or pool rules in [the spec's decoder rules](docs/pack-key.md#decoder-rules). |

The same pool always gives the same key, and decoding a key and encoding the result gives the key back. The byte layout of each version is in [docs/pack-key.md](docs/pack-key.md).

### Types

`Pool`, `PoolSlot`, `BucketEntry` (`BuiltInBucket | CustomBucket`), `BuiltInBucket`, `CustomBucket`, `SlotBucket` (`string | null`), `StoredSlotMods`, `SlotMods`, `ModAcronym`, `ModBucket`, `Ruleset`, `ModSetProblem`, `BucketCodeError`, `BeatmapRefResult`, `SlotLineError`, `SlotLineErrorCode`, `MergePlan`, `PackKeyErrorCode` and `PackKeyVersion`.

### Edge behavior

- Every edit returns a new object, or the same object when it refuses. Nothing is changed in place.
- The bucket edits build a new `{ name, slots, buckets }`, so fields outside `Pool` (from a `poolFields.extend()` schema) don't carry through them. The slot edits copy the pool and keep them.
- The edits don't check beatmap IDs or names. Validate IDs as they come in (`parseBeatmapRef`, `beatmapIdSchema`), and run `poolSchema` or `poolDraftSchema` before you save.
- The shared tables (`DEFAULT_BUCKETS`, `NO_MODS`, `PALETTE`, `MOD_BUCKETS`, `MOD_ACRONYMS`, `RULESETS`, `PACK_KEY_VERSIONS`, `MOD_BUCKET_NAMES` and the `*_MESSAGES` records) are frozen, and `bucketsOf` and `slotModsFor` return read-only types, so one app module can't change them for another.
- Custom codes and names are checked with the runtime's Unicode tables. A code that uses a character newer than the runtime knows passes on a current engine and fails on an older one. See "Unicode versions" in [docs/pack-key.md](docs/pack-key.md).

## Compatibility

An ES module with no dependencies besides the `zod` peer. It runs in current browsers, Node 22.12+ (which can also `require()` it), Bun and edge runtimes. From the host it uses only `TextEncoder`, `TextDecoder`, `btoa` and `atob`.

Keys are forever: every `pk1.`, `pk2.` and `pk3.` key ever made keeps opening, and the same pool always produces the same key. The repo's tests prove it against hand-picked keys, hand-built decoder cases, and a frozen 800-case record made from packs.haruhime.moe's own codec; see [CONTRIBUTING.md](CONTRIBUTING.md#tests) for details. A new key format is a new version (`pk4.`). It gets a section in [docs/pack-key.md](docs/pack-key.md), and older pools keep their keys.

## License

MIT. See [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Changes are logged in [CHANGELOG.md](CHANGELOG.md).
