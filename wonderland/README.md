# Wonderland: First Principles — Checkpoints 1-8

Schema + engine skeleton (Checkpoint 1), extended with more of the SRD's
deterministic combat/politics rules (Checkpoint 2), then extended again by
digging through the *rest* of the AOW suite — not just the SRD — for real,
already-shipped mechanics and a real heir-import boundary (Checkpoint 3,
mapped loosely onto "one house vertical-sliced" from
`WONDERLAND_RPG_HANDOVER_CHECKPOINT1.md`'s roadmap, `Studio-Internal-`
repo). Checkpoint 4 ("remaining five houses") first hit a hard wall — no
house Kit/Principle/Transformation content existed anywhere yet, real or
otherwise — so it proved the pipeline with one explicitly-labeled
placeholder house rather than fabricate six houses' worth of invented lore.
That placeholder has since been **retired**: Kazabon supplied five real
player-created heir records, each with its own real house, and authorized
completing the roster with one more — see "The six-house registry" below
for the real thing that replaced it. Not a game yet — no UI, no narrative
prose. This is the pure resolution engine, the data shapes it operates on,
and the adapters that import real player-created content, verified against
real rules, real shipped tools, and now real house content — not read and
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
- **`importHeirRecord.js`** — Checkpoint 3: adapts a real
  `aow_heir_record.html` JSON export into `schema.js` shapes. See its own
  header for why its required-vs-default field discipline deliberately
  mirrors `aow_play_sheet.html`'s proven `importFromS0()` rather than
  reinventing that split.
- **`worldNpcs.js`** — REAL content (not placeholder), the mechanical
  fields of `aow_gm_screen.html`'s own `WORLD_NPCS` array: nine named,
  already-authored individuals and their relationship-graph edges to each
  other. Used to seed `politicalNodes` for ripple propagation — see below.
- **`houses.js`** — REAL content: the canonical six-house registry. Five
  houses transcribed from real player-created `aow_heir_record.html`
  exports, one authored to complete the roster — see "The six-house
  registry" below. `placeholderHouse.js` (Checkpoint 4's proof-of-pipeline
  file) has been deleted now that this replaced it, per its own stated
  "delete, don't extend" instruction.
- **`worldStateBridge.js`** — Checkpoint 6: pure functions converting a
  live `SaveState`'s `worldFlags`/`politicalNodes` into `entity:`/`choice:`
  `WorldStateRecord`s (and back) — the actual cross-session/cross-game
  continuity mechanism Checkpoint 1 defined a schema for but never built.
  See "World State bridge" below.
- **`harness.html`** — not a game screen; loads all seven modules above via
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
political nodes, which `worldNpcs.js` does not provide until the section
below.

## The six-house registry (Checkpoint 5): real content, not placeholder

Kazabon supplied five real player-created `aow_heir_record.html` exports —
Miran of House Aethra, Ye K'ali of House Ye, Griffith Lightwell of House
Lightwell, Alaric Aurelius Lionheart II of House Lionheart, Emily der Dachs
of House Badgerhold — and authorized fabricating a sixth to complete the
roster. `placeholderHouse.js` is deleted; `houses.js` is what replaced it.

**A real structural finding surfaced immediately**: `aow_srd.html`
ch1-districts is explicit that there are exactly six noble houses, one per
district-type (military, mercantile, religious, scholarly, agricultural,
magical) — not an open-ended or player-invented count. The five real
houses didn't map cleanly onto that: Aethra and Lionheart both picked the
Military district (independent choices, made before this six-house
structure existed), and Trade and Scholarly were both completely
unrepresented. Kazabon authorized adjusting one house rather than forcing
a redundant roster: **House Lionheart is classified here as the Trade
house**, not Military — its own real data already leans that way
(`orientation.hold: "Wealth"`, resource `"Hidden wealth"`, conquest that
functions as profitable expansion) even though its player picked Military
on their own character sheet. That player's original file is untouched;
this only changes how Wonderland's world-building classifies the house's
political type. **House Corvane** (fabricated, Scholarly) fills the one
remaining gap.

**What got authored, for all six houses** (none of this existed anywhere —
Checkpoint 4's research confirmed Kit/Principle/Transformation content is
genuinely new, not extractable from any AOW suite file): one Principle
(a one-phrase philosophy) per house, a Kit description, one
Principle-tagged ability, and one Transformation form with a real unlock
condition — every one of them grounded in that specific house's own
established identity (its real orientation, ideals, founding, shadow,
wound), not a generic reskin repeated six times. See `houses.js`'s own
extensive header and inline comments for the reasoning behind each
house's specific design choices.

