# Pack keys

A pack key is a short piece of text that holds a whole mappool: its name, which beatmap goes in which slot, the slot list (including custom slots and their colors), and the mods custom slots are played with. Keys start with `pk1.`, `pk2.` or `pk3.`. The format was first published by packs.haruhime.moe, and `@haruhimemoe/pool` reads and writes it (`encodePackKey`, `decodePackKey`, `extractPackKey`).

- **Deterministic:** the same pool always makes the same key, and a pool gets the oldest version that can hold it.
- **Forever:** every key ever written must keep opening. A new capability is a new version, used only by pools that need it.
- **Identity only:** a key holds IDs, never titles, difficulty names or stats. Apps look those up when they open a key, so a key never goes stale, but a map updated on osu! shows its current version.
- **Safe to paste anywhere:** the text is base64url, so it survives chat apps and URL fragments. `extractPackKey` finds a key inside a longer message or link.

## Version 1: the original format

A key is `pk1.` followed by base64url text (letters, digits, `-` and `_`, no padding). Decoded, the bytes are:

1. **Version**: one byte, `1`.
2. **Name length**: a varint (unsigned LEB128), then the name as UTF-8. Names are 1 to 64 characters.
3. **Slot count**: a varint, at most 64.
4. **Each slot**: one byte for the mod bucket, then the slot number as a varint, then the beatmap (difficulty) ID as a varint. Bucket bytes are 0 to 5 for NM, HD, HR, DT, FM, TB, in that order.
5. **Checksum**: two bytes, CRC-16/CCITT-FALSE of everything before it, high byte first.

Slots are always written in bucket order and then slot number, so the same pool always makes the same key. A key that was cut off or mistyped fails the checksum, so a decoder reports it damaged instead of opening the wrong pool.

## Version 2: custom slots and maps without a slot

Pools that use only NM, HD, HR, DT, FM, and TB in that order, with every map in a slot, still get `pk1.` keys. A pool with its own slots (like `EZ` in green), a different slot order, or maps without a slot gets a `pk2.` key instead. Decoded, a `pk2.` key is:

1. **Version**: one byte, `2`.
2. **Name**: a varint length, then the name as UTF-8, as in version 1.
3. **Slot table**: a varint count (6 to 14), then each slot in pool order. A built-in is one byte, `0` to `5` for NM, HD, HR, DT, FM, TB. A custom slot is the byte `0xFE`, one color byte (`0` to `9`: green, teal, pink, lime, cyan, fuchsia, yellow, red, indigo, stone), then its code as a varint length and UTF-8. Codes are 1 to 12 letters or digits.
4. **Map count**: a varint, at most 64.
5. **Each map**: one byte for its position in the slot table, or `0xFF` for "no slot", then the slot number and the beatmap ID as varints.
6. **Checksum**: two bytes, CRC-16/CCITT-FALSE of everything before it, as in version 1.

Maps without a slot come first, numbered 1, 2, 3, then the slots in table order. The same pool always makes the same key.

## Version 3: mods on custom slots

A custom slot can set the mods its maps are played with: forced mods (like `EZ`, or `HD` and `DT` together) or freemod. That changes the pool, so it goes in the key. A pool gets a `pk3.` key only when at least one custom slot has mods. Every other pool keeps its `pk1.` or `pk2.` key, byte for byte. Decoded, a `pk3.` key is:

1. **Version**: one byte, `3`.
2. **Name**: as in version 2.
3. **Slot table**: as in version 2, with one more kind of entry. A custom slot with mods is the byte `0xFD`, one color byte, its code as a varint length and UTF-8, then a mode byte: `1` for forced mods or `2` for freemod. Forced mods add one more byte, the mod bitmask. A custom slot without mods is still written with `0xFE`.
4. **Map count** and **each map**: as in version 2.
5. **Checksum**: as in versions 1 and 2.

The mod bitmask adds up one bit per forced mod:

- `EZ` (Easy): 1
- `HD` (Hidden): 2
- `HR` (Hard Rock): 4
- `DT` (Double Time): 8
- `HT` (Half Time): 16
- `FL` (Flashlight): 32

So `HD` and `DT` together is `10`. A slot forces 1 to 3 mods. `EZ` with `HR`, and `DT` with `HT`, can't be forced together. Nightcore plays like `DT`, so use `DT`. Built-in slots never store mods: NM has none, HD, HR and DT force that mod, and FM and TB are freemod.

A `pk3.` key whose custom slots end up with no mods still opens fine, and the next time that pool is encoded it comes back out as `pk1.` or `pk2.` again.

## Decoder rules

Everything a decoder must check, so every implementation accepts and refuses the same keys. `decodePackKey` reports the first failure as a `PackKeyError` code, shown in brackets.

**Text**

- Surrounding whitespace is ignored. The text is `pk`, the version number spelled exactly (`pk1.` is version 1; `pk01.` is not), a dot, then the body (`prefix` when the shape is wrong, `version` when the number isn't one this decoder reads).
- The body is strict base64url: only `A-Z a-z 0-9 - _`, no padding, and never a length that leaves a single dangling character (`encoding`).
- It must decode to at least 3 bytes (`malformed`). The last two are the CRC-16/CCITT-FALSE of the rest, high byte first (`checksum`). The first body byte must equal the prefix's version (`version`).

**Bytes** (all `malformed`)

- Varints are unsigned LEB128, at most 5 bytes, at most 2³²−1. Overlong encodings (like `0x80 0x00` for 0) are accepted.
- Strings are a varint byte length and valid UTF-8 that must not run past the end.
- Slot table: 6 to 14 entries. Bytes `0` to `5` are the built-ins, `0xFE` a custom slot, and `0xFD` a custom slot with mods (version 3 only; in version 2 it's an unknown byte). A color byte and, for `0xFD`, a mode byte (`1` forced, `2` freemod) and for forced mods a bitmask byte must be present. A bitmask with a bit no mod uses is refused.
- At most 64 maps. A map's table position must exist (`0xFF` is "no slot", allowed only when there's a table). In version 1, the bucket byte must be `0` to `5`.
- Nothing may follow the last map.

**The pool** (all `malformed`: the decoded pool must pass `poolSchema`)

- The name is trimmed, then 1 to 64 UTF-16 code units.
- Slot numbers are 1 to 99. Beatmap IDs are 1 to 2³¹−1. Each (slot, number) appears once.
- The table has each built-in exactly once, at most 8 custom slots, and custom codes that are 1 to 12 letters or digits, unique ignoring case, and not a built-in's code in any case. Every map's slot is in the table.
- Colors are `0` to `9`. Forced mods are 1 to 3, in the order EZ, HD, HR, DT, HT, FL, without EZ with HR or DT with HT.

**What comes out**

- Slots in pool order: no-slot maps first, then the table's order, then slot number.
- `buckets` only when the table isn't the six built-ins in default order.
- Encoding that result gives the canonical key. Any key an encoder wrote comes back unchanged. A hand-built key that is valid but not canonical (overlong varints, maps out of order, a written-out default table, a higher version than it needs) still opens, and re-encodes to the canonical key.

## Version history

- **pk1.** (2026-09-22): the first format. The pool name and its maps in the six built-in slots.
- **pk2.** (2026-09-22): custom slots, a changed slot order, and maps without a slot.
- **pk3.** (2026-09-23): mods on custom slots.

Every new key format gets its own section on this page and a line in this list.
