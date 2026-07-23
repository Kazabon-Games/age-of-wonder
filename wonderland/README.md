# Wonderland: First Principles — Checkpoints 1-4

Schema + engine skeleton (Checkpoint 1), extended with more of the SRD's
deterministic combat/politics rules (Checkpoint 2), then extended again by
digging through the *rest* of the AOW suite — not just the SRD — for real,
already-shipped mechanics and a real heir-import boundary (Checkpoint 3,
mapped loosely onto "one house vertical-sliced" from
`WONDERLAND_RPG_HANDOVER_CHECKPOINT1.md`'s roadmap, `Studio-Internal-`
repo). Checkpoint 4 ("remaining five houses") hit a hard wall — no house
Kit/Principle/Transformation content exists anywhere yet, real or
otherwise — so it proved the pipeline with one explicitly-labeled
placeholder house instead of fabricating six houses' worth of invented
lore (see its own section below). Not a game yet — no UI, no narrative
prose. This is the pure resolution engine, the data shapes it operates on,
and the adapters that import real player-created content, verified against
real rules, real shipped tools, and real (if placeholder) mechanical
proof — not read and judged plausible.

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
- **`importHeirRecord.js`** — Checkpoint 3: adapts a real
  `aow_heir_record.html` JSON export into `schema.js` shapes. See its own
  header for why its required-vs-default field discipline deliberately
  mirrors `aow_play_sheet.html`'s proven `importFromS0()` rather than
  reinventing that split.
- **`placeholderHouse.js`** — Checkpoint 4: ONE explicitly-labeled
  placeholder house (every name flagged `[PLACEHOLDER]`) proving
  `HouseRecord`/`TransformationForm` and the `GRANT_TECHNIQUE`/
  `ACTIVATE_TRANSFORMATION` actions work end-to-end. Not real content —
  see its own header. Delete this file, don't extend it, once real house
  content exists.
- **`worldNpcs.js`** — REAL content (not placeholder), the mechanical
  fields of `aow_gm_screen.html`'s own `WORLD_NPCS` array: nine named,
  already-authored individuals and their relationship-graph edges to each
  other. Used to seed `politicalNodes` for ripple propagation — see below.
- **`harness.html`** — not a game screen; loads all six modules above via
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
- **Checkpoint 3** (§15-17 of the test file) adds: the real Weight Engine
  ported from `aow_gm_screen.html` (tier-based leverage deltas with
  fractional carry, escalating trigger thresholds), Capstone application
  from `aow_heir_record.html`'s real content, and the heir-import adapter
  run against a fixture built from that tool's actual export shape (not an
  invented one).
- **Checkpoint 4** (§18 of the test file) adds `GRANT_TECHNIQUE` and
  `ACTIVATE_TRANSFORMATION`, driven end-to-end through the placeholder
  house: a house ability is granted, then actually resolves through a
  real combat exchange (not just checked for presence in an array); a
  Transformation form's unlock condition blocks activation before it's
  met and allows it after; the granted bonus technique then ALSO resolves
  through a real exchange, including evaluating a real structured
  trigger.
- 102/102 checks pass as of this commit. Re-run: serve the repo
  (`npx http-server -p 8935`), then
  `node ../tests/wonderland-engine-adversarial.js`.

## Checkpoint 4: why one placeholder house instead of five real ones

The roadmap's line 4 is "remaining five houses." Before writing any code,
searched the entire AOW suite for "Kit," "Principle-tagged ability," or
"Transformation form" content — the same search discipline Checkpoint 3
used to find the real heir-import pipeline. Found nothing. Unlike
Checkpoint 3, where a real, analogous system already existed to adapt,
house Kit/Principle/Transformation content doesn't exist anywhere yet —
`aow_heir_record.html`'s "house" is a player-customized political family
(free-text name/colors/sigil/ideals), a different concept entirely from
this checkpoint's class-like Kit/Transformation system. This is genuinely
new creative design, explicitly reserved as Kazabon's own material by the
checkpoint doc's own §0/§1 and by the (still-unreceived)
`WONDERLAND_RPG_FLAGSHIP_DESIGN.md` companion doc it names.