**A second real finding, from actually running the content**: `aow_gm_screen.html`'s
`WORLD_NPCS` (keyed by person-role: `archivistGeneral`, `watchCommander`)
and `aow_heir_record.html`'s `startingLeverage` (keyed by institution:
`scholarsGuild`, `cityWatch`) are two different naming conventions for
what's conceptually the same six factions — a real inconsistency in the
AOW suite itself, not something introduced here. House Ye's and House
Corvane's Transformation forms both originally referenced `scholarsGuild`
(matching the real heir data) before this was caught by simply running the
code against real `politicalNodes` content and hitting an "unknown
political node" error — fixed by pointing both at `archivistGeneral`, the
node that actually exists in the ripple graph.

**A third real finding**: running the five real heir files through
`importHeirRecord.js` for the first time (previously only tested against a
hand-built fixture) surfaced a real integration gap — Emily's own file
names her house `"Badgerhold"` (no "House" prefix), which
`importHeirRecord.js`'s naive slugification turns into `badgerhold`, not
matching this registry's `house_badgerhold`. The other four heirs all used
"House X" naming, which happens to slug-match. This is a real,
undocumented-until-now mismatch between free-text import and the
canonical registry — not fixed here (matching by id isn't something either
file currently attempts), flagged as a known gap for whoever wires the two
together.

Every one of the five real heir files was actually run through
`importHeirRecord.js` for this checkpoint — all five import cleanly,
including three real "(adjacent)"-tagged spell skips (the same retired
auto-grant-rule bug `aow_play_sheet.html` fixed once already).

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

122/122 checks pass as of this commit (135/135 as of the latest commit,
including the six-house registry and World State bridge work that follow
chronologically after it in the test file, even though they're documented
earlier in this README).

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
  invented; the house-content pipeline (`GRANT_TECHNIQUE`,
  `ACTIVATE_TRANSFORMATION`, all three unlock-condition types —
  `staminaAtLeast`, `woundCountAtLeast`, `leverageAtLeast`), driven
  end-to-end against the real six-house registry, including both a
  granted house ability AND a Transformation-granted technique resolving
  through real combat exchanges — not just checked for presence in an
  array; ripple propagation, hand-traced against the real algorithm using
  the real `WORLD_NPCS` relationship graph, including a genuine
  double-trigger cascade the hand-trace predicted before the code
  confirmed it; all five real heir files actually run through
  `importHeirRecord.js` for the first time, not just a hand-built fixture;
  the World State bridge, verified as genuine cross-session continuity
  through real IndexedDB (a second, independent `SaveState` with a
  different character activates a flag-gated Transformation purely from
  hydrated prior-session state), with a sanity check proving a
  non-hydrated session stays correctly blocked.
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
  only the underlying numbers. The `importHeirRecord.js` ↔ `houses.js`
  house-id mismatch (real finding, see the six-house registry section) is
  flagged, not fixed. Only 4 of the 6 houses' Transformation forms were
  driven through a full end-to-end combat-resolution test
  (Aethra fully, Ye and Lightwell through activation only); Lionheart,
  Badgerhold, and Corvane's content is verified structurally (registry
  shape, principle tags) but not individually combat-tested the same way
  Aethra was.
- **Explicitly out of scope here**: narrative branches, Caravan and
  Exploration encounter types entirely, `aow_gm_screen.html`'s larger
  `NPC_DOSSIER` content (real, but presentation/GM-table layer, not pure
  engine data), and all narrative hook-text generation.

## Checkpoint 6: the World State bridge, and why "Essence ledger" was a dead end

