'use strict';
/*
 * WONDERLAND: FIRST PRINCIPLES — Checkpoint 1 schema module.
 *
 * Every shape below is plain, JSON-serializable data — no functions, no
 * closures, no circular references, per the architectural non-negotiables
 * in WONDERLAND_RPG_HANDOVER_CHECKPOINT1.md §0. The factory functions in
 * this file exist only to produce that plain data with a documented
 * default shape; nothing they return ever holds a reference back into
 * this module.
 *
 * Field choices here are sourced from aow_srd.html's combat chapter
 * (Presence/Read-Commit-Hold, the three action slots, six wound states,
 * four stamina stages, six weapon specialties) — see engine.js for the
 * mechanical rules built on top of this shape. House/faction fields are
 * sized per the checkpoint doc's "support a 7th house later without
 * restructuring" requirement: houseId is a free-form string key, never
 * an enum or fixed-length array.
 *
 * Confidence: this shape is unverified until real save/load round-trips
 * through persistence.js and real encounters run through engine.js
 * without needing new top-level fields. Treat it as a first pass.
 */

(function (root) {

// Bumped 1 -> 2 in Checkpoint 3: SaveState's factionStanding (one
// party-wide number per house) was replaced by politicalNodes (one
// shared node per NPC/faction, holding a per-actor score map) — see
// createPoliticalNode's own comment for why. persistence.js's
// getSaveState() schemaVersion check means an old v1 save fails loudly
// on load rather than silently misreading factionStanding as something
// it no longer is.
// Bumped 2 -> 3 in Checkpoint 8: CharacterRecord gained position/
// distance/rallyUsed/removedFromEncounter fields and SaveState gained
// currency — an old v2 save is missing all of these, so it must fail
// loudly on load rather than silently treating a defeated/removed
// character as freshly active.
const SCHEMA_VERSION = 3;

const STAMINA_STAGES = Object.freeze(['fresh', 'winded', 'strained', 'spent']);
const WOUND_LOCATIONS = Object.freeze(['weaponArm', 'shieldArm', 'legs', 'torso', 'head', 'presence']);
const WEAPON_SPECIALTIES = Object.freeze(['sword', 'spear', 'wand', 'staff', 'dagger', 'projectile']);

// WONDERLAND_RPG_FLAGSHIP_DESIGN.md §5, supplied after Checkpoint 4/5's
// house content was already built: the game's actual ability taxonomy is
// exactly these four "First Principles" — "every ability must be
// classifiable under exactly one Principle. If it can't be argued as one
// of the four, it doesn't belong in this game." This is a hard rule, not
// flavor, so it's a real enum like WEAPON_SPECIALTIES above, not a
// free-form string — see createTechnique's `firstPrinciple` field.
const FIRST_PRINCIPLES = Object.freeze(['distinction', 'relation', 'transformation', 'persistence']);
const ACTION_SLOTS = Object.freeze(['move', 'act', 'react']);

/*
 * Checkpoint 8: range/special data ported from Monolith_Universe.pdf's
 * weapon table (verified against the source PDF directly, not a
 * secondhand paraphrase), keyed by the exact same WEAPON_SPECIALTIES
 * enum above — Monolith's six weapons are literally the same six.
 *
 * Only `range`/`rangeMin`/`rangeMax`/`lineOnly`/critical-condition fields
 * and Sword's `distanceBonusAsMain` are wired into real engine logic
 * (see engine.js's cellDistance/isInWeaponRange and the Sword distance
 * bonus in DECLARE_MOVEMENT). `strikeBonusAsMain` (Dagger) and
 * `abilityRangeBonusAsMain` (Wand) are recorded here as real ported data
 * but deliberately NOT wired into any numeric calculation — Wonderland
 * has no numeric "strike count" or per-technique "ability range" field
 * to attach them to (combat resolves via wound/stamina application, not
 * a hit-count stat; techniques have no range field). Inventing one just
 * to make these two bonuses "do something" would be exactly the kind of
 * plausible-looking fabrication this project's own guardrails reject —
 * they're kept as authored content, ready to wire in if either concept
 * ever gets added for its own real reason.
 */
const WEAPON_STATS = Object.freeze({
  sword: Object.freeze({ range: 1, distanceBonusAsMain: 1 }),
  // "range 2 cells in a line" — lineOnly gates the RANGE itself here,
  // not just a crit bonus (contrast with projectile below).
  spear: Object.freeze({ range: 2, lineOnly: true, critOnSecondCellIfFirstHit: true }),
  dagger: Object.freeze({ range: 1, strikeBonusAsMain: 1 }),
  staff: Object.freeze({ rangeMin: 1, rangeMax: 2 }),
  wand: Object.freeze({ range: 2, abilityRangeBonusAsMain: 1 }),
  // "range 3 to 4, critically strikes on 4th cell IF in a straight
  // line" — the source qualifies only the crit bonus with a line
  // requirement, not the basic range (unlike Spear above), so no
  // top-level lineOnly here; critOnFourthCellIfStraightLine alone
  // carries that condition.
  projectile: Object.freeze({ rangeMin: 3, rangeMax: 4, critOnFourthCellIfStraightLine: true }),
});

/*
 * Checkpoint 8: the four equipment slot pairs, ported from
 * Monolith_Universe.pdf's Equipment section (verified against the source
 * PDF directly). Each slot grants exactly one of two bonuses (the
 * caller/content picks which at equip time — this table just documents
 * what's available, engine.js doesn't enforce "only one").
 *
 * Helmet/Necklace's real resolution: the PDF's own options ("+1 hand
 * size" / "+1 basic ability count") have no Wonderland equivalent —
 * confirmed, not assumed: there's no hand/deck (explicitly excluded per
 * WONDERLAND_RPG_CHECKPOINT8_HANDOVER.md §0/§6) and no cap on how many
 * techniques a character can know (`CharacterRecord.techniques` is
 * already unbounded, so "+1" to an uncapped number is meaningless).
 * Rather than invent a new capacity-limiter system just to give this one
 * slot numeric teeth — a bigger, unrequested redesign of the
 * declaration/loadout model — both bonuses are kept as real, ported,
 * descriptive data, the same treatment as Dagger's strikeBonusAsMain and
 * Wand's abilityRangeBonusAsMain above: authored content, not wired into
 * engine arithmetic, ready to attach real behavior to if Wonderland ever
 * grows a loadout-capacity concept of its own.
 */
const EQUIPMENT_SLOTS = Object.freeze({
  helmetNecklace: Object.freeze({ bonusA: 'handSize', bonusB: 'basicAbilityCount' }),
  ringGlove: Object.freeze({ bonusA: 'basicAbilityRange', bonusB: 'strike' }),
  bootsSandals: Object.freeze({ bonusA: 'specialMovement', bonusB: 'distance' }),
  cloakPouch: Object.freeze({ bonusA: 'talismanAreaOfEffect', bonusB: 'pack' }),
});

/**
 * A single playable character or NPC's combat-relevant + narrative record.
 * @param {Object} [overrides]
 */
function createCharacterRecord(overrides = {}) {
  return Object.assign(
    {
      id: null, // e.g. "char_mira" — required, set by caller before persistence
      name: '',
      houseId: null, // e.g. "house_axiom" — free-form, not an enum
      combatYears: 0, // session-zero Combat aspect years; 0 = untrained Presence per SRD ch4-presence
      weaponSpecialty: null, // one of WEAPON_SPECIALTIES or null
      techniques: [], // array of Technique (see createTechnique)
      spells: [], // array of Spell (see createSpell)
      startingEquipment: [], // array of equipment id strings
      // Combat-state fields below are transient per-encounter in spirit, but
      // stored on the character record so a save mid-encounter is possible.
      stamina: 'fresh', // one of STAMINA_STAGES
      wounds: [], // array of WOUND_LOCATIONS, may contain duplicates (SRD: wounds accumulate)
      // Willstrain has no numeric formula in aow_srd.html (ch2-willstrain
      // tracks it narratively, via GM-read signals) — but aow_play_sheet.html
      // shows the real, shipped tool DOES reduce it to an explicit 0-4
      // number in practice (strain:0, "0-4"), set by the player/GM at the
      // table exactly like stamina/wounds are here, not auto-computed by
      // any formula. Matches this schema's existing pattern for stamina.
      willstrainStage: 0, // 0=none, 1=Thinning, 2=Fraying, 3=Slippage, 4=Severance (aow_srd.html ch2-willstrain)
      // Checkpoint 8 grid fields, ported from Monolith_Universe.pdf.
      // position is null outside a grid-enabled encounter (nothing to be
      // positioned relative to) — same null-until-relevant pattern as
      // activeTransformationId below, not a real {0,0} placement.
      position: null, // { x, y } | null
      // Monolith's own starting value (Character creation stat #9,
      // "Distance 4") — no prior Wonderland field for this existed to
      // collide with (checked: neither "distance" nor "movement" appear
      // anywhere in this file before Checkpoint 8).
      distance: 4,
      // Checkpoint 8 rally/defeat state — see engine.js's combatStatus().
      // Deliberately NOT a numeric Life pool (Wonderland has never
      // modeled damage as arithmetic; stamina/wounds above are the real
      // "how hurt is this character" state). "Defeated"/"rallied" are
      // derived from the *existing* isCombatOver threshold (stamina
      // spent or 3+ wounds) instead — these two fields only capture what
      // genuinely can't be derived: whether a one-time rally already
      // happened, and whether a hit while critically injured has already
      // removed this character from the encounter for good.
      rallyUsed: false,
      removedFromEncounter: false,
      // Only present if the heir committed five session-zero years to one
      // aspect (aow_heir_record.html CAPSTONES) — null otherwise.
      // { aspect, aspectName, title, description, usage, leverageBonus:
      // {key,amount}, leveragePenalty: [{key,amount}], usedThisSession }
      capstone: null,
      // Checkpoint 4: which house TransformationForm (if any) this
      // character has activated. Set by ACTIVATE_TRANSFORMATION; a
      // character can only have one active at a time (engine.js throws on
      // re-activating while one's already set) — this schema doesn't
      // define how or when it clears, since no house content specifies
      // that duration yet.
      activeTransformationId: null,
      // Player-tracked resources — real fields from aow_play_sheet.html's
      // state, generalized from that tool's single-heir assumption to
      // per-character here since a Wonderland SaveState holds a full party.
      contacts: [], // array of { name, faction, want, know, available, type, activated }
      loot: [],
      documents: [],
      debts: [],
    },
    overrides
  );
}

/**
 * A technique's trigger/cost/effect, structured so engine.js can evaluate
 * the trigger without parsing prose. See aow_srd.html ch4-techniques.
 * @param {Object} [overrides]
 */
function createTechnique(overrides = {}) {
  return Object.assign(
    {
      id: null, // e.g. "tech_riposte"
      name: '',
      // trigger: null means always available (a basic strike has no trigger).
      // { type: 'opponentCommitsSlots', slots: ['act','react'] } means the
      // technique only fires if the opponent's declaration this exchange
      // committed all listed slots — see engine.js evaluateTrigger().
      trigger: null,
      slotCost: ['act'], // subset of ACTION_SLOTS
      effect: '', // human-readable effect text; engine.js does not parse this
      resolvesRegardlessOfInitiative: false, // Riposte-style reactive techniques
      // aow_play_sheet.html's real signature-technique default is
      // 'Defined by fighting style — confirm with GM' — i.e. a freshly
      // imported technique from a real heir record has NO machine-readable
      // trigger yet, only free text a GM still has to formalize at the
      // table. rawTriggerText carries that prose without engine.js ever
      // trying to parse it into a structured `trigger` above — see
      // importHeirRecord.js, which deliberately leaves `trigger: null`
      // on import rather than guessing a predicate from this string.
      rawTriggerText: '',
      dependency: 'none', // free-text stamina/presence dependency note from the real tool; not enforced here
      // Set only on techniques that originate from a house ability
      // (Checkpoint 4) — each house's own one-phrase philosophy (e.g.
      // "The Undercurrent"). Purely descriptive/narrative; engine.js
      // never reads or validates this. Renamed from `principle` once
      // WONDERLAND_RPG_FLAGSHIP_DESIGN.md revealed that name collided
      // with a real, differently-scoped concept — see `firstPrinciple`
      // just below.
      houseTheme: null,
      // The design doc's actual ability taxonomy (§5): must be one of
      // FIRST_PRINCIPLES exactly — "distinction", "relation",
      // "transformation", or "persistence". Distinct from `houseTheme`
      // above on purpose: a house's motto and this classification are two
      // different axes (a "Persistence"-classified ability can belong to
      // any house's own theme). engine.js's GRANT_TECHNIQUE/
      // ACTIVATE_TRANSFORMATION validate this against FIRST_PRINCIPLES
      // before accepting a technique — see engine.js's own comment.
      firstPrinciple: null,
    },
    overrides
  );
}

/**
 * A castable spell — just enough shape for Checkpoint 2's magic-in-combat
 * slot economy (aow_srd.html ch2-tiers, ch2-combat). Willstrain cost is
 * deliberately NOT a number here: the SRD gives willstrain as a
 * descriptive weight per tier (Negligible..Extreme) and tracks its actual
 * stage narratively at the table, not through a formula — see engine.js
 * castingSlotCost() header for what this schema does and doesn't encode.
 * @param {Object} [overrides]
 */
function createSpell(overrides = {}) {
  return Object.assign(
    {
      id: null, // e.g. "spell_kindle"
      name: '',
      school: null, // one of the Six Schools; free-form string, not enforced here
      tier: 1, // 1-6, aow_srd.html ch2-tiers
      // aow_spell_creator.html / aow_play_sheet.html's real SPELL_LIBRARY
      // carries these three too — brief is player-facing prose, syntax is
      // the formal spell-syntax string (ch2-flags "Spell Syntax"), flags
      // is the moral-flag count. None of these are parsed or enforced by
      // engine.js — they're carried through so an imported spell keeps its
      // real content instead of being flattened to just school+tier.
      brief: '',
      syntax: '',
      flags: 0,
    },
    overrides
  );
}

/**
 * House data schema — kit description, Principle-tagged abilities,
 * Transformation forms, starting equipment, faction ID. Sized to support
 * a 7th house: nothing here assumes exactly six houses exist.
 * @param {Object} [overrides]
 */
function createHouseRecord(overrides = {}) {
  return Object.assign(
    {
      id: null, // e.g. "house_axiom"
      name: '',
      kitDescription: '',
      factionId: null, // links to World State faction entity, e.g. "faction:house_axiom"
      // Abilities tagged with the house's own theme (`houseTheme`) and, per
      // WONDERLAND_RPG_FLAGSHIP_DESIGN.md §5, the game's actual four-Principle
      // taxonomy (`firstPrinciple`) — see createTechnique's own comments on
      // both fields. As of Checkpoint 4 these are full Technique objects
      // rather than the lighter {id,name,principle,description} shape
      // Checkpoint 1 sketched — needed to actually make an ability usable
      // through DECLARE_ACTION/RESOLVE_EXCHANGE, not just descriptive.
      abilities: [], // array of Technique (see createTechnique)
      transformationForms: [], // array of TransformationForm, see createTransformationForm
      startingEquipment: [], // array of equipment id strings
      // Narrative/political identity fields — real shape, matching
      // aow_heir_record.html's own `house` export object field-for-field
      // (seat/colorPrimary/colorSecondary/sigilDesc/district/orientation/
      // ideal1/ideal2/shadow/shadowDetail/founding/foundingDetail/wound/
      // woundDetail/resources/heirStanding). Added once real house content
      // (wonderland/houses.js) needed somewhere to actually live — a
      // player-built heir's own house identity lives in their own JSON
      // export and doesn't need to be duplicated here; this is for the
      // canonical six-house registry, one HouseRecord per real house.
      seat: '', // home city
      colorPrimary: '',
      colorSecondary: '',
      sigilDesc: '',
      district: null, // one of the SRD's six house-types: military, mercantile, religious, scholarly, agricultural, magical
      orientation: { acquire: '', hold: '', use: '' },
      ideal1: '',
      ideal2: '',
      shadow: '',
      shadowDetail: '',
      founding: '',
      foundingDetail: '',
      wound: '',
      woundDetail: '',
      resources: [], // array of resource-name strings
      heirStanding: '',
    },
    overrides
  );
}

/**
 * A house's Transformation form (checkpoint doc §1) — an empowered state
 * unlocked once a structured condition is met, granting one bonus
 * technique. unlockCondition mirrors a Technique trigger's shape
 * discipline: structured and engine-evaluable, not prose a GM has to
 * interpret. engine.js's evaluateUnlockCondition() is the only place that
 * reads it. grantedTechnique is embedded directly (not an id-reference
 * into the house's own abilities list) so engine.js never needs access to
 * a house registry to activate one — it only ever sees the single action
 * payload.
 * @param {Object} [overrides]
 */
function createTransformationForm(overrides = {}) {
  return Object.assign(
    {
      id: null, // e.g. "form_awakened"
      name: '',
      description: '',
      // { type: 'staminaAtLeast', stage: 'winded' } or
      // { type: 'woundCountAtLeast', count: 2 } — see engine.js
      // evaluateUnlockCondition() for the full set this engine supports.
      unlockCondition: null,
      grantedTechnique: null, // a Technique object (see createTechnique), or null
    },
    overrides
  );
}

/**
 * Per-combatant transient state inside an EncounterState — separate from
 * CharacterRecord because an encounter tracks a declaration that resets
 * every exchange, while CharacterRecord's stamina/wounds persist into the
 * save. engine.js is the only module that reads/writes `declaration`.
 * @param {string} characterId
 */
function createCombatantState(characterId) {
  if (!characterId) throw new Error('createCombatantState: characterId is required');
  return {
    characterId,
    declaration: null, // Declaration | null — see createDeclaration
    // Staff's Barrier Generation is "once per encounter" (aow_srd.html
    // ch4-weapons), not once per exchange — so it lives here, on the
    // encounter-scoped combatant state, not on the persisted CharacterRecord.
    staffBarrierUsed: false,
    // Checkpoint 8: how much of CharacterRecord.distance this combatant
    // has already spent via DECLARE_MOVEMENT this exchange. Resets to 0
    // in RESOLVE_EXCHANGE alongside declaration clearing — same per-
    // exchange lifecycle, since Monolith's "declared unlimited times
    // while distance remains" is scoped to a turn, and an exchange is
    // this engine's turn-equivalent unit.
    distanceSpentThisExchange: 0,
  };
}

/**
 * One combatant's simultaneous declaration for the current exchange.
 * @param {Object} [overrides]
 */
function createDeclaration(overrides = {}) {
  return Object.assign(
    {
      slots: [], // subset of ACTION_SLOTS actually committed this exchange
      techniqueId: null, // Technique.id being attempted, or null for a basic strike
    },
    overrides
  );
}

/**
 * A combat encounter's full state. Lives at SaveState.currentEncounter
 * while a fight is in progress; null otherwise.
 * @param {Object} params
 * @param {string[]} params.characterIds
 * @param {'insideBarrier'|'outskirts'|'outsideCity'} params.location
 * @param {Object|null} [params.board] - BoardState, see createBoardState; null for a non-grid encounter
 */
function createEncounterState({ characterIds, location, board = null }) {
  if (!Array.isArray(characterIds) || characterIds.length < 2) {
    throw new Error('createEncounterState: characterIds must list at least two combatants');
  }
  return {
    location,
    exchangeNumber: 0,
    combatants: characterIds.map(createCombatantState),
    log: [], // array of ExchangeLogEntry, appended by engine.js RESOLVE_EXCHANGE
    board, // BoardState | null — Checkpoint 8, see createBoardState
  };
}

/**
 * Checkpoint 8 grid: a 9x9-by-default board (Monolith_Universe.pdf's own
 * "All combat takes place on a 9 x 9 cell board"), cells either
 * traversable or blocked. blockedCells is a sparse list of {x,y} pairs
 * rather than a dense width*height grid — matches this codebase's
 * existing preference for sparse/id-keyed data (politicalNodes,
 * worldFlags) over dense arrays, and a 9x9 board is rarely more than a
 * handful of obstacle cells in practice.
 * @param {Object} [overrides]
 */
function createBoardState(overrides = {}) {
  return Object.assign(
    {
      width: 9,
      height: 9,
      blockedCells: [], // array of { x, y }, 0-indexed
    },
    overrides
  );
}

/**
 * A political "node" — one NPC or faction, tracked once (shared across
 * the whole party), holding a separate leverage score PER ACTOR inside
 * it. Ported from aow_gm_screen.html's real, shipped `state.nodes[key]`
 * shape. This replaced SaveState's Checkpoint-2 `factionStanding` field
 * (schemaVersion 1), which modeled leverage as one party-wide number per
 * faction — wrong per aow_srd.html ch3-leverage's own text ("one score
 * per significant NPC and faction... for the heir") and per
 * aow_play_sheet.html's real per-heir `state.leverage`. Corrected here
 * rather than compounded, since nothing outside this repo depended on
 * the old shape yet.
 * @param {Object} [overrides]
 */
function createPoliticalNode(overrides = {}) {
  return Object.assign(
    {
      id: null, // e.g. "cityWatch" or "kingHector" — matches aow_play_sheet.html's real leverage keys
      name: '',
      // aow_gm_screen.html: baseThreshold defaults 5, or 8/3 for
      // "high"/"special" weight NPCs — that high/special classification
      // is content this schema doesn't carry, so callers set it directly.
      baseThreshold: 5,
      accumWeight: 0,
      fireCount: 0,
      scores: {}, // characterId -> integer -5..5, this actor's leverage with this node
      fractional: {}, // characterId -> internal fractional carry, engine.js-only concern
      // The relationship graph edge — ported from aow_gm_screen.html's
      // real WORLD_NPCS content (see wonderland/worldNpcs.js). Either an
      // array of { key: <other nodeId>, type: 'allied'|'neutral'|'rival' }
      // or the string 'all' (one real NPC — the Outskirts Broker — has
      // this shorthand meaning "every other node is a conductor").
      // engine.js's getNodeConductors() is the only place that reads this.
      conductors: [],
    },
    overrides
  );
}

/**
 * Save-state schema: party composition, world flags, the political weight
 * web. This is the top-level object persistence.js reads/writes as a
 * whole under a "save:<slot>" key — see persistence.js.
 * @param {Object} [overrides]
 */
function createSaveState(overrides = {}) {
  return Object.assign(
    {
      schemaVersion: SCHEMA_VERSION,
      savedAt: null, // ISO timestamp string, set at write time
      party: [], // array of character IDs (characters themselves live in `characters`)
      characters: {}, // characterId -> CharacterRecord
      worldFlags: {}, // flagId -> boolean | string | number
      politicalNodes: {}, // nodeId -> PoliticalNode, see createPoliticalNode above
      currentEncounter: null, // EncounterState | null, see createEncounterState above
      // Checkpoint 8: Stars/Fragments/Favor, ported from
      // Monolith_Universe.pdf's Currency section. Party-wide progression
      // counters, same reasoning as this project's existing "one
      // persistent state object covering party, world flags, and faction
      // standing together" — deliberately NOT merged into or renamed as
      // Essence: Essence isn't part of this codebase at all (Checkpoint
      // 6 found it lives in a different repo, Iridescent Cosmology's own
      // lifetime-currency system), so conflating a real ledger this
      // project doesn't have with three new counters it does would be
      // inventing a relationship nobody's confirmed. Stones (Monolith's
      // fourth currency) is deliberately absent — its own source text
      // ties it to real-money purchase ("obtained through various means
      // and by using real currency"), which is a monetization decision
      // out of scope here, not something to port silently.
      currency: { stars: 0, fragments: 0, favor: 0 },
    },
    overrides
  );
}

/**
 * World State store entry — the ID-keyed cross-game continuity records
 * (entity:npc_042, choice:house_alliance) the checkpoint doc calls for,
 * same key-design discipline as the studio's existing Essence ledger.
 * This factory produces the *value* half of a key/value pair; the key
 * itself is constructed by persistence.js (namespace:id).
 * @param {'entity'|'choice'} kind
 * @param {Object} [overrides]
 */
function createWorldStateRecord(kind, overrides = {}) {
  if (kind !== 'entity' && kind !== 'choice') {
    throw new Error(`createWorldStateRecord: unknown kind "${kind}" (expected "entity" or "choice")`);
  }
  return Object.assign(
    {
      kind,
      id: null, // the part after the namespace prefix, e.g. "npc_042"
      data: {}, // kind-specific plain data payload
      updatedAt: null, // ISO timestamp string, set at write time
    },
    overrides
  );
}

const api = {
  SCHEMA_VERSION,
  STAMINA_STAGES,
  WOUND_LOCATIONS,
  WEAPON_SPECIALTIES,
  FIRST_PRINCIPLES,
  ACTION_SLOTS,
  WEAPON_STATS,
  EQUIPMENT_SLOTS,
  createCharacterRecord,
  createTechnique,
  createSpell,
  createHouseRecord,
  createTransformationForm,
  createCombatantState,
  createDeclaration,
  createEncounterState,
  createBoardState,
  createPoliticalNode,
  createSaveState,
  createWorldStateRecord,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (root) {
  root.WonderlandSchema = api;
}

})(typeof window !== 'undefined' ? window : undefined);
