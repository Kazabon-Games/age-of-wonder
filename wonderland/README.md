# Wonderland: First Principles — Checkpoint 1

Schema + engine skeleton, per `WONDERLAND_RPG_HANDOVER_CHECKPOINT1.md`
(`Studio-Internal-` repo). Not a game yet — no house content, no narrative,
no UI. This is the pure resolution engine and the data shapes it operates
on, verified against a real worked example from `aow_srd.html`.

## Files

- **`schema.js`** — plain, JSON-serializable data shapes: `CharacterRecord`,
  `Technique`, `HouseRecord`, `EncounterState`/`Declaration`, `SaveState`,
  and the ID-keyed `WorldStateRecord` (`entity:`/`choice:` namespaces).
- **`engine.js`** — `resolve(currentState, action) -> newState`. Pure: no
  IndexedDB, no DOM, runs identically in plain Node or a browser (see the
  test file for a same-behavior check in both). Implements the weight
  model (initiative, including Dagger's unconditional override) and the
  trigger model (technique trigger predicates) — see the file header for
  exactly which parts of `aow_srd.html`'s combat system are deterministic
  by the SRD's own design vs. left to GM adjudication, and why this engine
  doesn't fabricate precision for the latter.
- **`persistence.js`** — the one module allowed to touch IndexedDB.
  Browser-only. `entity:`/`choice:`/`save:` keys in a single object store.
- **`harness.html`** — not a game screen; loads the three modules above via
  plain `<script>` tags (no bundler) and exposes `window.Wonderland._test`
  for the Playwright harness to drive.

## Document shape decision (checkpoint doc §1, first checkbox)

Engine + content split, confirmed: `schema.js`, `engine.js`, and
`persistence.js` are separate files loaded via plain `<script>` tags, no
build step — matching the studio's existing no-build convention
(`STUDIO_BIBLE.md` §5, Path B) while keeping the pure engine physically
separate from anything that will eventually touch the DOM or house
content.

## Verification (checkpoint doc §3)

Run for real, not read and judged plausible — see
`../tests/wonderland-engine-adversarial.js`:

- The engine is driven through `aow_srd.html`'s own "A Worked Exchange"
  (ch4-techniques: Mira/Sword/Riposte vs. Davan/Dagger) and checked against
  that passage's actual described outcomes — Dagger's unconditional
  initiative, Riposte's trigger not firing in exchange 1 and firing in
  exchange 2, both actions landing in the same exchange.
- A second, constructed case (§9-10 of the test file) covers every
  wound/stamina rule the first exchange never exercises: Head, Weapon Arm,
  Shield Arm, Legs, and Presence wounds, Strained/Spent stamina, and the
  slot-cost surcharges. This isn't a second SRD narrative passage — the SRD
  only narrates the one exchange — it's hand-derived from the wound table's
  individual stated rules, each assertion citing the specific line it
  enforces, computed independently before the engine ran rather than read
  back out of this file's own code.
- That second case caught a real bug: `presenceStage()` had no check for a
  Presence wound at all; `applyWound()` was bumping stamina one stage as a
  workaround, which only ever degraded Hold and silently left Commit at
  "full" — contradicting the SRD's "drops all three components
  immediately." Fixed in `engine.js`; see its file header.
- The persistence layer is tested against a missing record and a
  wrong-schema-version save in a real IndexedDB (via Playwright), and
  confirmed to throw rather than silently default.
- 34/34 checks pass as of this commit. Re-run: serve the repo
  (`npx http-server -p 8935`), then
  `node ../tests/wonderland-engine-adversarial.js`.

## Confidence labeling

- **Verified**: the weight/trigger model, against the SRD's one narrated
  worked exchange; and the full wound/stamina rule set (Head, Weapon Arm,
  Shield Arm, Legs, Presence, Strained, Spent), against a constructed case
  hand-derived from the SRD's wound table rather than a second narrated
  passage — the SRD doesn't provide one.
- **Not yet verified**: Torso's "stamina degrades faster" is implemented as
  a documented fact only — this engine does not auto-accelerate stamina
  stage transitions from a Torso wound (that timing is explicitly
  GM-adjudicated per the SRD, not a fixed formula), so there's nothing here
  for a worked case to check numerically. Multi-exchange sequences beyond
  two exchanges, and any interaction between the Presence-wound fix and the
  Riposte/initiative logic in the same encounter, remain unexercised.
- **Explicitly out of scope here**: house content, narrative branches, the
  Essence-ledger-style World State *behavior* (the schema exists;
  faction-standing effects don't), per the checkpoint doc §2.
