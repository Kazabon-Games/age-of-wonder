'use strict';
/*
 * WONDERLAND: FIRST PRINCIPLES — Checkpoint 4 PLACEHOLDER house content.
 *
 * NOT REAL CONTENT. Every id/name/description here is deliberately
 * labeled [PLACEHOLDER] so it can never be mistaken for actual house
 * design. House identity, Kit descriptions, Principle-tagged abilities,
 * and Transformation forms are Kazabon's own creative material — this
 * repo dug through the rest of the AOW suite for real content twice
 * already (Checkpoint 3's heir import, Checkpoint 2's SRD extraction) and
 * found nothing resembling a "house kit" or "Transformation form" system
 * anywhere in it. This is genuinely new design with no existing source
 * to extract, unlike those two checkpoints.
 *
 * What this file IS for: proving schema.js's HouseRecord/
 * TransformationForm shapes and engine.js's GRANT_TECHNIQUE/
 * ACTIVATE_TRANSFORMATION actions actually work end-to-end — a house
 * ability granted onto a character resolves through a real combat
 * exchange exactly like a combat-trained technique, and a Transformation
 * form's unlock condition gates a bonus technique for real. See
 * tests/wonderland-engine-adversarial.js §18 for that proof.
 *
 * When real house content exists, this file is deleted, not extended.
 */

(function (root) {

const Schema =
  typeof module !== 'undefined' && module.exports
    ? require('./schema.js')
    : root.WonderlandSchema;

const wardingStance = Schema.createTechnique({
  id: 'tech_placeholder_warding_stance',
  name: '[PLACEHOLDER] Warding Stance',
  trigger: null, // always available, like a basic strike
  slotCost: ['react'],
  effect: 'Placeholder effect text — exists only to prove a house ability can be granted onto a character and used in a real exchange, not real Kazabon content.',
  resolvesRegardlessOfInitiative: false,
  principle: '[PLACEHOLDER PRINCIPLE: Vigilance]',
});

const testbedSurge = Schema.createTechnique({
  id: 'tech_placeholder_testbed_surge',
  name: '[PLACEHOLDER] Testbed Surge',
  // Real structured trigger (same shape as Checkpoint 1's Riposte),
  // deliberately, so the end-to-end test exercises evaluateTrigger() too,
  // not just a trivial always-available ability.
  trigger: { type: 'opponentCommitsSlots', slots: ['act', 'react'] },
  slotCost: ['act'],
  effect: 'Placeholder bonus technique granted by the placeholder Transformation form below. Not real content.',
  resolvesRegardlessOfInitiative: true,
  principle: '[PLACEHOLDER PRINCIPLE: Resolve]',
});

const awakenedTestbedForm = Schema.createTransformationForm({
  id: 'form_placeholder_awakened_testbed',
  name: '[PLACEHOLDER] Awakened Testbed Form',
  description: 'Placeholder Transformation form — unlocks once the character has accumulated 2 wound states. Exists only to prove the unlock-condition/grant pipeline. Not real content.',
  unlockCondition: { type: 'woundCountAtLeast', count: 2 },
  grantedTechnique: testbedSurge,
});

const placeholderHouse = Schema.createHouseRecord({
  id: 'house_placeholder_testbed',
  name: '[PLACEHOLDER] House Testbed — not real Kazabon content',
  kitDescription:
    'Built only to prove HouseRecord/TransformationForm and the GRANT_TECHNIQUE/ACTIVATE_TRANSFORMATION actions work end-to-end (Checkpoint 4). Pending the actual flagship design doc.',
  factionId: null,
  abilities: [wardingStance],
  transformationForms: [awakenedTestbedForm],
  startingEquipment: ['[placeholder] testbed sigil charm'],
});

const api = { placeholderHouse, wardingStance, testbedSurge, awakenedTestbedForm };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (root) {
  root.WonderlandPlaceholderHouse = api;
}

})(typeof window !== 'undefined' ? window : undefined);