The roadmap's line 6 is "World State / cross-game layer wired in." Before
writing code, went looking for what Checkpoint 1's non-negotiables meant
by "the Essence ledger" (§0: "every read/write to save state, World State,
or the Essence ledger goes through a single module"). It isn't a Wonderland
concept at all — it's Iridescent Cosmology's own lifetime-currency system,
in a completely different repo (`Shin-Maho-Arcade/iridescentcosmology.html`,
`Persist.data.lifetimeEssence`). The phrase was only ever an analogy for
persistence *discipline* (single access layer, defensive defaults across
schema versions), which `persistence.js` already satisfies — not something
to integrate with literally.

Unlike Checkpoints 2-5, there was also no real World State content to dig
up anywhere in the AOW suite — `SaveState.worldFlags` and
`WorldStateRecord` have existed since Checkpoint 1, completely unused.
This checkpoint is genuine engineering, not research-and-port:

- **`SET_WORLD_FLAG`** and a fourth unlock-condition type,
  **`worldFlagEquals`** — gives `worldFlags` its first real behavior,
  content-agnostic like every other action in this file.
- **`worldStateBridge.js`**: `exportWorldState`/`importWorldState`, pure
  functions converting a live `SaveState`'s `worldFlags`/`politicalNodes`
  into `entity:`/`choice:` keyed `WorldStateRecord`s and back. The key
  mapping isn't arbitrary — it matches Checkpoint 1's own two example
  keys directly: a world flag IS a recorded choice
  (`choice:<flagId>`), a political node IS an entity in the world
  (`entity:<nodeId>`).
- **Verified as actual cross-session continuity, not just data
  reshaping**: the test writes real records through `persistence.js`
  into real IndexedDB in one "session," then reads them back in a
  second, completely fresh `SaveState` with a different character in
  it, and shows a `worldFlagEquals`-gated Transformation activating
  purely because the world remembered — with a sanity check proving a
  session that never hydrated stays correctly blocked, so the pass
  isn't just a trivially-true condition.

**What this still doesn't do**: decide what any real flagId or
entity/choice content should actually contain narratively — same
discipline as everywhere else, that's downstream content-authoring work,
not engine work. `worldStateBridge.js` also doesn't decide *when*
export/import should run in a real game loop (session start/end,
autosave, etc.) — that's game-loop policy for whenever a presentation
layer exists.

135/135 checks pass.

## Checkpoint 7: worldbreaker pass, reinterpreted — there's no UI yet

The roadmap's line 7 is "Worldbreaker pass + pre-ship checklist," which the
handover doc frames in terms of a player mashing buttons in a real game
screen. That screen doesn't exist yet — Checkpoints 1-6 built the engine,
not a presentation layer. Reinterpreted for what actually exists: an
adversarial pass against the engine's real API surface (`resolve()`,
`evaluateUnlockCondition()`, `importHeirRecord()`, `persistence.js`'s
key-validated IndexedDB layer) — the same worldbreaker spirit, aimed at
the boundary a future UI will actually call through, since a bug there is
a bug no amount of good UI code downstream can paper over.

This pass found and fixed four real, previously-shipped bugs, none of
them hypothetical:

- **Prototype pollution via `characterId`/`nodeId`/`flagId` of
  `"__proto__"`.** `findCharacter`/`findPoliticalNode` used a truthy
  check (`if (!character) throw`) to detect an unknown id.
  `state.characters['__proto__']` resolves through the JS prototype
  chain to the real, shared `Object.prototype` — which is truthy — so
  the check never fired, and the next field write (e.g. `SET_STAMINA`'s
  `.stamina = 'winded'`) mutated `Object.prototype` for the entire
  process. Confirmed with a real repro (`({}).stamina` came back
  `"winded"` after the attack) before fixing. Fixed by gating both
  functions on `Object.prototype.hasOwnProperty.call(obj, key)` instead
  of truthiness. A related but lower-severity variant lived in
  `worldStateBridge.js`'s `importWorldState`, which builds fresh
  `worldFlags`/`politicalNodes` objects keyed by an external
  `record.id` — assigning an *object* value (not engine.js's
  primitives-only `applySetWorldFlag`) to a `"__proto__"` key really
  does replace that object's own prototype. Fixed by rejecting
  `"__proto__"` outright at the one place new entries get created
  (`MODIFY_LEVERAGE`'s/`LOG_POLITICAL_ACTION`'s `actorId`,
  `SET_WORLD_FLAG`'s `flagId`, `importWorldState`'s `record.id`).
  Deliberately does **not** reject `"constructor"`/`"prototype"` too —
  verified those have no special setter behavior on a plain object
  (`obj.constructor = x` just creates an ordinary own property), so a
  real id that happens to be one of those words isn't a threat and
  rejecting it would just be a false positive.
