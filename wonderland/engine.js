'use strict';
/*
 * WONDERLAND: FIRST PRINCIPLES — Checkpoint 1 diceless resolution engine.
 *
 * resolve(currentState, action) -> newState. Pure: no IndexedDB, no DOM,
 * no browser globals, no mutation of the input state (see §0 of
 * WONDERLAND_RPG_HANDOVER_CHECKPOINT1.md). Everything this module needs
 * from schema.js is passed in or required, never reached for globally in
 * a way that would break in a non-browser test runner.
 *
 * Scope, honestly stated: aow_srd.html's combat system is *not* fully
 * deterministic by design — "The GM adjudicates Read accuracy" is the
 * SRD's own language for initiative outside the one unconditional case
 * (Dagger's Initiative Advantage). This skeleton does not fabricate a
 * numeric Read-accuracy formula the SRD never gives. What it *does*
 * encode deterministically, because the SRD states these as hard rules
 * rather than GM judgment calls:
 *   - the three-slot action economy and wound/stamina slot-cost surcharges
 *   - Dagger's unconditional initiative override (and its one documented
 *     exception, Projectile Engagement Denial)
 *   - technique trigger conditions (a technique fires only if the
 *     opponent's declaration this exchange matches its trigger predicate)
 *   - reactive techniques (resolvesRegardlessOfInitiative) still resolving
 *     in the same exchange even when their declarant lacked initiative
 * Wound severity and stamina-stage timing are NOT auto-computed from hit
 * counts anywhere below — the SRD leaves those to GM adjudication, so they
 * enter this engine only as explicit APPLY_WOUND / SET_STAMINA actions,
 * never as an invented formula.
 *
 * Verified against aow_srd.html's ch4-techniques "A Worked Exchange"
 * (Mira/Sword/Riposte vs. Davan/Dagger) — see
 * tests/wonderland-engine-adversarial.js for the actual run.
 */

