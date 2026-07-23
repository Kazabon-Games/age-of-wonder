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

const SCHEMA_VERSION = 1;

const STAMINA_STAGES = Object.freeze(['fresh', 'winded', 'strained', 'spent']);
const WOUND_LOCATIONS = Object.freeze(['weaponArm', 'shieldArm', 'legs', 'torso', 'head', 'presence']);
const WEAPON_SPECIALTIES = Object.freeze(['sword', 'spear', 'wand', 'staff', 'dagger', 'projectile']);
const ACTION_SLOTS = Object.freeze(['move', 'act', 'react']);

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
      startingEquipment: [], // array of equipment id strings
      // Combat-state fields below are transient per-encounter in spirit, but
      // stored on the character record so a save mid-encounter is possible.
      stamina: 'fresh', // one of STAMINA_STAGES
      wounds: [], // array of WOUND_LOCATIONS, may contain duplicates (SRD: wounds accumulate)
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
      id: null, // e.g. "spell_ember_dart"
      name: '',
      school: null, // one of the Six Schools; free-form string, not enforced here
      tier: 1, // 1-6, aow_srd.html ch2-tiers
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
      // Abilities tagged with which in-world Principle they express — the
      // checkpoint doc calls these "Principle-tagged abilities"; the actual
      // Principle vocabulary is design content, not defined by this schema.
      abilities: [], // array of { id, name, principle, description }
      transformationForms: [], // array of { id, name, description, unlockCondition }
      startingEquipment: [], // array of equipment id strings
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
 */
function createEncounterState({ characterIds, location }) {
  if (!Array.isArray(characterIds) || characterIds.length < 2) {
    throw new Error('createEncounterState: characterIds must list at least two combatants');
  }
  return {
    location,
    exchangeNumber: 0,
    combatants: characterIds.map(createCombatantState),
    log: [], // array of ExchangeLogEntry, appended by engine.js RESOLVE_EXCHANGE
  };
}

/**
 * Save-state schema: party composition, world flags, faction standing.
 * This is the top-level object persistence.js reads/writes as a whole
 * under a "save:<slot>" key — see persistence.js.
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
      factionStanding: {}, // houseId -> integer standing score, one entry per house
      currentEncounter: null, // EncounterState | null, see createEncounterState above
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
  ACTION_SLOTS,
  createCharacterRecord,
  createTechnique,
  createSpell,
  createHouseRecord,
  createCombatantState,
  createDeclaration,
  createEncounterState,
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