- **A malformed `unlockCondition.count`/`.score` silently misbehaved
  instead of erroring.** `woundCountAtLeast`'s `character.wounds.length
  >= condition.count` treated a negative `count` (e.g. `-5`) as
  satisfied by *any* character, silently auto-unlocking a Transformation
  meant to require real cost; a `NaN` count made it silently
  never-satisfiable. Fixed with an explicit finite/non-negative check
  (and the equivalent finite check on `leverageAtLeast`'s `score`).
- **`GRANT_TECHNIQUE`/`ACTIVATE_TRANSFORMATION` accepted non-serializable
  payloads.** `schema.js`'s `createTechnique`/`createTransformationForm`
  are a bare `Object.assign(defaults, overrides)` — no filtering, no
  validation. A technique payload containing a function-valued field, or
  a field holding a circular self-reference, was accepted without
  complaint and landed byte-for-byte inside the returned "state" object,
  silently breaking this codebase's own §0 rule that state is always
  plain, serializable data — until some unrelated later consumer (a save
  export, an IndexedDB write) would choke on it far from the actual
  mistake. Fixed with `assertPlainSerializable()`, a recursive walk that
  throws on any function/symbol value or circular reference, run against
  both payloads before they're accepted. Re-verified all six real
  houses' abilities/Transformations in `houses.js` still pass this check
  — the guard rejects hostile shapes, not real content.
- **`importHeirRecord.js`'s `startingSpells` crashed on a wrong-typed
  value instead of erroring clearly.** `!awakening?.startingSpells?.length`
  used a bare-string's own truthy `.length` as its guard, so a malformed
  export with `startingSpells: "Fireball"` (string, not array) slipped
  past it and crashed on `.forEach` with a raw, unhelpful native
  `TypeError`; a non-string element in an otherwise-valid array crashed
  the same way on `.includes`. Fixed with explicit `Array.isArray()` and
  per-element `typeof === 'string'` checks that throw this module's own
  namespaced error instead.

**What was checked and found to already be safe, or a non-issue** (verified
empirically, not assumed):
- `MODIFY_LEVERAGE`'s `delta`, `LOG_POLITICAL_ACTION`'s `tier` — already
  rejected `NaN`/`Infinity`/out-of-range values with a clear error before
  this pass.
- `applySetWorldFlag`'s `next.worldFlags[flagId] = value` — safe by
  construction: assigning a non-object value to a `"__proto__"` key is a
  documented, verified no-op (the accessor setter on `Object.prototype`
  requires an `Object` or `null`, silently ignoring anything else), and
  the function's own type check already restricts `value` to
  boolean/string/number. Hardened anyway with the same explicit
  `"__proto__"`-rejection used elsewhere, so the protection doesn't
  depend on a future edit loosening that value-type check without
  noticing the implication.
- `persistence.js`'s `KEY_PATTERN` — already correctly anchored
  (`^...$`) and charset-restricted (rejects newlines, extra colons,
  path-traversal characters, null bytes, empty ids, wrong casing). The
  one real gap was an unbounded id length (a 100,000-character key
  passed validation); fixed with a `{1,200}` bound.
  `"entity:__proto__"`-shaped keys are syntactically valid and stay
  that way on purpose: IndexedDB stores keys as opaque strings, not JS
  object properties, so there's no prototype chain for that key to
  exploit there.
- `importHeirRecord.js` and hostile `"__proto__"`-laced JSON — confirmed
  both `JSON.parse` and object-spread (`{ ...raw.capstone }`, used for
  the capstone field) produce an inert *own* property literally named
  `"__proto__"`, never the real prototype-changing accessor. Object
  literal shorthand (`{ __proto__: x }`, written directly in source) is
  the only syntax that actually triggers it, and this file never does
  that with external data.
- Circular references and huge arrays in general — `structuredClone`
  (used by `engine.js`'s `deepClone`) natively supports cyclic
  structures without throwing, and a large-but-reasonable array (tested
  to 100k elements) clones and processes without incident. Not a gap;
  just confirmed rather than assumed.

25 new checks added (135 → 160 passing).

## Pre-ship checklist (for whoever builds the UI/content layer next)

**Stable action-type list** — the only vocabulary `resolve(state, action)`
understands: `INIT_ENCOUNTER`, `DECLARE_ACTION`, `RESOLVE_EXCHANGE`,
`APPLY_WOUND`, `SET_STAMINA`, `MODIFY_LEVERAGE`, `LOG_POLITICAL_ACTION`,
`APPLY_CAPSTONE`, `RESET_CAPSTONE_USAGE`, `GRANT_TECHNIQUE`,
`ACTIVATE_TRANSFORMATION`, `SET_WORLD_FLAG`. Every one throws a
namespaced `wonderland/engine: ...` error on a malformed payload rather
than silently defaulting — treat any caught exception as a real bug to
fix in the caller, never something to swallow.

**Invariants that must never be violated:**
- `resolve()` never mutates its `state` argument — always returns a new
  object (`deepClone` under the hood). Don't rely on `state === newState`
  ever holding; don't assume the old reference is safe to keep using
  after calling `resolve()` on it.
- All state is plain, JSON-serializable data — no functions, no
  `Symbol`s, no circular references, no class instances. `engine.js`
  enforces this on the payloads it directly accepts (`technique`,
  `transformationForm`), but a UI layer building other content-shaped
  objects (houses, world NPCs) should hold itself to the same rule,
  since nothing downstream re-checks it.
- Every id (`characterId`, `nodeId`, `flagId`, `actorId`) must be a real
  key already present in `state` before being referenced by an action
  that expects it to exist — `findCharacter`/`findPoliticalNode` throw a
  clear error otherwise, by design; don't pre-seed a fake entry just to
  dodge the error.
- `SaveState.schemaVersion` (currently `2`) must match
  `persistence.js`'s `getSaveState(slot, expectedSchemaVersion)` call —
  a version bump means every existing save is intentionally
  incompatible, not something to migrate silently.
- `persistence.js` is the only module allowed to touch IndexedDB — keep
  routing all reads/writes through it, even from new UI code.

**Known gaps, left for the content/UI layer on purpose (not oversights):**
- No numeric Read-accuracy/initiative formula beyond Dagger's
  unconditional override — the SRD leaves that to GM judgment, and this
  engine refuses to invent one.
- Wound severity and stamina-stage transitions are never auto-computed
  from hit counts — always an explicit `APPLY_WOUND`/`SET_STAMINA`
  action, by the same "don't invent what the SRD leaves to the GM" rule.
- `worldStateBridge.js` doesn't decide *when* export/import should run
  in a real game loop (session start/end, autosave) — that's game-loop
  policy.
- The Badgerhold house-id mismatch between `importHeirRecord.js`'s
  `slugify()` output (`badgerhold`) and `houses.js`'s canonical id
  (`house_badgerhold`) is real and still unresolved — matching by id
  across those two files isn't something either currently attempts.
- No narrative branch content (roadmap line 5) exists yet — `houses.js`
  carries mechanical identity (abilities, Transformations, ideals,
  shadow) transcribed from real player records, not written scenes.

**How to run the test suite:** `npx http-server -p 8935` from the repo
root, then in a second terminal
`NODE_PATH=/opt/node22/lib/node_modules node tests/wonderland-engine-adversarial.js`
(the `NODE_PATH` points at wherever Playwright is actually installed in
your environment — adjust if it differs). Expect `166 passed, 0 failed`.
The suite drives a real Chromium instance against `harness.html` and real
IndexedDB — nothing in it is mocked.

## Post-Checkpoint-7: First Principles reconciliation

`WONDERLAND_RPG_FLAGSHIP_DESIGN.md` — one of the two companion docs
Checkpoint 6/7 both noted as "referenced but never supplied" — was
finally provided after Checkpoint 7 shipped. It names four canonical
**First Principles** (§5): *Distinction, Relation, Transformation,
Persistence* — the game's actual ability taxonomy, with a hard rule:
"every ability must be classifiable under exactly one Principle. If it
can't be argued as one of the four, it doesn't belong in this game."

Checking it against what already existed found a real divergence, not a
naming coincidence: Checkpoint 4/5's six-house registry tagged every
ability with a `principle` field holding a free-form, house-specific
*motto* instead (`"The Undercurrent"`, `"Veiled Radiance"`, etc.) —
`schema.js`'s own comment even called it "free-form." None of the twelve
abilities/granted-techniques across the six houses were classified under
the design doc's actual four values, because that doc didn't exist yet
when this content was built.

**Reconciled, not silently overwritten** — the house mottos are real,
authored content, not a mistake to discard:
- `Technique.principle` → renamed **`houseTheme`** (unchanged values,
  purely narrative, engine.js never reads it).
- New **`firstPrinciple`** field added alongside it, validated against
  `schema.js`'s new `FIRST_PRINCIPLES` constant
  (`['distinction', 'relation', 'transformation', 'persistence']`).
  `engine.js`'s `GRANT_TECHNIQUE`/`ACTIVATE_TRANSFORMATION` reject an
  invalid value outright (`assertValidFirstPrinciple`) — but don't
  *require* the field, since plenty of earlier scaffolding/test
  techniques predate this rule and were never meant to be "real content"
  in the design doc's sense.
- All twelve real abilities/granted-techniques across the six houses were
  reclassified by what each one actually mechanically does (its
  slotCost/trigger/effect shape), not by its houseTheme motto — see the
  inline reasoning next to each in `houses.js`. Distribution: 4
  Distinction, 4 Relation, 4 Persistence, **0 Transformation** —
  deliberately: the design doc frames Transformation as "a stance/form
  shift that changes what a character's existing kit does," which is
  already exactly what `ACTIVATE_TRANSFORMATION`/`TransformationForm`
  structurally embodies. The mechanic itself carries that Principle; the
  individual abilities it grants are classified by their own payload
  effect instead of automatically inheriting the label.
- Also confirmed, while reading the doc against what's built: its Section
  4 assumption ("house names/identities... already exist [in the SRD],
  locking it against the source document is a Phase 1 task") turned out
  to be wrong — the SRD never actually names the six houses, which is
  exactly the wall Checkpoint 4 hit before Kazabon authorized using real
  player heir records instead. Not a new problem, just confirmation the
  design doc's own assumption didn't hold and the pivot that already
  happened was the right one. Section 8's Essence-ledger cross-game
  integration is unaffected — still explicitly Phase 4 in the doc's own
  sequencing, still correctly unbuilt.

6 new checks added (160 → 166 passing).

## Tech stack doc, checked against what's built — one intentional divergence, kept as-is

`WONDERLAND_RPG_TECH_STACK.md`, the second companion doc flagged as
missing since Checkpoint 1, was also supplied. Checked component by
component against what actually exists:

**Confirmed matches:** vanilla JS with no build step; the diceless
engine's "verify against hand-worked SRD cases before any UI exists"
discipline (§1.4), which is exactly Checkpoints 1-7's own practice;
`importHeirRecord.js`'s fail-loudly-on-malformed-data rule (§1.6); none
of the doc's explicitly-excluded components (AudioWorklet, WebGL2 shader
VFX, OffscreenCanvas/Worker, IK/Verlet, server/WASM SQL) show up anywhere
in this codebase.

**Expected gaps, not contradictions** — nothing built yet because no UI
work has started: DOM/CSS screens, Canvas 2D map/portrait/FX rendering,
WebAudio, keyboard/touch input, and the full inventory/equipment system
(`schema.js` only has `startingEquipment: []`, a bare array of id
strings — no `Item` shape, no equipment mechanics). All of this is
explicit Phase 2/3 work in the flagship design doc's own sequencing, so
being unbuilt right now is on schedule, not a miss.

**One real divergence, deliberately kept rather than "fixed":** §1.5
specifies a per-entity relational-shaped IndexedDB key scheme —
`characters:{id}`, `inventory:{characterId}`, `items:{itemId}`,
`faction:{characterId}:{houseId}` — one row per character, one row per
character-house leverage pair. What's actually built (`persistence.js`'s
`entity:`/`choice:`/`save:` namespaces, inherited from Checkpoint 1's own
earlier doc) stores the entire `SaveState` — every character, every
political node, every world flag — as **one blob per save slot**, and
models leverage as `politicalNodes`: one shared node per NPC/faction
holding an embedded map of every character's score against it, not a row
per character-house pair.

This tech-stack doc was written before the ripple-propagation algorithm
(`getNodeConductors`/`rankConductors`/`propagateWeight`, ported from
`aow_gm_screen.html`) existed, and that algorithm is the reason the
divergence is being kept rather than reconciled the way the First
Principles one was. Ripple propagation needs to treat each political
node as a first-class graph vertex — traverse its conductors, rank its
neighbors — which only works cleanly if a node's full state (including
every character's score against it) lives in one record. A
`faction:{characterId}:{houseId}`-per-pair scheme would mean
reassembling the whole relationship graph from scattered rows on every
political action, actively working against an already-built, already
hand-verified system (see "Ripple propagation" above) for a benefit
that's theoretical rather than tied to any concrete need this project has
actually hit. The general `entity:`/`choice:`/`save:` namespace is also
more extensible as new content types get added later: a future item is
just another `entity:` record, no new key prefix or `persistence.js`
change required — where the tech-stack doc's scheme would need a new
namespace (`items:`) per content category.

The whole-blob-per-slot design does have one real cost, named here
rather than glossed over: even a one-character stamina change rewrites
the entire save. Not a concern at this project's actual scale (a
single-player party's characters/nodes/flags is small by IndexedDB
standards), and the one class of data that genuinely needs a lifecycle
independent of any single save slot — state meant to outlive one session
or one game — already has a purpose-built escape hatch: `worldStateBridge.js`'s
`entity:`/`choice:` records exist specifically to pull that content out
of the save blob. Revisit only if a concrete access pattern actually
needs per-character partial writes, not preemptively.

**Also flagged, not yet acted on:** §1.9 describes the "real" test
discipline as driving the diceless engine "through the actual UI" — the
same UI-only philosophy as this studio's own `worldbreaker` testing
standard (drive the real UI, never inject data via `page.evaluate()`).
The current 166-check suite does the opposite by necessity: zero
`page.click`/`fill`, all engine calls made directly via `page.evaluate()`
into `window.Wonderland`, because there's no UI yet to click through.
That was the correct call given the project's current state, but it's
worth naming plainly: this test suite does not "graduate" into the
doc's intended UI-driven one once a real screen exists — a genuine
UI-driven pass will need to be built from scratch at that point, not
just extended.

## Checkpoint 8: five systems ported from Monolith_Universe.pdf, three real design resolutions

`WONDERLAND_RPG_CHECKPOINT8_HANDOVER.md` scoped five systems from a
separate, older tabletop document in the same cosmology
(`Monolith_Universe.pdf`, Alpha 1 ruleset, by IX) — not Age of Wonder's
SRD, a related but distinct source: grid movement, weapon range/crit
data, a rally/defeat state, currency, and equipment. Explicitly rejected:
the card-deck/hand-draw resolution and initiative-as-ability-currency
economy (both conflict with this project's diceless commitment) and
Classes/Positions (needs reconciliation against the six-house Kit system
first, not decided yet).

**Verified against the source PDF directly, not the handover doc's own
paraphrase** (the same discipline as every prior checkpoint): the grid,
weapon, and equipment data transcribe correctly. Two things in the
handover's paraphrase didn't match the source and were corrected before
building against them:
- The source's defeat threshold is "life reaches **1**," not "life
  reaches its floor (0)" as the handover doc phrased it — moot here
  since no numeric Life pool was ported at all (see below), but worth
  recording since it shaped how the no-HP-pool redesign was checked
  against the source's actual intent.
- The source ties Stones (currency) to real-money purchase ("obtained
  through various means and **by using real currency**") — absent from
  the handover doc's Currency section entirely. Currency was implemented
  with Stones excluded outright, not silently ported.

### Three real design resolutions (Kazabon's explicit direction, not assumed)

**1. No numeric Life pool — rally/defeat reuses the existing "way to end
fights" instead.** Wonderland has never modeled damage as arithmetic; no
HP field has ever existed anywhere in this schema. Monolith's Life is a
literal 100-point pool with 1:1 damage — porting it as-written would mean
bolting on a second, fully parallel damage-tracking system next to
stamina stages and wound locations. Instead, `engine.js`'s new
`combatStatus(character)` reuses `isCombatOver()`'s own, already-shipped
threshold (stamina Spent or 3+ wounds) as "critically injured,"
evaluated per-character rather than location-gated. Four states:
`active` / `defeated` / `rallied` / `removed` — `active`↔`defeated` is
purely derived (never stored, can't drift out of sync with the
stamina/wounds it's based on, same discipline as `isCombatOver` itself);
`rallyUsed` and `removedFromEncounter` are the only genuinely new stored
facts, since "was this character rallied" and "were they removed" aren't
derivable from anything else.
  - `defeated`: no `act` slot (no abilities/strikes), movement capped at
    1 cell. The next wound/stamina hit removes them outright.
  - `RALLY_CHARACTER` (new action): once only, moves `defeated` →
    `rallied`. A rallied character regains full ability/strike access
    per the source, even though they're still at the critical threshold
    underneath — a deliberate, documented exception to the pre-existing
    SRD "Spent stamina blocks techniques" rule, not an oversight.
  - The next hit while `rallied` — or while `defeated` and never rallied
    — removes the character permanently (`removedFromEncounter: true`).
    Wonderland has no granular wound-severity number to distinguish
    "further" damage from "fatal" damage the way the source's numeric
    Life did, so both of the source's cases collapse into one rule here:
    the next hit while critically injured is the one that ends it.
  - `removed`: cannot act, move, be rallied, or take further
    wounds/stamina changes — attempting any of these throws, rather than
    silently no-op'ing a character who's already out.

**2. Equipment's Helmet/Necklace bonuses kept as real, ported,
non-mechanical data.** The source's two options for this slot ("+1 hand
size" / "+1 basic ability count") have no Wonderland target — confirmed,
not assumed: there's no hand/deck (the card mechanic is explicitly
excluded this checkpoint) and no cap on how many techniques a character
can know (`CharacterRecord.techniques` is already unbounded, so "+1" to
an uncapped number means nothing). Rather than invent a new
capacity-limiter system just to give this one slot numeric teeth — a
real, unrequested redesign of the declaration/loadout model — both
options are kept in `schema.js`'s `EQUIPMENT_SLOTS` as real ported
content, not silently dropped or invented away. This is the same
treatment already given to two of the six weapons' secondary bonuses
(Dagger's `strikeBonusAsMain`, Wand's `abilityRangeBonusAsMain`) for the
identical reason — Wonderland has no numeric "strike count" or
per-technique "range" field either. Consistent, not special-cased.

**3. Currency ports Stars/Fragments/Favor; Stones is excluded outright.**
`SaveState.currency` is a new `{ stars, fragments, favor }` counter set,
modified via the new `MODIFY_CURRENCY` action (floors at 0, fails loudly
on an attempted overspend rather than silently clamping it). Deliberately
kept separate from Essence, per the handover doc's own caution — Essence
isn't part of this codebase at all (Checkpoint 6 found it lives in a
different repo, Iridescent Cosmology's own lifetime-currency system), so
conflating a real system this project doesn't have with three new
counters it does would be inventing an unconfirmed relationship. Stones
has no key in the currency object at all and no case in
`MODIFY_CURRENCY`'s validation — attempting to modify it throws the same
"unknown key" error as any other invalid string. Excluded because its
own source text ties it to real-money purchase, a monetization decision
explicitly out of scope here.

### What's real vs. what's a named, deliberate gap

**Grid (real, tested):** 9x9-by-default `BoardState` (sparse
`blockedCells` list, matching this codebase's existing preference for
sparse over dense data), `CharacterRecord.position`/`distance`, new
`DECLARE_MOVEMENT` action. `CombatantState.distanceSpentThisExchange`
tracks the per-exchange movement budget, resetting alongside declaration
clearing in `RESOLVE_EXCHANGE` — Monolith's "declared unlimited times
while distance remains" is scoped to a turn in the source, and an
exchange is this engine's turn-equivalent unit, not a literal unlimited
free-roam phase. Only the destination cell's traversability is validated
(in bounds, not blocked) — path-through-cells is a named gap, not a
silent assumption: the source gives no pathfinding algorithm, and
inventing one (line-of-sight, diagonal-cutting rules) would be exactly
the kind of fabricated specificity this project's guardrails reject.
Chebyshev (8-directional) distance is a documented assumption for the
same reason — the source never specifies an adjacency metric.

**Weapons (real, tested):** `schema.js`'s `WEAPON_STATS`, keyed by the
same six `WEAPON_SPECIALTIES` Monolith itself uses. `isInWeaponRange()`
is wired into `DECLARE_ACTION` for real — an `act` slot is rejected if no
positioned opponent is within weapon range, but only in a grid-enabled
encounter where both combatants have actually been placed; a non-grid
encounter (all of Checkpoints 1-7's own tests) skips this silently,
matching `board`'s own optional nature. "In a line" (Spear's range,
Projectile's crit) is read as orthogonal (same row or column) — the
source never defines the term precisely enough to resolve whether
diagonals count, so orthogonal is the documented, more restrictive
reading, used consistently in both places. Sword's `distanceBonusAsMain`
is really wired into `DECLARE_MOVEMENT`'s effective distance;
`weaponSpecialty` itself stands in for "equipped as main" since
Wonderland has no separate main/secondary weapon-slot system (the
handover doc's own note that this would need one is real, and building
it was out of this checkpoint's actual scope).
`isWeaponCritCondition()` is a real, pure, tested function for both
weapons' crit geometry — but Spear's condition ("critically strikes on
the second cell if the target on the first cell was hit") needs "was the
first cell actually hit," a fact about a prior strike nothing in this
engine tracks. Wiring that into `RESOLVE_EXCHANGE`'s actual resolution
would mean inventing new combat-history state well beyond "attach data
to existing handling" — named here as a real, open gap, not resolved by
assumption.

**Rally/defeat (real, tested):** see the design resolution above.

**Currency (real, tested):** see the design resolution above.

**Equipment (data only, per the handover doc's own scope — §5 frames it
as "pure stat-modifier data," and §8's verification standard names no
equipment tests):** `schema.js`'s `EQUIPMENT_SLOTS`, all four slot pairs
verified against the PDF. No equipment-to-character stat resolution
exists — `CharacterRecord.startingEquipment` is still a bare array of id
strings, same as before this checkpoint. A full equipped-item-to-bonus
system is genuinely Phase 3 "full inventory/equipment system" work per
the flagship design doc's own phasing, not this checkpoint's ask.

**Not ported, per the handover doc's own explicit exclusions:** the
card-deck/hand-draw mechanic, initiative-as-ability-currency, Classes
(Knight/Rook/Bishop), Positions (Vanguard/Saboteur/Infiltrator),
Talismans/Catalysts as distinct item categories.

39 new checks added (166 → 205 passing).