(function (root) {

const Schema =
  typeof module !== 'undefined' && module.exports
    ? require('./schema.js')
    : root.WonderlandSchema;

// Destructured under engine-local names — schema.js, when loaded as a
// plain <script> (no module system), declares its own top-level
// STAMINA_STAGES/ACTION_SLOTS in the same global scope, so binding the
// same identifiers here would collide with it at parse time.
const {
  STAMINA_STAGES: ENGINE_STAMINA_STAGES,
  ACTION_SLOTS: ENGINE_ACTION_SLOTS,
  createEncounterState: schemaCreateEncounterState,
  createDeclaration: schemaCreateDeclaration,
} = Schema;

function deepClone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function findCombatant(encounter, characterId) {
  const combatant = encounter.combatants.find((c) => c.characterId === characterId);
  if (!combatant) {
    throw new Error(`wonderland/engine: unknown characterId "${characterId}" in this encounter`);
  }
  return combatant;
}

function findCharacter(state, characterId) {
  const character = state.characters[characterId];
  if (!character) {
    throw new Error(`wonderland/engine: unknown characterId "${characterId}" in state.characters`);
  }
  return character;
}

function staminaIndex(stage) {
  const i = ENGINE_STAMINA_STAGES.indexOf(stage);
  if (i === -1) throw new Error(`wonderland/engine: unknown stamina stage "${stage}"`);
  return i;
}

function hasWound(character, location) {
  return character.wounds.includes(location);
}

/**
 * Read/Commit/Hold degradation — aow_srd.html ch4-presence + the wound
 * table (Head degrades Read regardless of stamina; Weapon Arm degrades
 * Commit; Shield Arm/Legs degrade Hold; Strained stamina degrades Read;
 * Winded-or-worse degrades Hold; Spent degrades Commit).
 */
function presenceStage(character, component) {
  const idx = staminaIndex(character.stamina);
  if (component === 'read') {
    if (hasWound(character, 'head')) return 'degraded';
    if (idx >= staminaIndex('strained')) return 'degraded';
    return 'full';
  }
  if (component === 'commit') {
    if (hasWound(character, 'weaponArm')) return 'degraded';
    if (character.stamina === 'spent') return 'degraded';
    return 'full';
  }
  if (component === 'hold') {
    if (hasWound(character, 'shieldArm') || hasWound(character, 'legs')) return 'degraded';
    if (idx >= staminaIndex('winded')) return 'degraded';
    return 'full';
  }
  throw new Error(`wonderland/engine: unknown presence component "${component}"`);
}

/**
 * Slot cost surcharge from wounds — aow_srd.html's wound table: Weapon Arm
 * adds one slot to basic weapon actions, Legs adds one slot to Move.
 * Returns the effective slots-committed count including surcharges, for
 * capacity validation only (three slots is always all there is).
 */
function effectiveSlotCount(character, slots) {
  let count = slots.length;
  if (slots.includes('act') && hasWound(character, 'weaponArm')) count += 1;
  if (slots.includes('move') && hasWound(character, 'legs')) count += 1;
  return count;
}

/**
 * Weight model for initiative. Dagger's Initiative Advantage is the SRD's
 * one unconditional, deterministic case; its only documented exception is
 * Projectile Engagement Denial before the Dagger is in range, modeled here
 * as an explicit `engagementDenialActive` flag on the projectile fighter's
 * declaration so the exception is an opt-in input, not a guess. Absent a
 * Dagger, initiative falls back to a documented Read-advantage weight
 * (full vs. degraded), and ties are reported as GM-adjudicated rather than
 * silently broken one way — see the module header for why this engine
 * does not fabricate Read-accuracy precision the SRD doesn't specify.
 */
function computeInitiative(state, encounter) {
  const [a, b] = encounter.combatants;
  const charA = findCharacter(state, a.characterId);
  const charB = findCharacter(state, b.characterId);

  const daggerOverrides = (combatant, character, opponentCombatant, opponentCharacter) => {
    if (character.weaponSpecialty !== 'dagger') return false;
    const opponentDeclaration = opponentCombatant.declaration;
    if (
      opponentCharacter.weaponSpecialty === 'projectile' &&
      opponentDeclaration &&
      opponentDeclaration.engagementDenialActive
    ) {
      return false;
    }
    return true;
  };

  if (daggerOverrides(a, charA, b, charB)) {
    return { first: a.characterId, reason: 'daggerInitiativeAdvantage' };
  }
  if (daggerOverrides(b, charB, a, charA)) {
    return { first: b.characterId, reason: 'daggerInitiativeAdvantage' };
  }

  const weight = (character) => (presenceStage(character, 'read') === 'full' ? 1 : 0);
  const weightA = weight(charA);
  const weightB = weight(charB);
  if (weightA === weightB) {
    return { first: null, reason: 'readParity-gmAdjudicates' };
  }
  return {
    first: weightA > weightB ? a.characterId : b.characterId,
    reason: 'readAdvantage',
  };
}

/**
 * Trigger model. A technique with no trigger (a basic strike) is always
 * available. A structured trigger fires only when it matches the
 * opponent's actual declaration this exchange — see schema.js
 * createTechnique for the trigger shape.
 */
function evaluateTrigger(trigger, opponentDeclaration) {
  if (!trigger) return true;
  if (!opponentDeclaration) return false;
  switch (trigger.type) {
    case 'opponentCommitsSlots':
      return trigger.slots.every((slot) => opponentDeclaration.slots.includes(slot));
    default:
      throw new Error(`wonderland/engine: unknown trigger type "${trigger.type}"`);
  }
}

function findTechnique(character, techniqueId) {
  const technique = character.techniques.find((t) => t.id === techniqueId);
  if (!technique) {
    throw new Error(`wonderland/engine: character "${character.id}" has no technique "${techniqueId}"`);
  }
  return technique;
}

function applyInitEncounter(state, action) {
  const { characterIds, location } = action;
  characterIds.forEach((id) => findCharacter(state, id)); // throws loudly if unknown
  const next = deepClone(state);
  next.currentEncounter = schemaCreateEncounterState({ characterIds, location });
  return next;
}

function applyDeclareAction(state, action) {
  const { characterId, slots, techniqueId, engagementDenialActive } = action;
  if (!state.currentEncounter) {
    throw new Error('wonderland/engine: DECLARE_ACTION with no currentEncounter in state');
  }
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new Error('wonderland/engine: DECLARE_ACTION requires a non-empty slots array');
  }
  slots.forEach((s) => {
    if (!ENGINE_ACTION_SLOTS.includes(s)) throw new Error(`wonderland/engine: unknown slot "${s}"`);
  });

  const character = findCharacter(state, characterId);
  if (character.stamina === 'spent' && techniqueId) {
    throw new Error(`wonderland/engine: "${characterId}" is Spent — no techniques available (aow_srd.html ch4-stamina)`);
  }
  if (techniqueId) findTechnique(character, techniqueId); // throws loudly if unknown

  const effectiveCount = effectiveSlotCount(character, slots);
  if (effectiveCount > ENGINE_ACTION_SLOTS.length) {
    throw new Error(
      `wonderland/engine: "${characterId}" declared ${effectiveCount} effective slots (with wound surcharges) but only ${ENGINE_ACTION_SLOTS.length} exist`
    );
  }

  const next = deepClone(state);
  const combatant = findCombatant(next.currentEncounter, characterId);
  combatant.declaration = schemaCreateDeclaration({ slots: [...slots], techniqueId: techniqueId || null });
  if (engagementDenialActive) combatant.declaration.engagementDenialActive = true;
  return next;
}

function applyResolveExchange(state) {
  const encounter = state.currentEncounter;
  if (!encounter) {
    throw new Error('wonderland/engine: RESOLVE_EXCHANGE with no currentEncounter in state');
  }
  const undeclared = encounter.combatants.filter((c) => !c.declaration);
  if (undeclared.length > 0) {
    throw new Error(
      `wonderland/engine: RESOLVE_EXCHANGE called before all combatants declared (missing: ${undeclared
        .map((c) => c.characterId)
        .join(', ')})`
    );
  }

  const initiative = computeInitiative(state, encounter);
  const [a, b] = encounter.combatants;
  const order = initiative.first
    ? [a, b].sort((x) => (x.characterId === initiative.first ? -1 : 1))
    : [a, b];

  const resolvedActions = [];
  for (const combatant of order) {
    const character = findCharacter(state, combatant.characterId);
    const opponent = combatant === a ? b : a;
    const declaration = combatant.declaration;
    const technique = declaration.techniqueId ? findTechnique(character, declaration.techniqueId) : null;
    const triggerMet = evaluateTrigger(technique ? technique.trigger : null, opponent.declaration);

    if (!technique) {
      // Basic strike: no trigger, always resolves once declared.
      resolvedActions.push({ characterId: combatant.characterId, kind: 'basicStrike', triggerMet: true });
      continue;
    }
    if (triggerMet) {
      resolvedActions.push({
        characterId: combatant.characterId,
        kind: 'technique',
        techniqueId: technique.id,
        triggerMet: true,
        resolvesRegardlessOfInitiative: !!technique.resolvesRegardlessOfInitiative,
      });
    } else {
      resolvedActions.push({
        characterId: combatant.characterId,
        kind: 'technique',
        techniqueId: technique.id,
        triggerMet: false,
      });
    }
  }

  const next = deepClone(state);
  const nextEncounter = next.currentEncounter;
  nextEncounter.exchangeNumber += 1;
  nextEncounter.log.push({
    exchangeNumber: nextEncounter.exchangeNumber,
    initiative,
    resolvedActions,
  });
  nextEncounter.combatants.forEach((c) => {
    c.declaration = null;
  });
  return next;
}

function applyWound(state, action) {
  const { characterId, location } = action;
  const character = findCharacter(state, characterId);
  if (!Schema.WOUND_LOCATIONS.includes(location)) {
    throw new Error(`wonderland/engine: unknown wound location "${location}"`);
  }
  const next = deepClone(state);
  next.characters[characterId].wounds.push(location);
  if (location === 'presence') {
    // aow_srd.html: a Presence wound drops all three presence components
    // one stage immediately. Modeled as an immediate stamina step-down,
    // since stamina stage is what presenceStage() reads for read/hold.
    const idx = Math.min(staminaIndex(character.stamina) + 1, ENGINE_STAMINA_STAGES.length - 1);
    next.characters[characterId].stamina = ENGINE_STAMINA_STAGES[idx];
  }
  return next;
}

function applySetStamina(state, action) {
  const { characterId, stamina } = action;
  findCharacter(state, characterId);
  staminaIndex(stamina); // throws loudly if unknown stage
  const next = deepClone(state);
  next.characters[characterId].stamina = stamina;
  return next;
}

/**
 * The one entry point. Data in, data out — see module header.
 */
function resolve(currentState, action) {
  if (!currentState || typeof currentState !== 'object') {
    throw new Error('wonderland/engine: resolve() requires a state object');
  }
  if (!action || typeof action.type !== 'string') {
    throw new Error('wonderland/engine: resolve() requires an action with a string type');
  }
  switch (action.type) {
    case 'INIT_ENCOUNTER':
      return applyInitEncounter(currentState, action);
    case 'DECLARE_ACTION':
      return applyDeclareAction(currentState, action);
    case 'RESOLVE_EXCHANGE':
      return applyResolveExchange(currentState);
    case 'APPLY_WOUND':
      return applyWound(currentState, action);
    case 'SET_STAMINA':
      return applySetStamina(currentState, action);
    default:
      throw new Error(`wonderland/engine: unknown action type "${action.type}"`);
  }
}

const api = { resolve, computeInitiative, evaluateTrigger, presenceStage, effectiveSlotCount };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (root) {
  root.WonderlandEngine = api;
}

})(typeof window !== 'undefined' ? window : undefined);
