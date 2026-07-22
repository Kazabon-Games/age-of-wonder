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
- The persistence layer is tested against a missing record and a
  wrong-schema-version save in a real IndexedDB (via Playwright), and
  confirmed to throw rather than silently default.
- 22/22 checks pass as of this commit. Re-run: serve the repo
  (`npx http-server -p 8935`), then
  `node ../tests/wonderland-engine-adversarial.js`.

## Confidence labeling

- **Verified**: the weight/trigger model above, against the one worked
  example the SRD provides. One example is not full coverage — it's the
  only real worked case ch4-techniques gives.
- **Not yet verified**: wound/stamina interactions beyond what the worked
  exchange exercises (Head/Shield Arm/Legs wound effects on Read/Hold,
  Torso's faster stamina degradation, the Presence-wound stage-drop) are
  implemented per the SRD's wound table but have no worked example to
  check them against yet — treat as intent, not a completed claim, until
  a second worked case or a real playtest exercises them.
- **Explicitly out of scope here**: house content, narrative branches, the
  Essence-ledger-style World State *behavior* (the schema exists;
  faction-standing effects don't), per the checkpoint doc §2.
