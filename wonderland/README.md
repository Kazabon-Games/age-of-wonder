# Wonderland: First Principles — Checkpoints 1-2

Schema + engine skeleton (Checkpoint 1), extended with more of the SRD's
deterministic combat/politics rules (Checkpoint 2 — "diceless engine passes
SRD-derived test cases" per `WONDERLAND_RPG_HANDOVER_CHECKPOINT1.md`'s
roadmap, `Studio-Internal-` repo). Not a game yet — no house content, no
narrative, no UI. This is the pure resolution engine and the data shapes it
operates on, verified against real rules from `aow_srd.html`, not read and
judged plausible.

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
- **Checkpoint 2** (§11-14 of the test file) extends coverage to: the
  magic-in-combat tier→slot-cost table (T1-T6, plus Wand's cast
  acceleration), Sword/Spear/Staff's deterministic weapon-specialty
  mechanics, the inside-the-barrier combat-end threshold, and the Leverage
  clamp to [-5, +5]. Every assertion cites the specific `aow_srd.html` line
  it enforces — hand-derived from individual stated rules the same way
  Checkpoint 1's second wound/stamina case was, since none of this has a
  second narrated worked exchange either.
- 62/62 checks pass as of this commit. Re-run: serve the repo
  (`npx http-server -p 8935`), then
  `node ../tests/wonderland-engine-adversarial.js`.

## Checkpoint 2 scope decision

Researched the full SRD (all six chapters) before writing code. Split found:
what's a hard, quotable rule vs. what the SRD itself hands to GM
adjudication with no formula. Checkpoint 2 stayed inside Combat + the one
explicitly-flagged Politics gap, on purpose:

- **Built**: magic-in-combat slot economy, Sword/Spear/Staff mechanics,
  the barrier combat-end threshold, Leverage's ceiling/floor clamp
  (resolves the exact gap Checkpoint 1 flagged: "the schema exists; the
  behavior it drives doesn't yet").
- **Surveyed, deliberately deferred**: Willstrain stage progression,
  Dissolution, and Advancement are all narratively signaled in the SRD, no
  formula given — nothing to encode without inventing one. Projectile's
  reload/ammo state is real but underspecified ("reloading costs the Move
  slot" without a stated loaded/unloaded state machine). Hybrid casting
  needs a bridging-fighting-style field this schema doesn't have yet — see
  `engine.js`'s explicit rejection of technique+cast in one declaration.
  Caravan's Momentum system and Exploration's Depth system both have real
  deterministic numbers too (starting Momentum is literally
  `round((Route+Cohesion+Cover)/1.2)`) — left out because they're separate
  encounter types from Combat, not an oversight, and deserve their own
  checkpoint-style pass rather than a bolt-on here.

## Confidence labeling

- **Verified**: the Checkpoint 1 weight/trigger model and wound/stamina
  rules (see prior notes below); the Checkpoint 2 additions above, each
  against a hand-derived case tracing a specific quoted SRD line — no
  second narrated worked exchange exists for any of this, same honest gap
  as Checkpoint 1's wound/stamina case.
- **Not yet verified**: Torso's "stamina degrades faster" is implemented as
  a documented fact only — this engine does not auto-accelerate stamina
  stage transitions from a Torso wound (that timing is explicitly
  GM-adjudicated per the SRD, not a fixed formula), so there's nothing here
  for a worked case to check numerically. Multi-exchange sequences beyond
  two exchanges, sustained T5/T6 casting across exchanges (marked
  `sustained: true` but not driven through a real multi-exchange sequence
  yet), and any interaction between Checkpoint 2's new mechanics and
  Checkpoint 1's initiative/technique logic in the same encounter, remain
  unexercised.
- **Explicitly out of scope here**: house content, narrative branches, the
  Essence-ledger-style World State *behavior* beyond Leverage (the schema
  exists for entities/choices; no behavior drives them yet), Caravan and
  Exploration encounter types entirely, per the scope decision above.
