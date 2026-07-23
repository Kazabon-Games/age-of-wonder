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
 * (Mira/Sword/Riposte vs. Davan/Dagger) — the SRD's only narrated combat
 * exchange — plus a second, constructed case covering every wound/stamina
 * rule that exchange never touches (Head/Weapon Arm/Shield Arm/Legs/
 * Presence wounds, Strained/Spent stamina), each assertion traced to its
 * own quoted SRD line rather than inferred from this file. See
 * tests/wonderland-engine-adversarial.js §9-10 for the actual run. That
 * second case caught a real bug during development: presenceStage()
 * originally had no case for a Presence wound at all, and applyWound()
 * worked around it by bumping stamina one stage as a proxy — which only
 * ever degraded Hold, silently leaving Commit at "full" when the SRD says
 * a Presence wound drops all three components immediately. Fixed by
 * checking hasWound(character, 'presence') directly, first, in
 * presenceStage().
 *
 * Checkpoint 2 additions (2026-07-23): magic-in-combat's tier->slot-cost
 * table (T1-T6, with Wand's -1-tier slot acceleration); the three
 * remaining weapon specialties with deterministic mechanics — Sword
 * (free React alongside Act), Spear (opponent must spend Move+React to
 * close), Staff (once-per-encounter wound-absorbing barrier); the
 * inside-the-barrier combat-end threshold (Spent stamina or 3 wounds);
 * and a Leverage clamp to [-5, +5] resolving the factionStanding gap
 * Checkpoint 1 flagged (schema existed, no behavior). Deliberately NOT
 * touched this checkpoint, surveyed and scoped out because the SRD
 * itself leaves them to GM adjudication or they belong to a different
 * encounter type entirely: Willstrain stage progression, Dissolution,
 * Advancement (all narratively signaled, no formula given), Projectile's
 * reload/ammo state (underspecified — "costs the Move slot" without a
 * clear loaded/unloaded state machine), hybrid casting (needs a
 * bridging-fighting-style field this schema doesn't have yet), and the
 * Caravan Momentum / Exploration Depth systems (real deterministic
 * numbers exist there too — starting Momentum is
 * round((Route+Cohesion+Cover)/1.2) — but they're separate encounter
 * types, not combat, and deserve their own dedicated pass).
 *
 * Checkpoint 3 additions (2026-07-23): dug through the rest of the AOW
 * suite (aow_heir_record.html, aow_play_sheet.html, aow_gm_screen.html,
 * aow_spell_creator.html), not just the SRD — those are real, shipped,
 * battle-tested tools with their own proven data models and formulas,
 * not just prose to extract rules from. Two significant findings changed
 * this file:
 *   - aow_gm_screen.html's "Weight Engine" (applyWeightAndGenerateHooks)
 *     is the actual, working ancestor of the "weight/trigger model"
 *     language in the original Checkpoint 1 handover doc — a DIFFERENT
 *     system from this file's combat initiative weight model, operating
 *     on political leverage instead. Ported the mechanical core
 *     (computePoliticalActionEffect/effectiveThreshold, LOG_POLITICAL_ACTION)
 *     faithfully: tier*1.5 base weight, whole-point score deltas at tier
 *     3+ vs. fractional-carry deltas at tier 1-2, and an escalating
 *     trigger threshold (max(2, base - fireCount)). NOT ported: ripple
 *     propagation to "conductor" NPCs and all narrative hook-text
 *     generation — the former needs the WORLD_NPCS relationship graph
 *     this repo hasn't imported, the latter is GM-facing prose, not pure
 *     engine logic.
 *   - Checkpoint 2's MODIFY_LEVERAGE/factionStanding was WRONG: it
 *     modeled leverage as one party-wide number per faction. The real
 *     system (aow_play_sheet.html's per-heir state.leverage, and
 *     aow_srd.html ch3-leverage's own text: "one score per significant
 *     NPC and faction... for the heir") tracks it per actor against a
 *     shared node. Corrected: SaveState.factionStanding -> politicalNodes
 *     (schemaVersion 1 -> 2), MODIFY_LEVERAGE now takes an actorId.
 * Also added: APPLY_CAPSTONE/RESET_CAPSTONE_USAGE (real Capstone content
 * from aow_heir_record.html — a flat leverage bonus/penalty for a
 * five-year single-aspect commitment, once per session).
 *
 * importHeirRecord.js (new file, not this one) adapts a real
 * aow_heir_record.html JSON export into this schema — see its own header
 * for the import discipline, mirrored from aow_play_sheet.html's proven
 * importFromS0().
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
 * Winded-or-worse degrades Hold; Spent degrades Commit; a Presence wound
 * drops ALL THREE components immediately — checked first, before any
 * single-component condition, so it can never be short-circuited by only
 * matching one component's own trigger).
 */
function presenceStage(character, component) {
  if (component !== 'read' && component !== 'commit' && component !== 'hold') {
    throw new Error(`wonderland/engine: unknown presence component "${component}"`);
  }
  if (hasWound(character, 'presence')) return 'degraded';

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
  // component === 'hold'
  if (hasWound(character, 'shieldArm') || hasWound(character, 'legs')) return 'degraded';
  if (idx >= staminaIndex('winded')) return 'degraded';
  return 'full';
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
  // Sword's Range of Response (aow_srd.html ch4-weapons): "split their Act
  // slot — using it for both an offensive action and a defensive response
  // ... without needing to spend the React slot for the defensive element."
  // Modeled as: React is free when declared alongside Act by a Sword
  // fighter. The declaration model here doesn't distinguish *why* React was
  // declared, so this discount applies whenever both are present together —
  // a documented simplification, not a claim the SRD spells out the exact
  // mechanism this way.
  if (character.weaponSpecialty === 'sword' && slots.includes('act') && slots.includes('react')) {
    count -= 1;
  }
  return count;
}

/**
 * Magic-in-combat tier -> slot-cost table (aow_srd.html ch2-combat). The
 * Wand's cast acceleration ("all spells are treated one tier lower for
 * slot cost only") is applied here, before the table lookup — willstrain
 * is explicitly untouched by it per the same passage, and this engine
 * doesn't track willstrain as a number anyway (see module header).
 *
 * T5/T6 are marked `sustained: true` rather than given an invented
 * per-tier exchange count — the SRD says these "span multiple exchanges"
 * without specifying how many; that duration is the spell's own property
 * (ch2-tiers: Duration is one of the four qualities that sets tier in the
 * first place), not a number this engine should guess at.
 */
function castingSlotCost(tier, weaponSpecialty) {
  if (!Number.isInteger(tier) || tier < 1 || tier > 6) {
    throw new Error(`wonderland/engine: spell tier must be an integer 1-6, got "${tier}"`);
  }
  const effectiveTier = weaponSpecialty === 'wand' ? Math.max(1, tier - 1) : tier;
  if (effectiveTier === 1) return { requiredSlots: ['act'], flexibleCount: 0, sustained: false };
  if (effectiveTier === 2) return { requiredSlots: ['act', 'move'], flexibleCount: 0, sustained: false };
  if (effectiveTier === 3) return { requiredSlots: ['act'], flexibleCount: 1, sustained: false };
  return { requiredSlots: ['act', 'move', 'react'], flexibleCount: 0, sustained: effectiveTier >= 5 };
}

/**
 * Validates a declared slots array against a spell's tier requirement.
 * T3's "Act plus one other slot" is the one case with a real choice — the
 * caller picks Move or React and it must show up as the one extra slot.
 */
function validateCastSlots(tier, weaponSpecialty, slots) {
  const cost = castingSlotCost(tier, weaponSpecialty);
  const missingRequired = cost.requiredSlots.filter((s) => !slots.includes(s));
  if (missingRequired.length > 0) {
    throw new Error(
      `wonderland/engine: casting tier ${tier} requires slot(s) [${missingRequired.join(', ')}] that were not declared`
    );
  }
  const extras = slots.filter((s) => !cost.requiredSlots.includes(s));
  if (extras.length !== cost.flexibleCount) {
    throw new Error(
      `wonderland/engine: casting tier ${tier} needs exactly ${cost.flexibleCount} additional slot(s) beyond [${cost.requiredSlots.join(', ')}], got [${extras.join(', ')}]`
    );
  }
  return cost;
}

/**
 * Spear's Reach Dominance (aow_srd.html ch4-weapons): "An opponent who
 * wants to close to striking range against a Spear fighter must spend
 * both their Move and React slots to do so." Checked against every other
 * combatant in the encounter — if any of them is Spear-specialized and
 * this declaration includes Move without React, it's an illegal closing
 * attempt.
 */
function violatesSpearReachDominance(declaringSlots, opponentCharacters) {
  if (!declaringSlots.includes('move')) return false;
  return opponentCharacters.some(
    (opp) => opp.weaponSpecialty === 'spear' && !declaringSlots.includes('react')
  );
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
  const { characterId, slots, techniqueId, castTier, engagementDenialActive } = action;
  if (!state.currentEncounter) {
    throw new Error('wonderland/engine: DECLARE_ACTION with no currentEncounter in state');
  }
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new Error('wonderland/engine: DECLARE_ACTION requires a non-empty slots array');
  }
  slots.forEach((s) => {
    if (!ENGINE_ACTION_SLOTS.includes(s)) throw new Error(`wonderland/engine: unknown slot "${s}"`);
  });
  if (techniqueId && castTier) {
    throw new Error(
      `wonderland/engine: "${characterId}" declared both a technique and a cast — hybrid casting is not implemented in this checkpoint (aow_srd.html ch2-combat "Hybrid Casting" requires a bridging fighting style this schema doesn't track yet); the choice is weapon or spell, not both`
    );
  }

  const character = findCharacter(state, characterId);
  if (character.stamina === 'spent' && (techniqueId || castTier)) {
    throw new Error(`wonderland/engine: "${characterId}" is Spent — no techniques available (aow_srd.html ch4-stamina)`);
  }
  if (techniqueId) findTechnique(character, techniqueId); // throws loudly if unknown
  if (castTier) validateCastSlots(castTier, character.weaponSpecialty, slots); // throws loudly on a mismatched declaration

  const opponentCharacters = state.currentEncounter.combatants
    .filter((c) => c.characterId !== characterId)
    .map((c) => findCharacter(state, c.characterId));
  if (violatesSpearReachDominance(slots, opponentCharacters)) {
    throw new Error(
      `wonderland/engine: "${characterId}" declared Move against a Spear opponent without also declaring React — Reach Dominance requires both to close (aow_srd.html ch4-weapons)`
    );
  }

  const effectiveCount = effectiveSlotCount(character, slots);
  if (effectiveCount > ENGINE_ACTION_SLOTS.length) {
    throw new Error(
      `wonderland/engine: "${characterId}" declared ${effectiveCount} effective slots (with wound surcharges) but only ${ENGINE_ACTION_SLOTS.length} exist`
    );
  }

  const next = deepClone(state);
  const combatant = findCombatant(next.currentEncounter, characterId);
  combatant.declaration = schemaCreateDeclaration({ slots: [...slots], techniqueId: techniqueId || null });
  if (castTier) combatant.declaration.castTier = castTier;
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

    if (declaration.castTier) {
      // A spell cast: no trigger model (that's a technique-only concept
      // here), always resolves once its slot requirements were validated
      // at declaration time.
      resolvedActions.push({ characterId: combatant.characterId, kind: 'spellCast', castTier: declaration.castTier, triggerMet: true });
      continue;
    }
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
  const { characterId, location, absorbedByStaffBarrier } = action;
  const character = findCharacter(state, characterId); // throws loudly if unknown
  if (!Schema.WOUND_LOCATIONS.includes(location)) {
    throw new Error(`wonderland/engine: unknown wound location "${location}"`);
  }

  if (absorbedByStaffBarrier) {
    // Staff's Barrier Generation (aow_srd.html ch4-weapons): "Once per
    // encounter... spend their React slot to absorb one wound state
    // completely — the wound that would have been applied does not apply."
    // Once-per-ENCOUNTER, not per-exchange, so it lives on the encounter-
    // scoped combatant state (schema.js createCombatantState), not the
    // persisted CharacterRecord.
    if (character.weaponSpecialty !== 'staff') {
      throw new Error(`wonderland/engine: "${characterId}" has no Staff Barrier to absorb this wound with`);
    }
    if (!state.currentEncounter) {
      throw new Error('wonderland/engine: no currentEncounter — Staff Barrier is an encounter-scoped resource');
    }
    const combatant = findCombatant(state.currentEncounter, characterId);
    if (combatant.staffBarrierUsed) {
      throw new Error(`wonderland/engine: "${characterId}" has already used their Staff Barrier this encounter`);
    }
    const next = deepClone(state);
    findCombatant(next.currentEncounter, characterId).staffBarrierUsed = true;
    return next; // wound is absorbed — never pushed to character.wounds
  }

  const next = deepClone(state);
  next.characters[characterId].wounds.push(location);
  // aow_srd.html: a Presence wound drops all three presence components one
  // stage immediately. Recording the wound is sufficient — presenceStage()
  // checks hasWound(character, 'presence') first, before any single-
  // component condition, so all three read as degraded from this point on.
  // (Earlier version of this function bumped stamina instead, as a proxy —
  // that only ever degraded Hold, silently leaving Commit undegraded.
  // Caught by the second worked case; see wonderland/README.md.)
  return next;
}

/**
 * Inside the barrier only (aow_srd.html ch4-location, "Inside the City
 * Barrier" card): "Combat ends when one participant reaches Spent stamina
 * or has accumulated three wound states — whichever comes first." Outside
 * the barrier the SRD explicitly says combat "can continue past Spent" —
 * no hard threshold is given there, so this function only returns true for
 * 'insideBarrier'; other locations always return false rather than
 * guessing at a number the SRD doesn't provide.
 */
function isCombatOver(character, location) {
  if (location !== 'insideBarrier') return false;
  return character.stamina === 'spent' || character.wounds.length >= 3;
}

function findPoliticalNode(state, nodeId) {
  const node = state.politicalNodes[nodeId];
  if (!node) {
    throw new Error(`wonderland/engine: unknown political node "${nodeId}" — add it to state.politicalNodes before referencing it (see schema.js createPoliticalNode)`);
  }
  return node;
}

// aow_srd.html ch3-leverage: "No score can exceed +5 or fall below -5."
function clampLeverageScore(value) {
  return Math.max(-5, Math.min(5, value));
}

function applyModifyLeverage(state, action) {
  const { targetId, actorId, delta } = action;
  if (typeof targetId !== 'string' || !targetId) {
    throw new Error('wonderland/engine: MODIFY_LEVERAGE requires a targetId string');
  }
  if (typeof actorId !== 'string' || !actorId) {
    throw new Error('wonderland/engine: MODIFY_LEVERAGE requires an actorId string — leverage is per-heir, not party-wide (aow_srd.html ch3-leverage)');
  }
  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    throw new Error('wonderland/engine: MODIFY_LEVERAGE requires a numeric delta');
  }
  findPoliticalNode(state, targetId); // throws loudly if unknown
  // The delta itself is a GM call (how much a given flat adjustment moves
  // the needle, e.g. a Capstone bonus/penalty) — not something this engine
  // invents a formula for; only the ceiling/floor clamp is a hard rule.
  // For a tier-based political action with the real accumulating-weight
  // math instead of a flat delta, use LOG_POLITICAL_ACTION below.
  const next = deepClone(state);
  const node = next.politicalNodes[targetId];
  const current = node.scores[actorId] || 0;
  node.scores[actorId] = clampLeverageScore(current + delta);
  return next;
}

/**
 * The real Weight Engine, ported from aow_gm_screen.html's
 * applyWeightAndGenerateHooks() (action-event branch). That tool also
 * generates GM-facing narrative hook text and ripples the weight out to
 * "conductor" NPCs via a relationship graph (WORLD_NPCS) this repo hasn't
 * imported — both deliberately left out here. What's ported is the
 * mechanical core: a political action of a given tier and direction adds
 * weight to a node, moves the acting character's score with that node
 * (by a whole point at tier 3-4, two points at tier 5, or a fractional
 * amount at tier 1-2 that carries into a whole point once it accumulates
 * past 1), and can "fire" — a trigger the content layer can react to —
 * once accumulated weight crosses the node's threshold. A node that
 * keeps firing gets a lower effective threshold each time (floored at 2),
 * modeling escalation rather than requiring identical pressure every time.
 */
function effectiveThreshold(node) {
  return Math.max(2, node.baseThreshold - (node.fireCount || 0));
}

function computePoliticalActionEffect(node, actorId, tier, direction) {
  if (!Number.isInteger(tier) || tier < 1 || tier > 5) {
    throw new Error(`wonderland/engine: political action tier must be an integer 1-5, got "${tier}"`);
  }
  if (direction !== 'favorable' && direction !== 'hostile') {
    throw new Error(`wonderland/engine: political action direction must be "favorable" or "hostile", got "${direction}"`);
  }
  const baseWeight = tier * 1.5;
  const sign = direction === 'hostile' ? -1 : 1;
  const deltaMag = tier === 5 ? 2 : tier >= 3 ? 1 : 0;
  const fracDelta = tier === 2 ? 0.5 : tier === 1 ? 0.25 : 0;

  const accumWeight = (node.accumWeight || 0) + baseWeight;
  let score = node.scores[actorId] || 0;
  let fractional = node.fractional[actorId] || 0;
  if (deltaMag > 0) {
    score = clampLeverageScore(score + sign * deltaMag);
  } else if (fracDelta > 0) {
    fractional += sign * fracDelta;
    if (Math.abs(fractional) >= 1) {
      score = clampLeverageScore(score + Math.sign(fractional));
      fractional = 0;
    }
  }

  const threshold = effectiveThreshold(node);
  const triggered = accumWeight >= threshold;
  return {
    accumWeight: triggered ? 0 : accumWeight,
    score,
    fractional,
    triggered,
    fireCount: (node.fireCount || 0) + (triggered ? 1 : 0),
  };
}

function applyLogPoliticalAction(state, action) {
  const { targetId, actorId, tier, direction } = action;
  if (typeof targetId !== 'string' || !targetId) {
    throw new Error('wonderland/engine: LOG_POLITICAL_ACTION requires a targetId string');
  }
  if (typeof actorId !== 'string' || !actorId) {
    throw new Error('wonderland/engine: LOG_POLITICAL_ACTION requires an actorId string');
  }
  const node = findPoliticalNode(state, targetId); // throws loudly if unknown
  const effect = computePoliticalActionEffect(node, actorId, tier, direction); // throws loudly on a bad tier/direction

  const next = deepClone(state);
  const nextNode = next.politicalNodes[targetId];
  nextNode.accumWeight = effect.accumWeight;
  nextNode.scores[actorId] = effect.score;
  nextNode.fractional[actorId] = effect.fractional;
  nextNode.fireCount = effect.fireCount;
  // No side-channel "did it trigger" flag on the returned state — data in,
  // data out stays the only contract (§0). A caller that needs to know
  // compares fireCount between the state it passed in and the state
  // resolve() returned: an increase means this action crossed threshold.
  return next;
}

/**
 * A Capstone (aow_heir_record.html CAPSTONES): a flat leverage
 * bonus/penalty a character earns for committing five session-zero years
 * to one aspect, usable once per session. Unlike LOG_POLITICAL_ACTION,
 * this is a direct, immediate score adjustment — no accumulating weight,
 * no threshold, no trigger — so it goes through the same clamp as
 * MODIFY_LEVERAGE rather than the weight-engine math above.
 */
function applyCapstone(state, action) {
  const { characterId } = action;
  const character = findCharacter(state, characterId); // throws loudly if unknown
  if (!character.capstone) {
    throw new Error(`wonderland/engine: "${characterId}" has no capstone to apply`);
  }
  if (character.capstone.usedThisSession) {
    throw new Error(`wonderland/engine: "${characterId}" has already used their capstone this session`);
  }
  const { leverageBonus, leveragePenalty } = character.capstone;
  if (leverageBonus) findPoliticalNode(state, leverageBonus.key); // throws loudly if unknown
  (leveragePenalty || []).forEach((p) => findPoliticalNode(state, p.key)); // throws loudly if unknown

  const next = deepClone(state);
  if (leverageBonus) {
    const node = next.politicalNodes[leverageBonus.key];
    node.scores[characterId] = clampLeverageScore((node.scores[characterId] || 0) + leverageBonus.amount);
  }
  (leveragePenalty || []).forEach((p) => {
    const node = next.politicalNodes[p.key];
    node.scores[characterId] = clampLeverageScore((node.scores[characterId] || 0) - p.amount);
  });
  next.characters[characterId].capstone.usedThisSession = true;
  return next;
}

function applyResetCapstoneUsage(state, action) {
  const { characterId } = action;
  const character = findCharacter(state, characterId); // throws loudly if unknown
  if (!character.capstone) {
    throw new Error(`wonderland/engine: "${characterId}" has no capstone to reset`);
  }
  const next = deepClone(state);
  next.characters[characterId].capstone.usedThisSession = false;
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
    case 'MODIFY_LEVERAGE':
      return applyModifyLeverage(currentState, action);
    case 'LOG_POLITICAL_ACTION':
      return applyLogPoliticalAction(currentState, action);
    case 'APPLY_CAPSTONE':
      return applyCapstone(currentState, action);
    case 'RESET_CAPSTONE_USAGE':
      return applyResetCapstoneUsage(currentState, action);
    default:
      throw new Error(`wonderland/engine: unknown action type "${action.type}"`);
  }
}

const api = {
  resolve,
  computeInitiative,
  evaluateTrigger,
  presenceStage,
  effectiveSlotCount,
  castingSlotCost,
  isCombatOver,
  effectiveThreshold,
  computePoliticalActionEffect,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (root) {
  root.WonderlandEngine = api;
}

})(typeof window !== 'undefined' ? window : undefined);
