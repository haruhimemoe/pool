# Pack keys

The format `@haruhimemoe/pool` reads and writes (`encodePackKey`, `decodePackKey`, `extractPackKey`), first published as packs.haruhime.moe's pack key. Any app can make or open these keys; the same pool always gives the same key.

A pack key is a short piece of text that holds a whole mappool: the pack name, which beatmap goes in which slot, and the mods custom slots are played with. Paste it into packs and you get the same pool back, anywhere, without an account. Keys start with `pk1.`, `pk2.` or `pk3.`.

## Sharing a pack

- On the builder, use **Copy key** or **Copy share link**.
- A share link looks like `https://packs.haruhime.moe/k#pk1.…`. Everything after `/k#` is the key. Browsers never send that part to our server.
- To open a key, paste it (or a message containing it) into the box on the home page.

A key holds IDs only. Titles, difficulty names, and stats are looked up again when the key is opened, so a key never goes stale, but a map that was updated on osu! shows its current version.

## Version 1: the original format

A key is `pk1.` followed by base64url text (letters, digits, `-` and `_`, no padding). Decoded, the bytes are:

1. **Version**: one byte, `1`.
2. **Name length**: a varint (unsigned LEB128), then the name as UTF-8. Names are 1 to 64 characters.
3. **Slot count**: a varint, at most 64.
4. **Each slot**: one byte for the mod bucket, then the slot number as a varint, then the beatmap (difficulty) ID as a varint. Bucket bytes are 0 to 5 for NM, HD, HR, DT, FM, TB, in that order.
5. **Checksum**: two bytes, CRC-16/CCITT-FALSE of everything before it, high byte first.

Slots are always written in bucket order and then slot number, so the same pool always makes the same key. A key that was cut off or mistyped fails the checksum, and packs tells you it's damaged instead of opening the wrong pool.

## Version 2: custom slots and maps without a slot

Packs that use only NM, HD, HR, DT, FM, and TB in that order, with every map in a slot, still get `pk1.` keys. A pack with its own slots (like `EZ` in green), a different slot order, or maps without a slot gets a `pk2.` key instead. Decoded, a `pk2.` key is:

1. **Version**: one byte, `2`.
2. **Name**: a varint length, then the name as UTF-8, as in version 1.
3. **Slot table**: a varint count (6 to 14), then each slot in pool order. A built-in is one byte, `0` to `5` for NM, HD, HR, DT, FM, TB. A custom slot is the byte `0xFE`, one color byte (`0` to `9`: green, teal, pink, lime, cyan, fuchsia, yellow, red, indigo, stone), then its code as a varint length and UTF-8. Codes are 1 to 12 letters or digits.
4. **Map count**: a varint, at most 64.
5. **Each map**: one byte for its position in the slot table, or `0xFF` for "no slot", then the slot number and the beatmap ID as varints.
6. **Checksum**: two bytes, CRC-16/CCITT-FALSE of everything before it, as in version 1.

Maps without a slot come first, numbered 1, 2, 3, then the slots in table order. The same pool always makes the same key.

## Version 3: mods on custom slots

A custom slot can set the mods its maps are played with: forced mods (like `EZ`, or `HD` and `DT` together) or freemod. That changes the pool, so it goes in the key. A pack gets a `pk3.` key only when at least one custom slot has mods. Every other pack keeps its `pk1.` or `pk2.` key, byte for byte. Decoded, a `pk3.` key is:

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

A `pk3.` key whose custom slots end up with no mods still opens fine, and the next time packs writes that pool's key, it comes back out as `pk1.` or `pk2.` again.

## Version history

- **pk1.** (2026-09-22): the first format. The pack name and its maps in the six built-in slots.
- **pk2.** (2026-09-22): custom slots, a changed slot order, and maps without a slot.
- **pk3.** (2026-09-23): mods on custom slots.

Every new key format gets its own section on this page and a line in this list.