Asked how to proceed rather than fabricate six houses' worth of invented
lore. Chose: one house, explicitly and unmissably labeled `[PLACEHOLDER]`
throughout (see `placeholderHouse.js`), built to prove the mechanical
pipeline actually works — `HouseRecord`/`TransformationForm` schema
shapes, `GRANT_TECHNIQUE`, `ACTIVATE_TRANSFORMATION`, and both a house
ability and a Transformation-granted technique resolving through real
combat exchanges — without claiming to be real design. When real house
content exists, `placeholderHouse.js` gets deleted, not extended; the
schema/engine additions it exercises stay.

### Resolution (2026-07-23): genre confirmed, heir vs. house are two different layers

Kazabon resolved the open question from the Checkpoint 4 handover doc
(`WONDERLAND_RPG_CHECKPOINT4_HANDOVER.md` §4, `Studio-Internal-` repo),
via `WONDERLAND_RPG_CHECKPOINT4_RESOLUTION.md`:

- **Genre confirmed**: Final Fantasy Tactics lineage, not a visual novel.
  Retroactive confirmation, not a new decision — the action-slot economy,
  Presence/Read/Commit/Hold, weapon specialties, and technique triggers
  already built in Checkpoints 1-2 are exactly the right emphasis for
  that genre. Nothing built needs reconsidering because of this.
- **Option A vs. Option B (the prior handover's framing) weren't actually
  competing** — they're two different schema objects FFT's own structure
  makes obvious in hindsight:
  - The player's own **heir** (`aow_heir_record.html` →
    `importHeirRecord.js`) is the protagonist layer — personal identity,
    the character the player plays. Ramza, not a house.
  - The **six royal houses** are the political/faction layer —
    pre-authored, enumerable, with their own history and agenda. Nobody
    plays *as* a house; a heir has standing with or against them — which
    is exactly what `politicalNodes` (a per-actor score against a shared
    faction node) already models correctly, built back in Checkpoint 3.
- **What this means for the code**: Checkpoint 3's heir-import work is
  correct and complete as-is. Checkpoint 4's placeholder house,
  `GRANT_TECHNIQUE`, and `ACTIVATE_TRANSFORMATION` all still stand as the
  right mechanism — they were never wrong, just waiting on this
  clarification to know what content they'd eventually hold. What was
  genuinely blocked — real authored content for the six houses — is
  **still genuinely blocked**, now for a clear, narrow reason: that's
  Kazabon's own faction design work, still to be written, not an
  engineering task and not something to fabricate as a substitute.
- **Checkpoint 4 closes as**: mechanism proven, real content pending
  author input. A legitimate, documented stopping point, not an
  incomplete checkpoint. `placeholderHouse.js` stays exactly as labeled.

**Suggestion, not a build** (per the resolution doc's own §4 — surfaced
here, not acted on unprompted): if authoring six houses' worth of
political content takes a while, it may be worth building a minimal,
clearly-temporary faction *stub* — mirroring `placeholderHouse.js`'s own
pattern — so combat/reputation systems downstream of `politicalNodes`
(the narrative hook layer, anything in a future checkpoint that assumes
real factions exist) can keep being tested without waiting on final
content. **Partially overtaken by events**: ripple propagation itself
(below) turned out not to need this stub — `aow_gm_screen.html` has real,
already-authored `WORLD_NPCS` content (nine named individuals, not the
six houses) that tests it against real data instead. The suggestion still
stands for anything that specifically needs the *six houses* to exist as
political nodes, which `worldNpcs.js` does not provide.

## Ripple propagation (post-Checkpoint-4): real relationship-graph content, ported faithfully

Checkpoint 3 surveyed `aow_gm_screen.html`'s ripple propagation
(`propagateWeight`/`getNodeConductors`/`rankConductors`) and deliberately
left it out, "needs the relationship graph not yet imported." That graph
turned out to be real, already-authored content — `WORLD_NPCS`, nine named
individuals (King Hector, his Royal Chamberlain, six faction heads, and
the Outskirts Broker) with real relationship edges to each other — not
gated on the six-houses design question at all, so this was ungated work,
done directly:

- **`worldNpcs.js`**: the real `WORLD_NPCS` content (key/name/weight/
  conductors), not the much larger narrative `NPC_DOSSIER` object the same
  file also holds (per-NPC voice/tell/private-wants-and-fears/secrets,
  gated behind real leverage tiers) — that's presentation/GM-table content
  for a future UI layer, not pure engine data.
- **`engine.js`**: `getNodeConductors`, `rankConductors`, `propagateWeight`,
  faithfully ported — depth caps at 2 hops, weight halves each hop and
  stops below 0.3, top-3-ranked conductors per call (ranked by current
  accumWeight + the acting character's existing standing), a small
  0.25-fractional "sentiment ripple" only on the first hop across an
  `allied` edge, and the same escalating-threshold trigger/reset logic
  recursively. Wired into `LOG_POLITICAL_ACTION` — every political action
  now ripples, not just moving its direct target.
- **NOT ported**: the narrative ripple-hook text (`generateRippleHook` and
  friends) — GM-facing prose, not engine logic, same standing rule as
  everywhere else in this file.

**Verification**: every number in the test suite is hand-traced against
the real algorithm using real data — the actual `kingHector` ↔
`royalChamberlain` mutual-`allied` edge, and the full real 9-node graph
driven through the Outskirts Broker's real `'all'`-conductors shorthand,
including a genuine double-trigger-in-one-action case the hand-trace
predicted before the code confirmed it (a node revisited through a
different path within the same cascade, faithful to the real algorithm's
lack of a cycle guard — bounded only by the depth/weight cutoffs, not
by a visited-set). Synthetic fixtures (a 4-node chain, a 5-conductor
fan-out) isolate the depth/weight cutoffs and the top-3 ranking from the
trigger-and-reset behavior, which is tested separately.

One real bug surfaced and got fixed during this pass, in the test file,
not the engine: two hand-computed expected values (`6*0.6`, chained
further through `*0.5`) used exact `===` against a value that isn't
exactly representable in IEEE-754 (`6*0.6 === 3.5999999999999996`, not
`3.6`). Fixed with an `approxEqual` epsilon helper, used consistently
across the ripple math's float comparisons from then on.

122/122 checks pass as of this commit.

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

## Checkpoint 3: what "one house vertical-sliced" actually became

The checkpoint doc's roadmap line 3 says "one house fully vertical-sliced
and playtested" — real house identity, narrative, content. That's
explicitly Kazabon's own creative material (the checkpoint doc's own §1
non-negotiables + this repo's studio conventions), not something for this
engine to invent. So instead of fabricating a placeholder house, this
checkpoint dug through the rest of the already-shipped AOW suite —
`aow_heir_record.html`, `aow_play_sheet.html`, `aow_gm_screen.html`,
`aow_spell_creator.html` — the way Checkpoint 2 dug through the SRD, and
found that a *real* vertical slice already exists as a proven, shipped
pipeline: session-zero heir creation → JSON export → import into a
world-state/play tool. Checkpoint 3 built Wonderland's own version of the
import side of that pipeline, against real formulas and a real export
shape, rather than inventing house content or waiting on it idle.

**Built**:
- `importHeirRecord.js` — maps a real heir export into `CharacterRecord`
  + `HouseRecord`, mirroring `aow_play_sheet.html`'s exact
  required-vs-default discipline (name + revealed school required,
  everything else defaulted) and its exact bug fixes (the retired
  "(adjacent)"-tagged spell skip, signature techniques importing with no
  fabricated structured trigger).
- The real Weight Engine (`computePoliticalActionEffect`,
  `effectiveThreshold`, `LOG_POLITICAL_ACTION`) — ported from
  `aow_gm_screen.html`'s `applyWeightAndGenerateHooks()`, the actual
  ancestor of the "weight/trigger model" language in the Checkpoint 1
  handover doc. A *different* weight/trigger system from this file's
  combat-initiative one — political leverage, not combat slots.
- `APPLY_CAPSTONE` / `RESET_CAPSTONE_USAGE` — real Capstone content from
  `aow_heir_record.html`'s `CAPSTONES` table (8 aspects, each a leverage
  bonus/penalty, once per session).
