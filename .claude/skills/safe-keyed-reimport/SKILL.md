---
name: safe-keyed-reimport
description: Use when writing or debugging any JSON import/re-import flow in age-of-wonder — importing a heir-record export into another document, ingesting a file into a running state object, or any code that must handle "the same real-world record, imported a second time" correctly. This exact bug class (mutable-field keying, silent partial failure, unguarded lookup keys) has shipped and been independently re-fixed at least three times in this repo.
---

# Safe-Keyed Re-Import

**Why this is a skill:** three independent implementations of "import a
JSON record, and handle re-importing it correctly a second time" exist in
this repo — `aow_play_sheet.html:1027`'s `importFromS0()`,
`aow_gm_screen.html:1875`'s `ingestHeirRecord()`, and
`wonderland/importHeirRecord.js`, which explicitly documents itself as
"deliberately mirror[ing] `aow_play_sheet.html`'s own `importFromS0()` —
that function is a proven, bug-fixed reference implementation... not
something to redesign from scratch" (`importHeirRecord.js:11-15`). Two of
the three shipped real, independently-discovered bugs in the same shape
before converging on the rules below — `RECURRING_BUG_CATALOG.md` §3
covers the general class; this skill is the concrete, code-level version
for this repo's specific import surface.

## Rule 1 — required fields fail loudly, defaultable fields don't

Split every field into two categories before writing the import, not
during: **required** (the record is unusable without it — reject the
import with a clear message, per `aow_play_sheet.html:1039-1042`'s
"missing a name or a revealed school" check) vs. **defaultable** (a
missing value has a safe, real fallback — use `||`/`??` and move on). The
Wonderland adapter makes the same split but changes the failure mode to
match its own no-DOM context (`importHeirRecord.js:16-21`): a missing
required field still throws, but an unsupported version becomes a
`warnings` entry the caller can act on, not a blocking `confirm()` dialog
— **adapt the failure mechanism to the calling context, keep the
required-vs-default judgment itself identical.**

## Rule 2 — key by a stable id, never by a mutable display field

`aow_gm_screen.html:1941-1953` documents the exact failure: NPC nodes were
originally keyed by a name-derived slug. Correcting a typo, or filling in
a name that had been left blank, changed the derived key on re-import —
so "same heir, same slot" never matched the existing node, and a second,
orphaned duplicate got created instead of the existing one being updated.
The fix: store a real key (`heirKey`/`ownKey`) that survives a display-field
edit, and track the display-derived value (`nameSlug`) *separately*, only
for the specific cross-checks that genuinely need to match by name (a
cross-heir rival lookup, for instance) — don't let the separately-tracked
slug become the primary key by accident.

## Rule 3 — same-identity re-import is a real, intentional case — handle it explicitly, never as a silent no-op

`aow_gm_screen.html:1878-1884` documents the bug directly: a same-name
re-import used to just `return collisions` — a total silent no-op — while
the calling code still showed a generic "Heir Records Imported" success
message regardless. **A same-identity re-import must be its own
explicit branch**, not an accidental fallthrough:
- Tell the user plainly what re-importing will do (what gets refreshed,
  what gets reset) before doing it — `aow_gm_screen.html`'s `confirm()`
  message is the template: name the specific fields that will be
  overwritten, not a generic "are you sure."
- Preserve the existing record's key on update (`heirKey = existing.key`)
  so every downstream reference (node scores, ownership) that already
  points at that key stays valid — never mint a new key for what is
  semantically the same record.
- If part of the import is deliberately **additive** (new spells/items
  merge in rather than replace), confirm that behavior is what's wanted
  for a genuinely *different* identity too — `aow_play_sheet.html:1046-1055`
  documents the inverse bug: additive-safe logic for "re-import the same
  heir" silently merged a new heir's data on top of an old heir's leftover
  state when used to switch heirs entirely. **Detect "is this actually a
  different identity" explicitly** (a changed name, in that case) and do
  a full reset in that branch specifically, rather than letting one
  code path serve both "same record, updated" and "different record
  entirely."

## Rule 4 — a derived/stacked value never gets a second, narrower computation path

Not import-specific, but caught in this exact code: `aow_gm_screen.html:1929-1939`
documents a real bug where a value already correctly computed as a stack
of several inputs (relation + founding deed + aspect years + ideal +
succession, capped at +3 per the SRD) got silently overwritten by a second
function that re-derived it from only one of those inputs. If a value is
already computed correctly upstream and handed to you, store/display it —
don't recompute a narrower version of it downstream "just to be sure."

## Rule 5 (narrower, single-subsystem so far — one checklist line, not its own skill)

Any object keyed by a string that could come from user/import-controlled
input should guard against `"__proto__"`/`"constructor"`/`"prototype"` as
literal key values (`Object.create(null)`, a `Map`, or an explicit
`hasOwnProperty` check — a bare `obj[key]` existence check does not catch
this, since `"__proto__"` resolves through the prototype chain to a real
object instead of being "missing"). Currently only exercised in
`wonderland/engine.js:125-163` and `wonderland/worldStateBridge.js:53-71` —
apply the same guard to any *new* code that keys an object by an
import-controlled string, since the failure mode (silent mutation of
`Object.prototype` for the whole running process) is severe enough to
guard against on the first write, not just where it's already been found.

## Verification

Re-import the exact same record twice in a row (should be a clean
no-op-but-correctly-confirmed update, not a duplicate); re-import after
editing one display field (name) on the source record (should update in
place, not orphan); import two genuinely different records back to back
(should not leak state from the first into the second). Run all three
live through the actual UI — `playwright-adversarial-harness` covers the
harness pattern — not by reading the import function and confirming the
branches look complete.