- **A correction, not just an addition**: Checkpoint 2's
  `factionStanding`/`MODIFY_LEVERAGE` modeled leverage as one number per
  faction, party-wide. That's wrong — `aow_srd.html` ch3-leverage says
  "one score per significant NPC and faction... for the heir," and
  `aow_play_sheet.html`'s real `state.leverage` is scoped to one heir.
  Fixed by replacing `factionStanding` with `politicalNodes` (one shared
  node per NPC/faction, holding a per-actor score map) and bumping
  `SCHEMA_VERSION` 1 → 2, so `persistence.js`'s version check catches an
  old save rather than silently misreading it.

**Surveyed, deliberately not ported**: ripple propagation to "conductor"
NPCs (needs the `WORLD_NPCS` relationship graph, a real but separate
content-import task) and all narrative hook-text generation (GM-facing
prose, not pure engine logic — `resolve()` stays data in, data out).
`aow_spell_creator.html`'s full spell-syntax grammar and `SPELL_LIBRARY`
content exist and are real, but weren't imported wholesale this round —
`createSpell` carries `brief`/`syntax`/`flags` so a future pass can.

## Confidence labeling

- **Verified**: the Checkpoint 1 weight/trigger model and wound/stamina
  rules; the Checkpoint 2 additions, each against a hand-derived case
  tracing a specific quoted SRD line; the Checkpoint 3 Weight Engine port,
  hand-verified against the real formula's own arithmetic (tier*1.5,
  fractional carry at exactly 1.0, threshold escalation floored at 2); the
  heir-import adapter, run against a fixture built from the real export
  shape read directly out of `aow_heir_record.html`'s own code, not
  invented; the Checkpoint 4 house-content pipeline (`GRANT_TECHNIQUE`,
  `ACTIVATE_TRANSFORMATION`, unlock-condition gating), driven end-to-end
  including both a granted house ability AND a Transformation-granted
  technique resolving through real combat exchanges — not just checked
  for presence in an array; ripple propagation, hand-traced against the
  real algorithm using the real `WORLD_NPCS` relationship graph, including
  a genuine double-trigger cascade the hand-trace predicted before the
  code confirmed it.
- **Not yet verified**: Torso's "stamina degrades faster" is implemented as
  a documented fact only — this engine does not auto-accelerate stamina
  stage transitions from a Torso wound (that timing is explicitly
  GM-adjudicated per the SRD, not a fixed formula), so there's nothing here
  for a worked case to check numerically. Multi-exchange sequences beyond
  two exchanges, sustained T5/T6 casting across exchanges (marked
  `sustained: true` but not driven through a real multi-exchange sequence
  yet), and ANY interaction between the Weight Engine's political-node
  state (including ripple propagation) and combat's initiative/technique
  logic in the same encounter, remain unexercised. The narrative
  ripple-hook text generation is deliberately not ported (presentation
  layer, see above) — nothing here produces GM-facing prose from a ripple,
  only the underlying numbers. The import adapter has been run
  against one hand-built fixture, not a real file the user actually
  exports from `aow_heir_record.html` — that's the next real test, not
  this one. The Checkpoint 4 house content is placeholder by design —
  `evaluateUnlockCondition`'s two condition types (`staminaAtLeast`,
  `woundCountAtLeast`) are the only ones any content exercises; real house
  design may need more, which means more engine work, not just more data.
- **Explicitly out of scope here**: real house content (six houses' worth
  of Kit/Principle-tagged-ability/Transformation-form design — Kazabon's
  own creative material, not fabricated here), narrative branches, the
  Essence-ledger-style World State *behavior* beyond Leverage/ripple (the
  schema exists for entities/choices; no behavior drives them yet), Caravan
  and Exploration encounter types entirely, `aow_gm_screen.html`'s larger
  `NPC_DOSSIER` content (real, but presentation/GM-table layer, not pure
  engine data), and all narrative hook-text generation.
