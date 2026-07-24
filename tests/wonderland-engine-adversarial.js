// Wonderland Checkpoint 1 verification pass — mirrors the discipline of
// tests/wardfall-adversarial.js in Shin-Maho-Arcade: drives the real
// engine/persistence code in a real browser (no code read judged
// plausible) and hand-verifies output against a real SRD worked example
// (aow_srd.html ch4-techniques, "A Worked Exchange": Mira/Sword/Riposte
// vs. Davan/Dagger) rather than internal-consistency-only checks.
//
// Usage: serve the repo (`npx http-server -p 8935`), then
// `NODE_PATH=/opt/node22/lib/node_modules node tests/wonderland-engine-adversarial.js`.
const { chromium } = require('playwright');

const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const BASE_URL = process.env.WONDERLAND_URL || 'http://localhost:8935/wonderland/harness.html';

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ok   -', label); }
  else { fail++; console.log('  FAIL -', label); }
}
// The ripple-propagation math chains multiplications by 0.6/0.5 (e.g.
// 6*0.6 === 3.5999999999999996, not exactly 3.6 in a float) — exact ===
// on those derived values is fragile by construction, not a real
// precision requirement, so comparisons against a hand-computed expected
// value use this instead.
function approxEqual(a, b) {
  return Math.abs(a - b) < 1e-9;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  console.log('1. Load check');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Wonderland && window.Wonderland._test && window.Wonderland._test.ready);
  ok(consoleErrors.length === 0, 'zero console errors on load (got: ' + JSON.stringify(consoleErrors) + ')');
  ok(pageErrors.length === 0, 'zero page errors on load (got: ' + JSON.stringify(pageErrors) + ')');
  ok(typeof (await page.evaluate(() => typeof window.Wonderland.engine.resolve)) === 'string', 'engine.resolve is exposed');

  console.log('2. Schema factories produce plain, JSON-safe data');
  const schemaCheck = await page.evaluate(() => {
    const { createCharacterRecord, createSaveState } = window.Wonderland.schema;
    const char = createCharacterRecord({ id: 'char_test' });
    const save = createSaveState();
    let roundTripOk;
    try {
      roundTripOk = JSON.stringify(JSON.parse(JSON.stringify({ char, save }))) === JSON.stringify({ char, save });
    } catch (e) {
      roundTripOk = false;
    }
    return { roundTripOk, hasNoFunctions: Object.values(char).every((v) => typeof v !== 'function') };
  });
  ok(schemaCheck.roundTripOk, 'CharacterRecord/SaveState survive a JSON round-trip unchanged');
  ok(schemaCheck.hasNoFunctions, 'CharacterRecord fields contain no functions');

  console.log('3. SRD worked exchange — setup (aow_srd.html ch4-techniques)');
  const setup = await page.evaluate(() => {
    const { createCharacterRecord, createTechnique, createSaveState } = window.Wonderland.schema;
    const { resolve } = window.Wonderland.engine;

    const riposte = createTechnique({
      id: 'tech_riposte',
      name: 'Riposte',
      trigger: { type: 'opponentCommitsSlots', slots: ['act', 'react'] },
      slotCost: ['act'],
      effect: 'Immediate counter-strike that resolves before the opponent can reposition.',
      resolvesRegardlessOfInitiative: true,
    });
    const mira = createCharacterRecord({
      id: 'char_mira', name: 'Mira', weaponSpecialty: 'sword', combatYears: 2, techniques: [riposte],
    });
    const davan = createCharacterRecord({
      id: 'char_davan', name: 'Davan', weaponSpecialty: 'dagger', combatYears: 1, techniques: [],
    });

    let state = createSaveState();
    state.characters[mira.id] = mira;
    state.characters[davan.id] = davan;
    state = resolve(state, { type: 'INIT_ENCOUNTER', characterIds: [mira.id, davan.id], location: 'insideBarrier' });
    return state;
  });
  ok(setup.currentEncounter && setup.currentEncounter.exchangeNumber === 0, 'encounter initialized at exchange 0');

  console.log('4. Exchange 1 — both declare a basic strike (Act only)');
  const exchange1 = await page.evaluate((state) => {
    const { resolve } = window.Wonderland.engine;
    let s = state;
    s = resolve(s, { type: 'DECLARE_ACTION', characterId: 'char_davan', slots: ['act'] });
    s = resolve(s, { type: 'DECLARE_ACTION', characterId: 'char_mira', slots: ['act'] });
    s = resolve(s, { type: 'RESOLVE_EXCHANGE' });
    return s;
  }, setup);
  const log1 = exchange1.currentEncounter.log[0];
  ok(log1.initiative.first === 'char_davan', 'exchange 1: Davan has initiative (Dagger Initiative Advantage)');
  ok(log1.initiative.reason === 'daggerInitiativeAdvantage', 'exchange 1: initiative reason is the Dagger override, not a Read-weight guess');
  ok(
    log1.resolvedActions.every((a) => a.triggerMet) && log1.resolvedActions.length === 2,
    'exchange 1: both basic strikes resolve ("Davan\'s strike lands... Mira\'s strike still resolves")'
  );

  console.log('5. Exchange 2 — Mira declares Riposte, Davan full-presses (Act+React)');
  const exchange2 = await page.evaluate((state) => {
    const { resolve } = window.Wonderland.engine;
    let s = state;
    s = resolve(s, { type: 'DECLARE_ACTION', characterId: 'char_davan', slots: ['act', 'react'] });
    s = resolve(s, { type: 'DECLARE_ACTION', characterId: 'char_mira', slots: ['act'], techniqueId: 'tech_riposte' });
    s = resolve(s, { type: 'RESOLVE_EXCHANGE' });
    return s;
  }, exchange1);
  const log2 = exchange2.currentEncounter.log[1]; // log[0] is exchange 1's entry; RESOLVE_EXCHANGE appends, doesn't replace
  ok(log2.initiative.first === 'char_davan', 'exchange 2: Davan still has initiative (Dagger is unconditional)');
  const miraAction2 = log2.resolvedActions.find((a) => a.characterId === 'char_mira');
  ok(miraAction2.triggerMet === true, 'exchange 2: Riposte trigger fires — Davan committed both Act and React');
  ok(miraAction2.resolvesRegardlessOfInitiative === true, 'exchange 2: Riposte is flagged to resolve despite Davan having initiative');
  ok(
    log2.resolvedActions.length === 2 && log2.resolvedActions.every((a) => a.triggerMet),
    'exchange 2: both Davan\'s strike and Mira\'s Riposte land ("Both characters take hits in the same exchange")'
  );

  console.log('6. Trigger does NOT fire when the opponent declaration does not match (counter-case, not in the SRD prose but implied by its trigger rule)');
  const negativeCase = await page.evaluate(() => {
    const { evaluateTrigger } = window.Wonderland.engine;
    const trigger = { type: 'opponentCommitsSlots', slots: ['act', 'react'] };
    return evaluateTrigger(trigger, { slots: ['act'], techniqueId: null });
  });
  ok(negativeCase === false, 'Riposte trigger correctly does not fire against an Act-only declaration (this is exchange 1\'s actual Davan declaration)');

  console.log('7. Fail-loudly checks — engine rejects malformed input rather than defaulting');
  const engineErrors = await page.evaluate((state) => {
    const { resolve } = window.Wonderland.engine;
    const results = {};
    try { resolve(state, { type: 'DECLARE_ACTION', characterId: 'char_nobody', slots: ['act'] }); results.unknownCharacter = 'did not throw'; }
    catch (e) { results.unknownCharacter = e.message; }
    try { resolve(state, { type: 'NOT_A_REAL_ACTION' }); results.unknownAction = 'did not throw'; }
    catch (e) { results.unknownAction = e.message; }
    try { resolve(state, { type: 'DECLARE_ACTION', characterId: 'char_mira', slots: [] }); results.emptySlots = 'did not throw'; }
    catch (e) { results.emptySlots = e.message; }
    return results;
  }, setup);
  ok(engineErrors.unknownCharacter !== 'did not throw', 'resolve() throws on an unknown characterId');
  ok(engineErrors.unknownAction !== 'did not throw', 'resolve() throws on an unknown action type');
  ok(engineErrors.emptySlots !== 'did not throw', 'resolve() throws on an empty slots declaration');

  console.log('8. Persistence layer — real IndexedDB, missing/malformed records fail loudly');
  const persistenceResults = await page.evaluate(async () => {
    const p = window.Wonderland.persistence;
    const results = {};

    try { await p.getEntity('entity:does_not_exist'); results.missingRecord = 'did not throw'; }
    catch (e) { results.missingRecord = e.message; }

    try { p.putEntity('bad-key-no-namespace', { x: 1 }); results.invalidKeyFormat = 'did not throw'; }
    catch (e) { results.invalidKeyFormat = e.message; }

    await p.putEntity('entity:npc_042', { kind: 'entity', id: 'npc_042', data: { name: 'Test NPC' } });
    const roundTrip = await p.getEntity('entity:npc_042');
    results.roundTripName = roundTrip.data.name;

    // Malformed save: write a save state with the wrong schemaVersion directly
    // (bypassing putSaveState's own guard) to prove getSaveState() catches it
    // rather than silently loading an incompatible save.
    await p.putEntity('save:corrupt', { schemaVersion: 999, party: [] });
    try { await p.getSaveState('corrupt', 1); results.wrongSchemaVersion = 'did not throw'; }
    catch (e) { results.wrongSchemaVersion = e.message; }

    try { p.putSaveState('bad', { party: [] }); results.saveMissingVersion = 'did not throw'; }
    catch (e) { results.saveMissingVersion = e.message; }

    return results;
  });
  ok(persistenceResults.missingRecord !== 'did not throw', 'getEntity() throws on a missing record, does not return null/undefined silently');
  ok(persistenceResults.invalidKeyFormat !== 'did not throw', 'putEntity() throws on a key with no valid namespace prefix');
  ok(persistenceResults.roundTripName === 'Test NPC', 'entity:npc_042 round-trips through real IndexedDB correctly');
  ok(persistenceResults.wrongSchemaVersion !== 'did not throw', 'getSaveState() throws on a schemaVersion mismatch instead of half-loading it');
  ok(persistenceResults.saveMissingVersion !== 'did not throw', 'putSaveState() throws when asked to save state with no schemaVersion');

  console.log('9. Second worked case — wound/stamina interactions');
  // Unlike section 3-6 above, this is NOT a second narrative passage quoted
  // from aow_srd.html — ch4-techniques only narrates the one Mira/Davan
  // exchange. Each assertion below is instead hand-derived from a specific,
  // separately quoted rule in the SRD's wound table and Presence section
  // (aow_srd.html lines ~1460-1495, ~786-788), computed independently
  // before running the engine, then checked for a match — same discipline
  // as sections 3-6, applied where the SRD gives a rule but not a story.
  // Each character below carries exactly one wound, isolating that wound's
  // effect from every other rule that could independently degrade the same
  // component, so a failure here points at one specific rule.
  const woundResults = await page.evaluate(() => {
    const { createCharacterRecord } = window.Wonderland.schema;
    const { presenceStage, effectiveSlotCount } = window.Wonderland.engine;
    const results = {};

    const fresh = createCharacterRecord({ id: 'char_fresh' });
    results.freshAllFull =
      presenceStage(fresh, 'read') === 'full' &&
      presenceStage(fresh, 'commit') === 'full' &&
      presenceStage(fresh, 'hold') === 'full';

    // "A Head wound degrades the Read component... regardless of stamina
    // state" (line 786) — isolated: Commit/Hold must stay full.
    const headWounded = createCharacterRecord({ id: 'char_head', wounds: ['head'] });
    results.headDegradesReadOnly =
      presenceStage(headWounded, 'read') === 'degraded' &&
      presenceStage(headWounded, 'commit') === 'full' &&
      presenceStage(headWounded, 'hold') === 'full';

    // Weapon Arm wound table row: "basic weapon actions cost one additional
    // slot" + presence table "Degrades from: Weapon Arm wounds" under Commit
    // (line 1466, 1418) — isolated: Read/Hold stay full.
    const armWounded = createCharacterRecord({ id: 'char_arm', wounds: ['weaponArm'] });
    results.weaponArmDegradesCommitOnly =
      presenceStage(armWounded, 'commit') === 'degraded' &&
      presenceStage(armWounded, 'read') === 'full' &&
      presenceStage(armWounded, 'hold') === 'full';
    results.weaponArmActSurcharge = effectiveSlotCount(armWounded, ['act']) === 2; // Act alone now costs 2

    // Shield Arm / Legs both listed as Hold-degrade sources (line 1424);
    // Legs additionally costs Move one extra slot (line 1476).
    const shieldArmWounded = createCharacterRecord({ id: 'char_shield', wounds: ['shieldArm'] });
    results.shieldArmDegradesHoldOnly =
      presenceStage(shieldArmWounded, 'hold') === 'degraded' &&
      presenceStage(shieldArmWounded, 'read') === 'full' &&
      presenceStage(shieldArmWounded, 'commit') === 'full';

    const legsWounded = createCharacterRecord({ id: 'char_legs', wounds: ['legs'] });
    results.legsDegradesHoldOnly =
      presenceStage(legsWounded, 'hold') === 'degraded' &&
      presenceStage(legsWounded, 'read') === 'full' &&
      presenceStage(legsWounded, 'commit') === 'full';
    results.legsMoveSurcharge = effectiveSlotCount(legsWounded, ['move']) === 2; // Move alone now costs 2

    // "A Presence wound drops all three presence components one stage
    // immediately" (line 787/1491) — the one rule most likely to be
    // implemented as a partial proxy instead of directly; isolated with no
    // other wound present, all three MUST read degraded.
    const presenceWounded = createCharacterRecord({ id: 'char_presence', wounds: ['presence'] });
    results.presenceDegradesAllThree =
      presenceStage(presenceWounded, 'read') === 'degraded' &&
      presenceStage(presenceWounded, 'commit') === 'degraded' &&
      presenceStage(presenceWounded, 'hold') === 'degraded';

    // Strained/Spent stamina thresholds, independent of any wound (line
    // 1445-1446): Strained degrades Read, Spent additionally degrades Commit.
    const strained = createCharacterRecord({ id: 'char_strained', stamina: 'strained' });
    results.strainedDegradesReadOnly =
      presenceStage(strained, 'read') === 'degraded' && presenceStage(strained, 'commit') === 'full';
    const spent = createCharacterRecord({ id: 'char_spent', stamina: 'spent' });
    results.spentDegradesCommitToo =
      presenceStage(spent, 'commit') === 'degraded' && presenceStage(spent, 'read') === 'degraded';

    return results;
  });
  ok(woundResults.freshAllFull, 'Fresh, unwounded character: Read/Commit/Hold all full');
  ok(woundResults.headDegradesReadOnly, 'Head wound degrades Read only, not Commit or Hold (line 786)');
  ok(woundResults.weaponArmDegradesCommitOnly, 'Weapon Arm wound degrades Commit only (line 1418)');
  ok(woundResults.weaponArmActSurcharge, 'Weapon Arm wound: a lone Act slot now costs 2 effective slots (line 1466)');
  ok(woundResults.shieldArmDegradesHoldOnly, 'Shield Arm wound degrades Hold only (line 1424)');
  ok(woundResults.legsDegradesHoldOnly, 'Legs wound degrades Hold (line 1424)');
  ok(woundResults.legsMoveSurcharge, 'Legs wound: a lone Move slot now costs 2 effective slots (line 1476)');
  ok(
    woundResults.presenceDegradesAllThree,
    'Presence wound degrades Read AND Commit AND Hold immediately (line 787/1491) — catches the bug where an earlier version only bumped stamina and silently left Commit full'
  );
  ok(woundResults.strainedDegradesReadOnly, 'Strained stamina alone degrades Read but not yet Commit (line 1445)');
  ok(woundResults.spentDegradesCommitToo, 'Spent stamina degrades Commit too, on top of Read (line 1446)');

  console.log('10. Wound-driven slot capacity: surcharges can push a legal-looking declaration over the 3-slot cap');
  const capacityResults = await page.evaluate(() => {
    const { createCharacterRecord } = window.Wonderland.schema;
    const { resolve } = window.Wonderland.engine;
    const results = {};
    let state = { schemaVersion: 2, party: [], characters: {}, worldFlags: {}, politicalNodes: {}, currentEncounter: null };
    state.characters.char_arm = createCharacterRecord({ id: 'char_arm', wounds: ['weaponArm'] });
    state.characters.char_other = createCharacterRecord({ id: 'char_other' });
    state = resolve(state, { type: 'INIT_ENCOUNTER', characterIds: ['char_arm', 'char_other'], location: 'insideBarrier' });

    try {
      resolve(state, { type: 'DECLARE_ACTION', characterId: 'char_arm', slots: ['act', 'react'] });
      results.atCapacity = 'allowed';
    } catch (e) {
      results.atCapacity = 'threw: ' + e.message;
    }
    try {
      resolve(state, { type: 'DECLARE_ACTION', characterId: 'char_arm', slots: ['act', 'move', 'react'] });
      results.overCapacity = 'did not throw';
    } catch (e) {
      results.overCapacity = 'threw: ' + e.message;
    }
    return results;
  });
  ok(capacityResults.atCapacity === 'allowed', 'Weapon Arm + Act+React (3 effective slots) is exactly at capacity and allowed');
  ok(capacityResults.overCapacity !== 'did not throw', 'Weapon Arm + Act+Move+React (4 effective slots) exceeds the 3-slot cap and throws');

  console.log('11. Checkpoint 2 — magic-in-combat casting slot economy (aow_srd.html ch2-combat table)');
  const castResults = await page.evaluate(() => {
    const { createCharacterRecord, createTechnique } = window.Wonderland.schema;
    const { resolve } = window.Wonderland.engine;
    const results = {};

    function freshEncounter(overrides = {}) {
      let state = { schemaVersion: 2, party: [], characters: {}, worldFlags: {}, politicalNodes: {}, currentEncounter: null };
      state.characters.char_caster = createCharacterRecord({ id: 'char_caster', ...overrides });
      state.characters.char_dummy = createCharacterRecord({ id: 'char_dummy' });
      return resolve(state, { type: 'INIT_ENCOUNTER', characterIds: ['char_caster', 'char_dummy'], location: 'insideBarrier' });
    }
    function tryDeclare(state, slots, castTier) {
      try {
        resolve(state, { type: 'DECLARE_ACTION', characterId: 'char_caster', slots, castTier });
        return 'allowed';
      } catch (e) {
        return 'threw: ' + e.message;
      }
    }

    results.t1ActOnly = tryDeclare(freshEncounter(), ['act'], 1);
    results.t1ActPlusMove = tryDeclare(freshEncounter(), ['act', 'move'], 1); // T1 costs Act only — an extra Move is not allowed
    results.t2ActOnly = tryDeclare(freshEncounter(), ['act'], 2); // T2 needs Move locked too
    results.t2ActPlusMove = tryDeclare(freshEncounter(), ['act', 'move'], 2);
    results.t3ActOnly = tryDeclare(freshEncounter(), ['act'], 3); // T3 needs exactly one extra
    results.t3ActPlusMove = tryDeclare(freshEncounter(), ['act', 'move'], 3);
    results.t3ActPlusReact = tryDeclare(freshEncounter(), ['act', 'react'], 3);
    results.t3AllThree = tryDeclare(freshEncounter(), ['act', 'move', 'react'], 3); // two extras, not one — illegal
    results.t4AllThree = tryDeclare(freshEncounter(), ['act', 'move', 'react'], 4);
    results.t4ActPlusMove = tryDeclare(freshEncounter(), ['act', 'move'], 4); // missing React

    // Wand: "all spells are treated one tier lower for slot cost only" (ch2-combat)
    results.wandT2AsT1 = tryDeclare(freshEncounter({ weaponSpecialty: 'wand' }), ['act'], 2);
    results.wandT3AsT2 = tryDeclare(freshEncounter({ weaponSpecialty: 'wand' }), ['act', 'move'], 3);

    // Hybrid casting (technique + cast in one declaration) isn't implemented
    // this checkpoint — must be rejected, not silently allowed.
    const hybridState = freshEncounter({ techniques: [createTechnique({ id: 'tech_x' })] });
    results.hybridRejected = tryDeclare(hybridState, ['act'], 1); // will also carry techniqueId below
    try {
      resolve(hybridState, { type: 'DECLARE_ACTION', characterId: 'char_caster', slots: ['act'], techniqueId: 'tech_x', castTier: 1 });
      results.hybridBothRejected = 'allowed';
    } catch (e) {
      results.hybridBothRejected = 'threw: ' + e.message;
    }

    return results;
  });
  ok(castResults.t1ActOnly === 'allowed', 'T1 spell: Act slot only — allowed (line 777)');
  ok(castResults.t1ActPlusMove !== 'allowed', 'T1 spell: Act+Move — extra Move rejected, T1 costs Act only');
  ok(castResults.t2ActOnly !== 'allowed', 'T2 spell: Act alone rejected — "Act + cannot Move" locks Move too (line 778)');
  ok(castResults.t2ActPlusMove === 'allowed', 'T2 spell: Act+Move — allowed (line 778)');
  ok(castResults.t3ActOnly !== 'allowed', 'T3 spell: Act alone rejected — needs exactly one more slot (line 779)');
  ok(castResults.t3ActPlusMove === 'allowed', 'T3 spell: Act+Move — allowed, Move as the one extra slot (line 779)');
  ok(castResults.t3ActPlusReact === 'allowed', 'T3 spell: Act+React — allowed, React as the one extra slot (line 779)');
  ok(castResults.t3AllThree !== 'allowed', 'T3 spell: Act+Move+React rejected — two extras, only one allowed');
  ok(castResults.t4AllThree === 'allowed', 'T4 spell: all three slots — allowed (line 780)');
  ok(castResults.t4ActPlusMove !== 'allowed', 'T4 spell: Act+Move rejected — missing required React (line 780)');
  ok(castResults.wandT2AsT1 === 'allowed', 'Wand: T2 spell costs Act only, treated as T1 (line 793)');
  ok(castResults.wandT3AsT2 === 'allowed', 'Wand: T3 spell costs Act+Move, treated as T2 (line 793)');
  ok(castResults.hybridBothRejected !== 'allowed', 'Declaring both a technique and a cast in one action is rejected (hybrid casting not implemented this checkpoint)');

  console.log('12. Checkpoint 2 — remaining weapon specialties (Sword/Spear/Staff)');
  const specialtyResults = await page.evaluate(() => {
    const { createCharacterRecord } = window.Wonderland.schema;
    const { resolve, effectiveSlotCount } = window.Wonderland.engine;
    const results = {};

    // Sword: React is free when declared alongside Act (line 1562).
    const sword = createCharacterRecord({ id: 'char_sword', weaponSpecialty: 'sword' });
    const nonSword = createCharacterRecord({ id: 'char_plain' });
    results.swordDiscount = effectiveSlotCount(sword, ['act', 'react']) === 1;
    results.nonSwordNoDiscount = effectiveSlotCount(nonSword, ['act', 'react']) === 2;

    // Spear: opponent must spend Move+React to close (line 1570).
    function spearEncounter() {
      let state = { schemaVersion: 2, party: [], characters: {}, worldFlags: {}, politicalNodes: {}, currentEncounter: null };
      state.characters.char_spear = createCharacterRecord({ id: 'char_spear', weaponSpecialty: 'spear' });
      state.characters.char_closer = createCharacterRecord({ id: 'char_closer' });
      return resolve(state, { type: 'INIT_ENCOUNTER', characterIds: ['char_spear', 'char_closer'], location: 'insideBarrier' });
    }
    try {
      resolve(spearEncounter(), { type: 'DECLARE_ACTION', characterId: 'char_closer', slots: ['move'] });
      results.closeWithMoveOnly = 'allowed';
    } catch (e) {
      results.closeWithMoveOnly = 'threw: ' + e.message;
    }
    try {
      resolve(spearEncounter(), { type: 'DECLARE_ACTION', characterId: 'char_closer', slots: ['move', 'react'] });
      results.closeWithMoveAndReact = 'allowed';
    } catch (e) {
      results.closeWithMoveAndReact = 'threw: ' + e.message;
    }
    // Sanity: Move-only is fine against a non-Spear opponent.
    let plainState = { schemaVersion: 2, party: [], characters: {}, worldFlags: {}, politicalNodes: {}, currentEncounter: null };
    plainState.characters.char_a = createCharacterRecord({ id: 'char_a' });
    plainState.characters.char_b = createCharacterRecord({ id: 'char_b' });
    plainState = resolve(plainState, { type: 'INIT_ENCOUNTER', characterIds: ['char_a', 'char_b'], location: 'insideBarrier' });
    try {
      resolve(plainState, { type: 'DECLARE_ACTION', characterId: 'char_a', slots: ['move'] });
      results.moveOnlyAgainstNonSpear = 'allowed';
    } catch (e) {
      results.moveOnlyAgainstNonSpear = 'threw: ' + e.message;
    }

    // Staff: absorb one wound, once per encounter (line 1586).
    function staffEncounter() {
      let state = { schemaVersion: 2, party: [], characters: {}, worldFlags: {}, politicalNodes: {}, currentEncounter: null };
      state.characters.char_staff = createCharacterRecord({ id: 'char_staff', weaponSpecialty: 'staff' });
      state.characters.char_other = createCharacterRecord({ id: 'char_other' });
      return resolve(state, { type: 'INIT_ENCOUNTER', characterIds: ['char_staff', 'char_other'], location: 'insideBarrier' });
    }
    let s1 = staffEncounter();
    s1 = resolve(s1, { type: 'APPLY_WOUND', characterId: 'char_staff', location: 'legs', absorbedByStaffBarrier: true });
    results.firstAbsorbWoundNotRecorded = s1.characters.char_staff.wounds.length === 0;
    try {
      resolve(s1, { type: 'APPLY_WOUND', characterId: 'char_staff', location: 'legs', absorbedByStaffBarrier: true });
      results.secondAbsorbSameEncounter = 'allowed';
    } catch (e) {
      results.secondAbsorbSameEncounter = 'threw: ' + e.message;
    }
    let s2 = staffEncounter();
    try {
      resolve(s2, { type: 'APPLY_WOUND', characterId: 'char_other', location: 'legs', absorbedByStaffBarrier: true });
      results.nonStaffAbsorb = 'allowed';
    } catch (e) {
      results.nonStaffAbsorb = 'threw: ' + e.message;
    }

    return results;
  });
  ok(specialtyResults.swordDiscount, 'Sword: Act+React costs 1 effective slot, React is free (line 1562)');
  ok(specialtyResults.nonSwordNoDiscount, 'Non-Sword: Act+React costs 2 effective slots, no discount');
  ok(specialtyResults.closeWithMoveOnly !== 'allowed', 'Spear: opponent closing with Move only is rejected (line 1570)');
  ok(specialtyResults.closeWithMoveAndReact === 'allowed', 'Spear: opponent closing with Move+React is allowed (line 1570)');
  ok(specialtyResults.moveOnlyAgainstNonSpear === 'allowed', 'Move-only is fine against a non-Spear opponent (sanity check, not an SRD quote)');
  ok(specialtyResults.firstAbsorbWoundNotRecorded, 'Staff: first absorbed wound is never recorded on the character (line 1586)');
  ok(specialtyResults.secondAbsorbSameEncounter !== 'allowed', 'Staff: barrier already used this encounter, second absorb rejected ("once per encounter")');
  ok(specialtyResults.nonStaffAbsorb !== 'allowed', 'Staff: a non-Staff character cannot use the barrier at all');

  console.log('13. Checkpoint 2 — combat-end threshold (Location and Stakes)');
  const thresholdResults = await page.evaluate(() => {
    const { createCharacterRecord } = window.Wonderland.schema;
    const { isCombatOver } = window.Wonderland.engine;
    const results = {};
    results.spentInsideBarrier = isCombatOver(createCharacterRecord({ stamina: 'spent' }), 'insideBarrier');
    results.threeWoundsInsideBarrier = isCombatOver(
      createCharacterRecord({ wounds: ['legs', 'legs', 'legs'] }),
      'insideBarrier'
    );
    results.twoWoundsFreshInsideBarrier = isCombatOver(
      createCharacterRecord({ wounds: ['legs', 'legs'] }),
      'insideBarrier'
    );
    results.spentOutsideCity = isCombatOver(createCharacterRecord({ stamina: 'spent' }), 'outsideCity');
    return results;
  });
  ok(thresholdResults.spentInsideBarrier === true, 'Inside the barrier: Spent stamina ends combat (line 1623)');
  ok(thresholdResults.threeWoundsInsideBarrier === true, 'Inside the barrier: 3 accumulated wound states ends combat (line 1623)');
  ok(thresholdResults.twoWoundsFreshInsideBarrier === false, 'Inside the barrier: 2 wounds + Fresh stamina does not end combat yet');
  ok(
    thresholdResults.spentOutsideCity === false,
    'Outside the city: Spent stamina does NOT auto-end combat — SRD says combat "can continue past Spent" there, no hard threshold given (line 1631)'
  );

  console.log('14. Checkpoint 2 — Leverage clamp, now per-actor on a political node (corrected in Checkpoint 3 — see below)');
  const leverageResults = await page.evaluate(() => {
    const { createSaveState, createPoliticalNode } = window.Wonderland.schema;
    const { resolve } = window.Wonderland.engine;
    let state = createSaveState();
    state.politicalNodes.cityWatch = createPoliticalNode({ id: 'cityWatch', name: 'City Watch' });
    state = resolve(state, { type: 'MODIFY_LEVERAGE', targetId: 'cityWatch', actorId: 'char_mira', delta: 3 });
    const afterFirst = state.politicalNodes.cityWatch.scores.char_mira;
    state = resolve(state, { type: 'MODIFY_LEVERAGE', targetId: 'cityWatch', actorId: 'char_mira', delta: 3 });
    const afterSecond = state.politicalNodes.cityWatch.scores.char_mira; // 3+3=6, must clamp to 5
    state = resolve(state, { type: 'MODIFY_LEVERAGE', targetId: 'cityWatch', actorId: 'char_mira', delta: -20 });
    const afterFloor = state.politicalNodes.cityWatch.scores.char_mira; // must clamp to -5
    // A second actor's score with the SAME node must be completely
    // independent — this is the actual bug in Checkpoint 2's original
    // design: leverage is per-heir, not party-wide (ch3-leverage: "one
    // score per significant NPC and faction... for the heir").
    state = resolve(state, { type: 'MODIFY_LEVERAGE', targetId: 'cityWatch', actorId: 'char_davan', delta: 2 });
    const secondActorIndependent = state.politicalNodes.cityWatch.scores.char_davan === 2 && state.politicalNodes.cityWatch.scores.char_mira === -5;
    let missingNodeThrew = 'did not throw';
    try { resolve(state, { type: 'MODIFY_LEVERAGE', targetId: 'no_such_node', actorId: 'char_mira', delta: 1 }); }
    catch (e) { missingNodeThrew = 'threw: ' + e.message; }
    return { afterFirst, afterSecond, afterFloor, secondActorIndependent, missingNodeThrew };
  });
  ok(leverageResults.afterFirst === 3, 'Leverage starts at 0 (unset), +3 delta lands at 3');
  ok(leverageResults.afterSecond === 5, 'Leverage clamps at +5 — "No score can exceed +5" (line 972)');
  ok(leverageResults.afterFloor === -5, 'Leverage clamps at -5 — "or fall below -5" (line 972)');
  ok(leverageResults.secondActorIndependent, 'Two different heirs\' leverage with the same node are tracked completely independently (ch3-leverage: leverage is per-heir)');
  ok(leverageResults.missingNodeThrew !== 'did not throw', 'MODIFY_LEVERAGE throws on an unknown political node rather than silently creating one');

  console.log('15. Checkpoint 3 — the real Weight Engine, ported from aow_gm_screen.html');
  const weightEngineResults = await page.evaluate(() => {
    const { createSaveState, createPoliticalNode } = window.Wonderland.schema;
    const { resolve, effectiveThreshold } = window.Wonderland.engine;
    const results = {};

    function freshState() {
      let s = createSaveState();
      s.politicalNodes.cityWatch = createPoliticalNode({ id: 'cityWatch', name: 'City Watch', baseThreshold: 5 });
      return s;
    }

    // T3 favorable: baseWeight=4.5, deltaMag=1 (tier>=3), no fractional carry.
    let s = freshState();
    s = resolve(s, { type: 'LOG_POLITICAL_ACTION', targetId: 'cityWatch', actorId: 'char_mira', tier: 3, direction: 'favorable' });
    results.t3AccumWeight = s.politicalNodes.cityWatch.accumWeight; // 4.5, below threshold 5
    results.t3Score = s.politicalNodes.cityWatch.scores.char_mira; // +1
    results.t3NotTriggeredYet = s.politicalNodes.cityWatch.fireCount === 0;

    // A second T3 favorable action: accumWeight 4.5+4.5=9 >= threshold 5 -> fires, resets to 0.
    s = resolve(s, { type: 'LOG_POLITICAL_ACTION', targetId: 'cityWatch', actorId: 'char_mira', tier: 3, direction: 'favorable' });
    results.t3TriggeredSecondTime = s.politicalNodes.cityWatch.fireCount === 1 && s.politicalNodes.cityWatch.accumWeight === 0;
    results.t3ScoreAfterSecond = s.politicalNodes.cityWatch.scores.char_mira; // +2

    // T1 favorable: fracDelta=0.25, no whole-point movement until it accumulates past 1 (4 actions).
    let f = freshState();
    for (let i = 0; i < 3; i++) f = resolve(f, { type: 'LOG_POLITICAL_ACTION', targetId: 'cityWatch', actorId: 'char_davan', tier: 1, direction: 'favorable' });
    results.t1ThreeActionsNoScoreYet = (f.politicalNodes.cityWatch.scores.char_davan || 0) === 0;
    f = resolve(f, { type: 'LOG_POLITICAL_ACTION', targetId: 'cityWatch', actorId: 'char_davan', tier: 1, direction: 'favorable' });
    results.t1FourthActionCarries = f.politicalNodes.cityWatch.scores.char_davan === 1; // 0.25*4=1.0 -> carries

    // Hostile direction flips the sign.
    let h = freshState();
    h = resolve(h, { type: 'LOG_POLITICAL_ACTION', targetId: 'cityWatch', actorId: 'char_mira', tier: 4, direction: 'hostile' });
    results.hostileIsNegative = h.politicalNodes.cityWatch.scores.char_mira === -1;

    // Escalation: effectiveThreshold = max(2, baseThreshold - fireCount) — a node that keeps firing gets twitchier.
    const escalatedNode = { baseThreshold: 5, fireCount: 4 };
    results.escalatedThreshold = effectiveThreshold(escalatedNode) === 2; // floored at 2, not 5-4=1
    const freshNode = { baseThreshold: 5, fireCount: 0 };
    results.freshThreshold = effectiveThreshold(freshNode) === 5;

    // Bad tier/direction fail loudly rather than silently doing nothing.
    let badResults = {};
    try { resolve(freshState(), { type: 'LOG_POLITICAL_ACTION', targetId: 'cityWatch', actorId: 'char_mira', tier: 7, direction: 'favorable' }); badResults.badTier = 'did not throw'; }
    catch (e) { badResults.badTier = 'threw'; }
    try { resolve(freshState(), { type: 'LOG_POLITICAL_ACTION', targetId: 'cityWatch', actorId: 'char_mira', tier: 3, direction: 'neutral' }); badResults.badDirection = 'did not throw'; }
    catch (e) { badResults.badDirection = 'threw'; }
    results.badTierThrew = badResults.badTier === 'threw';
    results.badDirectionThrew = badResults.badDirection === 'threw';

    return results;
  });
  ok(weightEngineResults.t3AccumWeight === 4.5, 'T3 political action: baseWeight = tier*1.5 = 4.5, accumulated on the node');
  ok(weightEngineResults.t3Score === 1, 'T3 favorable: score moves a full +1 (tier>=3 uses deltaMag, not fractional)');
  ok(weightEngineResults.t3NotTriggeredYet, 'One T3 action (4.5 weight) does not yet cross a threshold-5 node');
  ok(weightEngineResults.t3TriggeredSecondTime, 'A second T3 action crosses threshold (9 >= 5): fires once, accumWeight resets to 0');
  ok(weightEngineResults.t3ScoreAfterSecond === 2, 'Score keeps accumulating across exchanges independent of the trigger firing (+1 then +1 = 2)');
  ok(weightEngineResults.t1ThreeActionsNoScoreYet, 'T1 actions move score by a 0.25 fraction each — three of them (0.75 total) haven\'t carried into a whole point yet');
  ok(weightEngineResults.t1FourthActionCarries, 'The fourth T1 action (0.25*4=1.0) carries into a whole +1 point, exactly as the real tool\'s fractional-carry logic does');
  ok(weightEngineResults.hostileIsNegative, 'Hostile direction flips the sign — a T4 hostile action moves score by -1');
  ok(weightEngineResults.escalatedThreshold, 'effectiveThreshold: a node that has fired 4 times off a base-5 threshold is floored at 2, not (5-4)=1 or less');
  ok(weightEngineResults.freshThreshold, 'effectiveThreshold: an unfired node uses its base threshold unchanged');
  ok(weightEngineResults.badTierThrew, 'LOG_POLITICAL_ACTION throws on a tier outside 1-5 rather than silently no-op-ing');
  ok(weightEngineResults.badDirectionThrew, 'LOG_POLITICAL_ACTION throws on an unknown direction rather than silently no-op-ing');

  console.log('16. Checkpoint 3 — Capstone application (aow_heir_record.html CAPSTONES)');
  const capstoneResults = await page.evaluate(() => {
    const { createSaveState, createCharacterRecord, createPoliticalNode } = window.Wonderland.schema;
    const { resolve } = window.Wonderland.engine;
    const results = {};

    function freshState() {
      let s = createSaveState();
      s.characters.char_mira = createCharacterRecord({
        id: 'char_mira',
        capstone: {
          aspect: 'combat',
          leverageBonus: { key: 'cityWatch', amount: 2 },
          leveragePenalty: [{ key: 'scholarsGuild', amount: 1 }, { key: 'churchOfAxiom', amount: 1 }],
          usedThisSession: false,
        },
      });
      s.politicalNodes.cityWatch = createPoliticalNode({ id: 'cityWatch' });
      s.politicalNodes.scholarsGuild = createPoliticalNode({ id: 'scholarsGuild' });
      s.politicalNodes.churchOfAxiom = createPoliticalNode({ id: 'churchOfAxiom' });
      return s;
    }

    let s = freshState();
    s = resolve(s, { type: 'APPLY_CAPSTONE', characterId: 'char_mira' });
    results.bonusApplied = s.politicalNodes.cityWatch.scores.char_mira === 2;
    results.penaltiesApplied = s.politicalNodes.scholarsGuild.scores.char_mira === -1 && s.politicalNodes.churchOfAxiom.scores.char_mira === -1;
    results.markedUsed = s.characters.char_mira.capstone.usedThisSession === true;

    let secondUse = 'allowed';
    try { resolve(s, { type: 'APPLY_CAPSTONE', characterId: 'char_mira' }); }
    catch (e) { secondUse = 'threw: ' + e.message; }
    results.secondUseRejected = secondUse !== 'allowed';

    s = resolve(s, { type: 'RESET_CAPSTONE_USAGE', characterId: 'char_mira' });
    let afterReset = 'threw';
    try {
      s = resolve(s, { type: 'APPLY_CAPSTONE', characterId: 'char_mira' });
      afterReset = 'allowed';
    } catch (e) { /* leave as 'threw' */ }
    results.usableAgainAfterReset = afterReset === 'allowed';

    let noCapstoneState = createSaveState();
    noCapstoneState.characters.char_davan = createCharacterRecord({ id: 'char_davan' }); // capstone: null by default
    let noCapstoneResult = 'allowed';
    try { resolve(noCapstoneState, { type: 'APPLY_CAPSTONE', characterId: 'char_davan' }); }
    catch (e) { noCapstoneResult = 'threw: ' + e.message; }
    results.noCapstoneRejected = noCapstoneResult !== 'allowed';

    return results;
  });
  ok(capstoneResults.bonusApplied, 'Capstone leverageBonus applies to the named node (line 960: cityWatch +2)');
  ok(capstoneResults.penaltiesApplied, 'Capstone leveragePenalty applies to every named node (line 961: scholarsGuild -1, churchOfAxiom -1)');
  ok(capstoneResults.markedUsed, 'Capstone marks usedThisSession true after use');
  ok(capstoneResults.secondUseRejected, 'A second APPLY_CAPSTONE in the same session is rejected ("once per session")');
  ok(capstoneResults.usableAgainAfterReset, 'RESET_CAPSTONE_USAGE clears the flag, making the capstone usable again next session');
  ok(capstoneResults.noCapstoneRejected, 'A character with no capstone (the common case — only five-year single-aspect commitment grants one) is rejected, not silently no-op\'d');

  console.log('17. Checkpoint 3 — real heir-record import adapter (aow_heir_record.html export shape)');
  const importResults = await page.evaluate(() => {
    const { importHeirRecord } = window.Wonderland.importHeirRecord;
    const results = {};

    // Fixture built from the REAL export shape read directly out of
    // aow_heir_record.html's own `const record={...}` construction
    // (identity/house/awakening/combatProfile/capstone/startingLeverage/
    // npcs) — not an invented shape.
    const fixture = {
      version: '1.1',
      identity: { givenName: 'Mira', name: 'Mira of House Ashvane', houseName: 'Ashvane', councillorTitle: 'Warden of the Docks' },
      house: { name: 'Ashvane', ideal1: 'Duty', ideal2: 'Precision', heirStanding: 'firstborn' },
      awakening: { revealedSchool: 'DOM', magicStudyYears: 2, startingSpells: ['Kindle', 'Old Grant (adjacent)'] },
      combatProfile: { weaponSpecialty: 'Sword', fightingStyle: 'Duelist-Mage', signatureTechnique: 'Riposte', presenceLevel: 'Trained' },
      capstone: { aspect: 'combat', leverageBonus: { key: 'cityWatch', amount: 2 }, leveragePenalty: [{ key: 'scholarsGuild', amount: 1 }] },
      startingLeverage: { cityWatch: 1, kingHector: 0 },
      npcs: {
        councillor: { name: 'Lord Denic', reputation: 'stern', goal: 'stability', fear: 'scandal', expects: 'discretion' },
        rival: { name: 'Ser Calen', faction: 'House Voss', want: 'the docks contract', leverage: 'knows about the smuggling' },
      },
    };
    const result = importHeirRecord(fixture);
    results.characterId = result.character.id;
    results.weaponSpecialtyLowercased = result.character.weaponSpecialty === 'sword';
    results.signatureTechniqueHasNullTrigger = result.character.techniques[0].trigger === null;
    results.signatureTechniqueKeepsRawText = result.character.techniques[0].rawTriggerText === 'Defined by fighting style — confirm with GM';
    results.adjacentSpellSkipped = result.character.spells.length === 1 && result.character.spells[0].name === 'Kindle';
    results.warnedAboutSkippedSpell = result.warnings.some((w) => w.includes('Old Grant'));
    results.houseIdDerived = result.house.id === 'ashvane';
    results.contactsImported = result.character.contacts.length === 2 && result.character.contacts.some((c) => c.type === 'rival');
    results.startingLeveragePassedThrough = result.startingLeverage.cityWatch === 1;

    // Round-trip the imported character through schema.js's own JSON
    // check — the imported record must be exactly as plain/serializable
    // as anything created directly through createCharacterRecord.
    results.jsonRoundTripsCleanly = JSON.stringify(JSON.parse(JSON.stringify(result.character))) === JSON.stringify(result.character);

    let missingFieldsResult = 'allowed';
    try { importHeirRecord({ identity: {}, awakening: {} }); }
    catch (e) { missingFieldsResult = 'threw: ' + e.message; }
    results.missingRequiredFieldsRejected = missingFieldsResult !== 'allowed';

    return results;
  });
  ok(importResults.characterId === 'mira', 'Imported character gets a slugified id from the heir\'s given name');
  ok(importResults.weaponSpecialtyLowercased, 'weaponSpecialty normalizes "Sword" -> "sword" to match WEAPON_SPECIALTIES');
  ok(importResults.signatureTechniqueHasNullTrigger, 'Imported signature technique has trigger: null — never a guessed structured predicate');
  ok(importResults.signatureTechniqueKeepsRawText, 'Imported signature technique keeps the real placeholder text verbatim (matches aow_play_sheet.html exactly)');
  ok(importResults.adjacentSpellSkipped, 'A spell tagged "(adjacent)" by the retired auto-grant rule is skipped on import, matching aow_play_sheet.html\'s own fix');
  ok(importResults.warnedAboutSkippedSpell, 'The skip is surfaced as a warning, not silent');
  ok(importResults.houseIdDerived, 'House id is slugified from the real house name');
  ok(importResults.contactsImported, 'Councillor and rival both import as contacts, with the rival correctly typed');
  ok(importResults.startingLeveragePassedThrough, 'startingLeverage passes through for the caller to apply via MODIFY_LEVERAGE once nodes exist');
  ok(importResults.jsonRoundTripsCleanly, 'The imported character is exactly as plain/JSON-serializable as one built directly through createCharacterRecord');
  ok(importResults.missingRequiredFieldsRejected, 'importHeirRecord throws on a record missing name/revealed school, matching the real tool\'s own validation');

  console.log('18. Checkpoint 4/5 — the real six-house registry (5 real player houses + 1 authored to complete the roster)');
  const houseResults = await page.evaluate(() => {
    const { createSaveState, createCharacterRecord, createPoliticalNode } = window.Wonderland.schema;
    const { resolve } = window.Wonderland.engine;
    const { SIX_HOUSES, houseAethra, houseYe, houseLightwell } = window.Wonderland.houses;
    const results = {};

    // Structural: exactly six houses, one per SRD district-type, no
    // duplicates — the whole point of the Lionheart reassignment.
    results.exactlySixHouses = SIX_HOUSES.length === 6;
    const districts = SIX_HOUSES.map((h) => h.district);
    results.sixDistinctDistricts = new Set(districts).size === 6;
    results.allSixTypesRepresented = ['military', 'mercantile', 'religious', 'scholarly', 'agricultural', 'magical'].every((d) => districts.includes(d));
    results.everyHouseHasAbilityAndForm = SIX_HOUSES.every((h) => h.abilities.length >= 1 && h.transformationForms.length >= 1);
    results.everyAbilityHouseThemeTagged = SIX_HOUSES.every((h) => h.abilities.every((a) => !!a.houseTheme) && !!h.transformationForms[0].grantedTechnique.houseTheme);
    // WONDERLAND_RPG_FLAGSHIP_DESIGN.md §5's actual ability taxonomy,
    // reconciled in after this content already existed: every ability and
    // every Transformation-granted technique must carry a firstPrinciple
    // that's one of the four canonical values exactly, not just non-empty.
    const FIRST_PRINCIPLES = window.Wonderland.schema.FIRST_PRINCIPLES;
    results.everyAbilityFirstPrincipleValid = SIX_HOUSES.every((h) =>
      h.abilities.every((a) => FIRST_PRINCIPLES.includes(a.firstPrinciple)) &&
      FIRST_PRINCIPLES.includes(h.transformationForms[0].grantedTechnique.firstPrinciple)
    );

    function freshEncounterState() {
      let s = createSaveState();
      s.politicalNodes.archivistGeneral = createPoliticalNode({ id: 'archivistGeneral' });
      s.politicalNodes.merchantConsortium = createPoliticalNode({ id: 'merchantConsortium' });
      return s;
    }

    // Full vertical slice on House Aethra (Miran's real house):
    // woundCountAtLeast-gated Transformation, both the base ability and
    // the granted technique actually resolving through real exchanges.
    let s = freshEncounterState();
    s.characters.char_miran = createCharacterRecord({ id: 'char_miran', houseId: houseAethra.id, weaponSpecialty: 'sword' });
    s.characters.char_davan = createCharacterRecord({ id: 'char_davan' });
    s = resolve(s, { type: 'GRANT_TECHNIQUE', characterId: 'char_miran', technique: houseAethra.abilities[0] });
    results.aethraAbilityGranted = s.characters.char_miran.techniques.some((t) => t.id === 'tech_aethra_spy_opening');

    s = resolve(s, { type: 'INIT_ENCOUNTER', characterIds: ['char_miran', 'char_davan'], location: 'insideBarrier' });
    s = resolve(s, { type: 'DECLARE_ACTION', characterId: 'char_davan', slots: ['act'] });
    s = resolve(s, { type: 'DECLARE_ACTION', characterId: 'char_miran', slots: ['move'], techniqueId: 'tech_aethra_spy_opening' });
    s = resolve(s, { type: 'RESOLVE_EXCHANGE' });
    const miranAction1 = s.currentEncounter.log[0].resolvedActions.find((a) => a.characterId === 'char_miran');
    results.aethraAbilityResolvedInCombat = miranAction1.techniqueId === 'tech_aethra_spy_opening' && miranAction1.triggerMet === true;

    let blockedBeforeWounds = 'allowed';
    try { resolve(s, { type: 'ACTIVATE_TRANSFORMATION', characterId: 'char_miran', transformationForm: houseAethra.transformationForms[0] }); }
    catch (e) { blockedBeforeWounds = 'threw'; }
    results.aethraTransformationBlockedBeforeWounds = blockedBeforeWounds === 'threw';

    s = resolve(s, { type: 'APPLY_WOUND', characterId: 'char_miran', location: 'legs' });
    s = resolve(s, { type: 'APPLY_WOUND', characterId: 'char_miran', location: 'torso' });
    s = resolve(s, { type: 'ACTIVATE_TRANSFORMATION', characterId: 'char_miran', transformationForm: houseAethra.transformationForms[0] });
    results.aethraTransformationActivated = s.characters.char_miran.activeTransformationId === 'form_aethra_regents_reckoning';
    results.aethraBonusTechniqueGranted = s.characters.char_miran.techniques.some((t) => t.id === 'tech_aethra_spellweave');

    let reActivate = 'allowed';
    try { resolve(s, { type: 'ACTIVATE_TRANSFORMATION', characterId: 'char_miran', transformationForm: houseAethra.transformationForms[0] }); }
    catch (e) { reActivate = 'threw'; }
    results.aethraReActivationRejected = reActivate === 'threw';

    // The granted technique's real structured trigger (opponent commits
    // Act+Move) actually gets evaluated in a real exchange.
    s = resolve(s, { type: 'DECLARE_ACTION', characterId: 'char_davan', slots: ['act', 'move'] });
    s = resolve(s, { type: 'DECLARE_ACTION', characterId: 'char_miran', slots: ['act', 'react'], techniqueId: 'tech_aethra_spellweave' });
    s = resolve(s, { type: 'RESOLVE_EXCHANGE' });
    const miranAction2 = s.currentEncounter.log[1].resolvedActions.find((a) => a.characterId === 'char_miran');
    results.aethraGrantedTechniqueResolvedInCombat = miranAction2.techniqueId === 'tech_aethra_spellweave' && miranAction2.triggerMet === true;

    // House Ye: leverageAtLeast-gated Transformation (a second unlock
    // condition type, exercised against a real political node).
    let sYe = freshEncounterState();
    sYe.characters.char_ye = createCharacterRecord({ id: 'char_ye', houseId: houseYe.id });
    let yeBlocked = 'allowed';
    try { resolve(sYe, { type: 'ACTIVATE_TRANSFORMATION', characterId: 'char_ye', transformationForm: houseYe.transformationForms[0] }); }
    catch (e) { yeBlocked = 'threw'; }
    results.yeBlockedBeforeLeverage = yeBlocked === 'threw';
    sYe = resolve(sYe, { type: 'MODIFY_LEVERAGE', targetId: 'archivistGeneral', actorId: 'char_ye', delta: 2 });
    sYe = resolve(sYe, { type: 'ACTIVATE_TRANSFORMATION', characterId: 'char_ye', transformationForm: houseYe.transformationForms[0] });
    results.yeTransformationAfterLeverage = sYe.characters.char_ye.activeTransformationId === 'form_ye_third_heirs_gambit';

    // House Lightwell: staminaAtLeast-gated Transformation (the third
    // unlock condition type).
    let sLw = freshEncounterState();
    sLw.characters.char_griffith = createCharacterRecord({ id: 'char_griffith', houseId: houseLightwell.id, stamina: 'winded' });
    let lwBlocked = 'allowed';
    try { resolve(sLw, { type: 'ACTIVATE_TRANSFORMATION', characterId: 'char_griffith', transformationForm: houseLightwell.transformationForms[0] }); }
    catch (e) { lwBlocked = 'threw'; }
    results.lightwellBlockedBeforeStrained = lwBlocked === 'threw';
    sLw = resolve(sLw, { type: 'SET_STAMINA', characterId: 'char_griffith', stamina: 'strained' });
    sLw = resolve(sLw, { type: 'ACTIVATE_TRANSFORMATION', characterId: 'char_griffith', transformationForm: houseLightwell.transformationForms[0] });
    results.lightwellTransformationAfterStrained = sLw.characters.char_griffith.activeTransformationId === 'form_lightwell_reverence_undimmed';

    return results;
  });
  ok(houseResults.exactlySixHouses, 'The registry has exactly six houses');
  ok(houseResults.sixDistinctDistricts, 'All six houses have distinct district types — no duplicates (the Lionheart reassignment resolved the real overlap)');
  ok(houseResults.allSixTypesRepresented, 'All six SRD district-types are represented: military, mercantile, religious, scholarly, agricultural, magical');
  ok(houseResults.everyHouseHasAbilityAndForm, 'Every house has at least one themed ability and one Transformation form');
  ok(houseResults.everyAbilityHouseThemeTagged, 'Every ability and every Transformation-granted technique carries a non-empty houseTheme tag');
  ok(houseResults.everyAbilityFirstPrincipleValid, 'Every ability and every Transformation-granted technique carries a firstPrinciple that is one of the four design-doc-canonical values');
  ok(houseResults.aethraAbilityGranted, "House Aethra: GRANT_TECHNIQUE attaches Miran's real house ability as a real Technique");
  ok(houseResults.aethraAbilityResolvedInCombat, "House Aethra: the granted ability actually resolves through a real exchange, not just sitting inert in the array");
  ok(houseResults.aethraTransformationBlockedBeforeWounds, "House Aethra: Transformation blocked before 2 wounds are accumulated (grounded in the founding battle's real cost)");
  ok(houseResults.aethraTransformationActivated, 'House Aethra: Transformation activates once the condition is met');
  ok(houseResults.aethraBonusTechniqueGranted, 'House Aethra: activating the Transformation grants its bonus technique');
  ok(houseResults.aethraReActivationRejected, 'House Aethra: the same Transformation cannot be activated twice');
  ok(houseResults.aethraGrantedTechniqueResolvedInCombat, "House Aethra: the granted technique's real structured trigger (opponent commits Act+Move) resolves through a real exchange — the full vertical slice");
  ok(houseResults.yeBlockedBeforeLeverage, 'House Ye: Transformation blocked before leverage with the Archivist General is earned');
  ok(houseResults.yeTransformationAfterLeverage, 'House Ye: Transformation activates once real political leverage (leverageAtLeast) is met — a second unlock-condition type, proven against a real political node');
  ok(houseResults.lightwellBlockedBeforeStrained, 'House Lightwell: Transformation blocked before Strained stamina is reached');
  ok(houseResults.lightwellTransformationAfterStrained, 'House Lightwell: Transformation activates once Strained (staminaAtLeast) is met — the third unlock-condition type');

  console.log('19. Ripple propagation, ported from aow_gm_screen.html\'s real propagateWeight() — real WORLD_NPCS content, not placeholder');
  const rippleResults = await page.evaluate(() => {
    const { createSaveState } = window.Wonderland.schema;
    const { resolve, getNodeConductors } = window.Wonderland.engine;
    const { WORLD_NPCS, createPoliticalNodeFromWorldNpc } = window.Wonderland.worldNpcs;
    const results = {};

    function seedAllNpcs() {
      let s = createSaveState();
      WORLD_NPCS.forEach((npc) => { s.politicalNodes[npc.key] = createPoliticalNodeFromWorldNpc(npc); });
      return s;
    }

    // Hand-traced case #1: the real mutual-ally edge kingHector <-> royalChamberlain.
    // T4 favorable on kingHector: baseWeight=6, direct score +1, direct
    // accumWeight=6 (threshold 8, no trigger). Ripple depth1 weight=6*0.6=3.6
    // to royalChamberlain (its only conductor, allied) -> accumWeight 3.6,
    // sentiment fractional += 0.25 (no carry yet). Depth2 ripple back to
    // kingHector at 3.6*0.5=1.8 -> kingHector accumWeight 6+1.8=7.8 (still
    // under threshold 8), no sentiment ripple at depth2 (allied-only-at-depth-1 rule).
    let s1 = seedAllNpcs();
    s1 = resolve(s1, { type: 'LOG_POLITICAL_ACTION', targetId: 'kingHector', actorId: 'char_mira', tier: 4, direction: 'favorable' });
    results.kingHectorAccumWeight = s1.politicalNodes.kingHector.accumWeight; // 7.8
    results.kingHectorScore = s1.politicalNodes.kingHector.scores.char_mira; // 1 (direct only, ripple never touched its own score)
    results.chamberlainAccumWeight = s1.politicalNodes.royalChamberlain.accumWeight; // 3.6
    results.chamberlainFractional = s1.politicalNodes.royalChamberlain.fractional.char_mira; // 0.25
    results.chamberlainScoreUntouched = (s1.politicalNodes.royalChamberlain.scores.char_mira || 0) === 0; // fractional hasn't carried yet

    // Hand-traced case #2: outskirtsBroker's real 'all' conductors shorthand,
    // driven through the full real 9-node graph, tier 5 favorable.
    // Direct effect: baseWeight=7.5 >= threshold 3 (special) -> triggers
    // immediately, fireCount 1, accumWeight resets to 0, score +2 (tier 5).
    // Ripple depth1 weight = 7.5*0.6=4.5 to its top-3 ranked conductors —
    // with all scores/weights tied at 0, ties break by declaration order:
    // kingHector, royalChamberlain, merchantConsortium (the other 5 real
    // NPCs are NOT reached by this specific cascade).
    let s2 = seedAllNpcs();
    s2 = resolve(s2, { type: 'LOG_POLITICAL_ACTION', targetId: 'outskirtsBroker', actorId: 'char_mira', tier: 5, direction: 'favorable' });
    results.brokerFireCount = s2.politicalNodes.outskirtsBroker.fireCount; // 2 — fires AGAIN mid-cascade, see below
    results.brokerAccumWeight = s2.politicalNodes.outskirtsBroker.accumWeight; // 0
    results.brokerScore = s2.politicalNodes.outskirtsBroker.scores.char_mira; // 2, direct effect only
    results.kingHectorViaAll = s2.politicalNodes.kingHector.accumWeight; // 6.75 (4.5 depth1 + 2.25 depth2-back via royalChamberlain)
    results.chamberlainViaAll = s2.politicalNodes.royalChamberlain.accumWeight; // 6.75, symmetric
    results.merchantViaAll = s2.politicalNodes.merchantConsortium.accumWeight; // 4.5, depth1 only (its depth2 targets differ)
    results.dockworkersViaAll = s2.politicalNodes.dockworkersForeman.accumWeight; // 2.25, reached at depth2 via merchantConsortium
    results.watchCommanderUntouched = s2.politicalNodes.watchCommander.accumWeight === 0;
    results.courierMasterUntouched = s2.politicalNodes.courierMaster.accumWeight === 0;
    results.highPriestUntouched = s2.politicalNodes.highPriest.accumWeight === 0;
    results.archivistUntouched = s2.politicalNodes.archivistGeneral.accumWeight === 0;
    // outskirtsBroker's OWN accumWeight got hit again mid-cascade (via
    // merchantConsortium's depth-2 branch, since outskirtsBroker is one of
    // merchantConsortium's declared conductors) — crossing its escalated
    // threshold (max(2, 3-1)=2) a second time in the same action. This is
    // real, faithfully-ported behavior, not a bug: a node can be revisited
    // through a different path within the same cascade.
    results.brokerDoubleTriggered = s2.politicalNodes.outskirtsBroker.fireCount === 2;

    // getNodeConductors: the 'all' shorthand excludes self and types everyone 'neutral'.
    const brokerConductors = getNodeConductors(s2.politicalNodes.outskirtsBroker, Object.keys(s2.politicalNodes));
    results.allShorthandExcludesSelf = !brokerConductors.some((c) => c.key === 'outskirtsBroker');
    results.allShorthandCount = brokerConductors.length === 8; // 9 real NPCs minus itself
    results.allShorthandTypedNeutral = brokerConductors.every((c) => c.type === 'neutral');

    // Depth/weight cutoffs, isolated from the real graph — a synthetic
    // 4-node chain (A -> B -> C -> D) to prove propagation stops at depth 2
    // and never reaches D, and that a too-small starting weight is a no-op.
    const { createSaveState: createSave2, createPoliticalNode } = window.Wonderland.schema;
    const { propagateWeight } = window.Wonderland.engine;
    let chain = createSave2();
    chain.politicalNodes.A = createPoliticalNode({ id: 'A', conductors: [{ key: 'B', type: 'neutral' }] });
    // baseThreshold set high on all three so this test isolates the
    // depth/weight cutoffs from the trigger-and-reset behavior (already
    // covered above) — otherwise B would cross the default threshold of
    // 5, fire, and reset its own accumWeight back to 0 before we could
    // observe it.
    chain.politicalNodes.B = createPoliticalNode({ id: 'B', baseThreshold: 1000, conductors: [{ key: 'C', type: 'neutral' }] });
    chain.politicalNodes.C = createPoliticalNode({ id: 'C', baseThreshold: 1000, conductors: [{ key: 'D', type: 'neutral' }] });
    chain.politicalNodes.D = createPoliticalNode({ id: 'D', baseThreshold: 1000, conductors: [] });
    propagateWeight(chain.politicalNodes, 'A', 10, 'char_x', 1, 1); // depth1: B; depth2: C; depth3 would be D but is blocked
    results.chainReachesB = chain.politicalNodes.B.accumWeight === 10;
    results.chainReachesC = chain.politicalNodes.C.accumWeight === 5; // 10*0.5
    results.chainNeverReachesD = chain.politicalNodes.D.accumWeight === 0;

    let weakChain = createSave2();
    weakChain.politicalNodes.A = createPoliticalNode({ id: 'A', conductors: [{ key: 'B', type: 'neutral' }] });
    weakChain.politicalNodes.B = createPoliticalNode({ id: 'B', conductors: [] });
    propagateWeight(weakChain.politicalNodes, 'A', 0.29, 'char_x', 1, 1); // below the 0.3 floor
    results.tooWeakToRippleAtAll = weakChain.politicalNodes.B.accumWeight === 0;

    // Top-3-per-call cutoff: a node with 5 conductors, pre-seeded so their
    // rank (accumWeight + |score|) is strictly ordered — only the top 3
    // should receive this call's ripple weight.
    let fanOut = createSave2();
    fanOut.politicalNodes.hub = createPoliticalNode({
      id: 'hub',
      conductors: [
        { key: 'n1', type: 'neutral' }, { key: 'n2', type: 'neutral' }, { key: 'n3', type: 'neutral' },
        { key: 'n4', type: 'neutral' }, { key: 'n5', type: 'neutral' },
      ],
    });
    // baseThreshold set high here too, same reason as the chain test above
    // — n1's pre-seeded accumWeight(5) plus this call's weight(1) would
    // otherwise cross the default threshold of 5 and reset to 0.
    fanOut.politicalNodes.n1 = createPoliticalNode({ id: 'n1', baseThreshold: 1000, accumWeight: 5 });
    fanOut.politicalNodes.n2 = createPoliticalNode({ id: 'n2', baseThreshold: 1000, accumWeight: 4 });
    fanOut.politicalNodes.n3 = createPoliticalNode({ id: 'n3', baseThreshold: 1000, accumWeight: 3 });
    fanOut.politicalNodes.n4 = createPoliticalNode({ id: 'n4', baseThreshold: 1000, accumWeight: 2 });
    fanOut.politicalNodes.n5 = createPoliticalNode({ id: 'n5', baseThreshold: 1000, accumWeight: 1 });
    propagateWeight(fanOut.politicalNodes, 'hub', 1, 'char_x', 1, 1);
    results.top3Ranked = fanOut.politicalNodes.n1.accumWeight === 6 && fanOut.politicalNodes.n2.accumWeight === 5 && fanOut.politicalNodes.n3.accumWeight === 4;
    results.bottom2NotRippled = fanOut.politicalNodes.n4.accumWeight === 2 && fanOut.politicalNodes.n5.accumWeight === 1;

    return results;
  });
  ok(approxEqual(rippleResults.kingHectorAccumWeight, 7.8), 'kingHector: direct accumWeight(6) + depth-2 ripple-back(1.8) = 7.8, hand-traced against the real formula');
  ok(rippleResults.kingHectorScore === 1, 'kingHector: score moves only from the direct effect (+1), never from ripple to itself');
  ok(approxEqual(rippleResults.chamberlainAccumWeight, 3.6), 'royalChamberlain: depth-1 ripple weight = baseWeight(6)*0.6 = 3.6, its only conductor');
  ok(rippleResults.chamberlainFractional === 0.25, 'royalChamberlain: sentiment ripple on the allied edge at depth 1 adds a 0.25 fractional nudge');
  ok(rippleResults.chamberlainScoreUntouched, 'royalChamberlain: the 0.25 fractional hasn\'t carried into a whole score point yet');
  ok(rippleResults.brokerAccumWeight === 0 && rippleResults.brokerScore === 2, 'outskirtsBroker: direct T5 effect triggers immediately (weight 7.5 >= threshold 3) and moves score by the full deltaMag(2)');
  ok(approxEqual(rippleResults.kingHectorViaAll, 6.75), 'Full 9-node graph: kingHector reached via the \'all\' shorthand (4.5 depth-1 + 2.25 depth-2 back through royalChamberlain) = 6.75');
  ok(approxEqual(rippleResults.chamberlainViaAll, 6.75), 'Full 9-node graph: royalChamberlain symmetric to kingHector, same 6.75');
  ok(approxEqual(rippleResults.merchantViaAll, 4.5), 'Full 9-node graph: merchantConsortium reached at depth 1 only = 4.5');
  ok(approxEqual(rippleResults.dockworkersViaAll, 2.25), 'Full 9-node graph: dockworkersForeman reached at depth 2 via merchantConsortium\'s own conductor list = 2.25');
  ok(
    rippleResults.watchCommanderUntouched && rippleResults.courierMasterUntouched && rippleResults.highPriestUntouched && rippleResults.archivistUntouched,
    'Full 9-node graph: the 4 real NPCs outside this specific cascade\'s reach stay completely untouched — ripple doesn\'t flood the whole graph'
  );
  ok(rippleResults.brokerDoubleTriggered, 'outskirtsBroker fires TWICE in one action: once from the direct effect, once more mid-cascade via merchantConsortium\'s depth-2 branch looping back — real, faithfully-ported behavior, not a bug');
  ok(rippleResults.allShorthandExcludesSelf, "getNodeConductors('all'): excludes the node itself");
  ok(rippleResults.allShorthandCount, "getNodeConductors('all'): returns all 8 other real NPCs");
  ok(rippleResults.allShorthandTypedNeutral, "getNodeConductors('all'): every edge types as 'neutral', regardless of the other node's own declared relationship");
  ok(rippleResults.chainReachesB && rippleResults.chainReachesC, 'Synthetic A->B->C->D chain: weight halves and reaches exactly 2 hops (B at depth1, C at depth2)');
  ok(rippleResults.chainNeverReachesD, 'Synthetic A->B->C->D chain: D (depth 3) is never reached — the depth>2 cutoff is real');
  ok(rippleResults.tooWeakToRippleAtAll, 'A starting weight below 0.3 never ripples at all');
  ok(rippleResults.top3Ranked, 'Fan-out of 5 conductors: only the top 3 by rank (accumWeight+|score|) receive this call\'s ripple weight');
  ok(rippleResults.bottom2NotRippled, 'Fan-out of 5 conductors: the bottom 2 by rank are untouched by this call');

  console.log('20. Checkpoint 6 — worldFlags get real behavior, and the World State bridge proves real cross-session continuity');
  const worldStateResults = await page.evaluate(async () => {
    const { createSaveState, createCharacterRecord, createPoliticalNode } = window.Wonderland.schema;
    const { resolve } = window.Wonderland.engine;
    const { exportWorldState, importWorldState } = window.Wonderland.worldStateBridge;
    const p = window.Wonderland.persistence;
    const results = {};

    // worldFlagEquals as a Transformation unlock condition — the flag
    // itself is grounded in House Aethra's real, established shadow
    // content (Miran's resistance-network smuggling), not invented fresh.
    const resistanceForm = {
      id: 'form_test_resistance_favor',
      unlockCondition: { type: 'worldFlagEquals', flagId: 'aided_resistance_network', value: true },
      grantedTechnique: { id: 'tech_test_network_favor', name: 'Network Favor' },
    };

    // ═══ "Session A" — set real state, export it, write it to real IndexedDB ═══
    let sessionA = createSaveState();
    sessionA = resolve(sessionA, { type: 'SET_WORLD_FLAG', flagId: 'aided_resistance_network', value: true });
    sessionA.politicalNodes.archivistGeneral = createPoliticalNode({ id: 'archivistGeneral' });
    sessionA.characters.char_a = createCharacterRecord({ id: 'char_a' });
    sessionA = resolve(sessionA, { type: 'MODIFY_LEVERAGE', targetId: 'archivistGeneral', actorId: 'char_a', delta: 3 });

    const exported = exportWorldState(sessionA);
    results.exportedExpectedKeys = exported.length === 2 && exported.some((r) => r.key === 'choice:aided_resistance_network') && exported.some((r) => r.key === 'entity:archivistGeneral');
    for (const { key, record } of exported) {
      await p.putEntity(key, record);
    }

    // ═══ "Session B" — a completely fresh SaveState, hydrated from what
    // was actually written to real IndexedDB, not passed in memory ═══
    const fetchedRecords = await Promise.all(exported.map(async ({ key }) => ({ record: await p.getEntity(key) })));
    const hydrated = importWorldState(fetchedRecords);
    results.hydratedFlagCarriedOver = hydrated.worldFlags.aided_resistance_network === true;
    results.hydratedLeverageCarriedOver = hydrated.politicalNodes.archivistGeneral.scores.char_a === 3;

    let sessionB = createSaveState();
    sessionB = Object.assign(sessionB, { worldFlags: hydrated.worldFlags, politicalNodes: hydrated.politicalNodes });
    sessionB.characters.char_b = createCharacterRecord({ id: 'char_b' }); // a DIFFERENT character in the new session

    // The flag-gated Transformation activates for a brand-new character
    // in a brand-new session, purely because the world remembers.
    sessionB = resolve(sessionB, { type: 'ACTIVATE_TRANSFORMATION', characterId: 'char_b', transformationForm: resistanceForm });
    results.transformationActivatesInNewSession = sessionB.characters.char_b.activeTransformationId === 'form_test_resistance_favor';

    // Sanity: without the flag (a third, totally fresh save with nothing
    // hydrated), the same Transformation is correctly blocked — proves
    // session B's activation came from the carried-over world state, not
    // from the condition being trivially always true.
    let freshSave = createSaveState();
    freshSave.characters.char_c = createCharacterRecord({ id: 'char_c' });
    let blockedWithoutHydration = 'allowed';
    try { resolve(freshSave, { type: 'ACTIVATE_TRANSFORMATION', characterId: 'char_c', transformationForm: resistanceForm }); }
    catch (e) { blockedWithoutHydration = 'threw'; }
    results.blockedWithoutHydration = blockedWithoutHydration === 'threw';

    // importWorldState fails loudly on an unrecognized record kind rather
    // than silently dropping it.
    let badKindThrew = 'did not throw';
    try { importWorldState([{ record: { kind: 'mystery', id: 'x', data: {} } }]); }
    catch (e) { badKindThrew = 'threw: ' + e.message; }
    results.badKindRejected = badKindThrew !== 'did not throw';

    return results;
  });
  ok(worldStateResults.exportedExpectedKeys, 'exportWorldState produces exactly the expected choice:/entity: keys for worldFlags and politicalNodes');
  ok(worldStateResults.hydratedFlagCarriedOver, 'A world flag written to real IndexedDB in one session is read back correctly via persistence.js and importWorldState');
  ok(worldStateResults.hydratedLeverageCarriedOver, 'Political leverage written to real IndexedDB carries over identically');
  ok(worldStateResults.transformationActivatesInNewSession, 'A brand-new character in a brand-new SaveState can activate a Transformation gated on state from a PRIOR session — real cross-session continuity, not just in-memory passing');
  ok(worldStateResults.blockedWithoutHydration, 'Sanity check: the same Transformation is blocked in a session that never hydrated the flag — proves the prior result came from real carried-over state, not a trivially-true condition');
  ok(worldStateResults.badKindRejected, 'importWorldState throws on an unrecognized WorldStateRecord kind rather than silently dropping it');

  console.log('21. Checkpoint 7 — prototype-pollution adversarial pass');
  // Real bug found during this pass: `state.characters['__proto__']` (and
  // the equivalent for politicalNodes) resolves through the JS prototype
  // chain to the real, shared Object.prototype — which is truthy, so the
  // old `if (!character) throw` guard never fired. A caller passing
  // characterId: '__proto__' got the live Object.prototype handed back as
  // "the character", and the next field write on it (e.g. SET_STAMINA's
  // `.stamina = 'winded'`) mutated Object.prototype for the whole
  // process. Fixed by gating findCharacter/findPoliticalNode on
  // Object.prototype.hasOwnProperty.call instead of a truthy check.
  const pollutionResults = await page.evaluate(() => {
    const { resolve } = window.Wonderland.engine;
    const { createSaveState, createCharacterRecord, createPoliticalNode } = window.Wonderland.schema;
    const { importWorldState } = window.Wonderland.worldStateBridge;

    let save = createSaveState();
    save.characters.char_real = createCharacterRecord({ id: 'char_real' });
    save.politicalNodes.node_real = createPoliticalNode({ id: 'node_real' });

    function threw(fn) {
      try { fn(); return null; }
      catch (e) { return e.message; }
    }

    const results = {};

    results.setStaminaProtoBlocked = !!threw(() =>
      resolve(save, { type: 'SET_STAMINA', characterId: '__proto__', stamina: 'winded' }));
    // The real regression check: even if the guard above were somehow
    // wrong, this proves the shared global prototype itself was never
    // touched — a false pass on setStaminaProtoBlocked would still be
    // caught here.
    results.globalPrototypeStillClean = ({}).stamina === undefined;

    results.modifyLeverageTargetProtoBlocked = !!threw(() =>
      resolve(save, { type: 'MODIFY_LEVERAGE', targetId: '__proto__', actorId: 'char_real', delta: 1 }));
    results.modifyLeverageActorProtoBlocked = !!threw(() =>
      resolve(save, { type: 'MODIFY_LEVERAGE', targetId: 'node_real', actorId: '__proto__', delta: 1 }));
    results.logPoliticalActionActorProtoBlocked = !!threw(() =>
      resolve(save, { type: 'LOG_POLITICAL_ACTION', targetId: 'node_real', actorId: '__proto__', tier: 3, direction: 'favorable' }));
    results.setWorldFlagProtoBlocked = !!threw(() =>
      resolve(save, { type: 'SET_WORLD_FLAG', flagId: '__proto__', value: 'x' }));
    results.grantTechniqueCharacterProtoBlocked = !!threw(() =>
      resolve(save, { type: 'GRANT_TECHNIQUE', characterId: '__proto__', technique: { id: 't1', name: 'x', principle: 'x' } }));

    results.importWorldStateChoiceProtoBlocked = !!threw(() =>
      importWorldState([{ record: { kind: 'choice', id: '__proto__', data: { value: { polluted: true } } } }]));
    results.importWorldStateEntityProtoBlocked = !!threw(() =>
      importWorldState([{ record: { kind: 'entity', id: '__proto__', data: { evil: true } } }]));

    // A legitimate, non-dangerous id must still work after all the above —
    // proves the fix rejects specific dangerous keys, not strings in general.
    results.legitimateFlagStillWorks = (() => {
      const next = resolve(save, { type: 'SET_WORLD_FLAG', flagId: 'legit_flag', value: true });
      return next.worldFlags.legit_flag === true;
    })();

    return results;
  });
  ok(pollutionResults.setStaminaProtoBlocked, 'SET_STAMINA with characterId "__proto__" throws instead of returning Object.prototype as "the character"');
  ok(pollutionResults.globalPrototypeStillClean, 'Object.prototype carries no leaked "stamina" field after the attempted attack');
  ok(pollutionResults.modifyLeverageTargetProtoBlocked, 'MODIFY_LEVERAGE with targetId "__proto__" throws (findPoliticalNode hasOwn gate)');
  ok(pollutionResults.modifyLeverageActorProtoBlocked, 'MODIFY_LEVERAGE with actorId "__proto__" throws (dynamic-key guard, since actorId can create a new scores entry)');
  ok(pollutionResults.logPoliticalActionActorProtoBlocked, 'LOG_POLITICAL_ACTION with actorId "__proto__" throws');
  ok(pollutionResults.setWorldFlagProtoBlocked, 'SET_WORLD_FLAG with flagId "__proto__" throws');
  ok(pollutionResults.grantTechniqueCharacterProtoBlocked, 'GRANT_TECHNIQUE with characterId "__proto__" throws');
  ok(pollutionResults.importWorldStateChoiceProtoBlocked, 'worldStateBridge.importWorldState rejects a choice record id of "__proto__" (would have replaced the local worldFlags object\'s own prototype)');
  ok(pollutionResults.importWorldStateEntityProtoBlocked, 'worldStateBridge.importWorldState rejects an entity record id of "__proto__"');
  ok(pollutionResults.legitimateFlagStillWorks, 'A legitimate flagId still works after the dangerous-key guard is in place — the fix rejects specific keys, not all strings');

  console.log('22. Checkpoint 7 — malformed-input adversarial pass');
  // Real gaps found during this pass, both fixed:
  //   (a) woundCountAtLeast's `count` was never range-checked — a negative
  //       count (e.g. -5) made `wounds.length >= -5` true for EVERY
  //       character, silently auto-unlocking a Transformation meant to
  //       require real cost. Fixed with an explicit finite/non-negative
  //       check.
  //   (b) GRANT_TECHNIQUE/ACTIVATE_TRANSFORMATION accepted a technique/
  //       transformationForm payload containing function values or a
  //       circular self-reference without complaint (schema.js's
  //       createTechnique/createTransformationForm is a bare
  //       Object.assign, it doesn't filter or validate). The bad value
  //       landed byte-for-byte inside the returned "state" object,
  //       silently breaking this codebase's own "state is always plain,
  //       serializable data" rule. Fixed with assertPlainSerializable(),
  //       which walks the payload and throws before it's ever accepted.
  const malformedResults = await page.evaluate(() => {
    const { resolve, evaluateUnlockCondition } = window.Wonderland.engine;
    const { createSaveState, createCharacterRecord, createPoliticalNode } = window.Wonderland.schema;

    function makeSave() {
      const s = createSaveState();
      s.characters.char_x = createCharacterRecord({ id: 'char_x' });
      s.politicalNodes.node_x = createPoliticalNode({ id: 'node_x' });
      return s;
    }
    function threw(fn) {
      try { fn(); return null; }
      catch (e) { return e.message; }
    }

    const results = {};

    results.negativeWoundCountRejected = !!threw(() =>
      evaluateUnlockCondition({ type: 'woundCountAtLeast', count: -5 }, { wounds: [] }, makeSave()));
    results.nanWoundCountRejected = !!threw(() =>
      evaluateUnlockCondition({ type: 'woundCountAtLeast', count: NaN }, { wounds: [] }, makeSave()));
    results.legitimateWoundCountStillWorks = evaluateUnlockCondition(
      { type: 'woundCountAtLeast', count: 2 }, { wounds: [1, 2] }, makeSave()) === true;

    results.nonFiniteLeverageScoreRejected = !!threw(() =>
      evaluateUnlockCondition({ type: 'leverageAtLeast', nodeId: 'node_x', score: Infinity }, { id: 'char_x' }, makeSave()));

    const circularTechnique = { id: 't_circular', name: 'Circular Move', principle: 'x' };
    circularTechnique.self = circularTechnique;
    results.circularTechniqueRejected = !!threw(() =>
      resolve(makeSave(), { type: 'GRANT_TECHNIQUE', characterId: 'char_x', technique: circularTechnique }));

    const fnTechnique = { id: 't_fn', name: 'Function Move', principle: 'x', evil: function () { return 'pwned'; } };
    results.functionValuedTechniqueRejected = !!threw(() =>
      resolve(makeSave(), { type: 'GRANT_TECHNIQUE', characterId: 'char_x', technique: fnTechnique }));

    const fnForm = {
      id: 'form_fn',
      name: 'Bad Form',
      unlockCondition: null,
      grantedTechnique: { id: 't2', name: 'x', principle: 'x', hook: function () {} },
    };
    results.nestedFunctionInTransformationRejected = !!threw(() =>
      resolve(makeSave(), { type: 'ACTIVATE_TRANSFORMATION', characterId: 'char_x', transformationForm: fnForm }));

    const goodTechnique = { id: 't_good', name: 'Good Move', principle: 'x', trigger: null, slotCost: ['act'], effect: 'does a thing' };
    results.legitimateTechniqueStillWorks = (() => {
      const next = resolve(makeSave(), { type: 'GRANT_TECHNIQUE', characterId: 'char_x', technique: goodTechnique });
      return next.characters.char_x.techniques.some((t) => t.id === 't_good');
    })();

    return results;
  });
  ok(malformedResults.negativeWoundCountRejected, 'woundCountAtLeast rejects a negative count instead of silently auto-satisfying the gate for every character');
  ok(malformedResults.nanWoundCountRejected, 'woundCountAtLeast rejects a NaN count with a clear error rather than a silent always-false result');
  ok(malformedResults.legitimateWoundCountStillWorks, 'woundCountAtLeast still evaluates correctly for a legitimate, well-formed count');
  ok(malformedResults.nonFiniteLeverageScoreRejected, 'leverageAtLeast rejects a non-finite (Infinity) score');
  ok(malformedResults.circularTechniqueRejected, 'GRANT_TECHNIQUE rejects a technique payload containing a circular self-reference');
  ok(malformedResults.functionValuedTechniqueRejected, 'GRANT_TECHNIQUE rejects a technique payload with a function-valued field');
  ok(malformedResults.nestedFunctionInTransformationRejected, 'ACTIVATE_TRANSFORMATION rejects a transformationForm whose nested grantedTechnique contains a function value');
  ok(malformedResults.legitimateTechniqueStillWorks, 'A legitimate, plain-data technique payload still grants correctly after the serializability guard is in place');

  console.log('23. Checkpoint 7 — persistence.js key injection + importHeirRecord.js hostile input');
  // persistence.js's KEY_PATTERN was already correctly anchored and
  // charset-restricted (rejects newlines, extra colons, path-traversal
  // chars, null bytes, empty ids) — the one real gap found was no length
  // bound (a 100,000-char id passed validation outright), fixed with a
  // {1,200} bound on the id portion. "entity:__proto__"-shaped keys are
  // syntactically valid and stay that way: IndexedDB stores keys as
  // opaque strings, not JS object properties, so there's no prototype
  // chain for that key to exploit there.
  //
  // importHeirRecord.js: JSON.parse and object-spread both produce inert
  // OWN properties for a "__proto__" JSON key (verified — neither
  // triggers the real accessor), so hostile heir-record JSON can't
  // pollute Object.prototype through this file. The real bug found was
  // unrelated to pollution: `awakening.startingSpells` being a string
  // (which has its own truthy `.length`) slipped past the old
  // `!x.length` guard and crashed on `.forEach` with a raw native
  // TypeError; a non-string element in an otherwise-valid array crashed
  // the same way on `.includes`. Both now throw this module's own clear,
  // namespaced error instead.
  const hostileInputResults = await page.evaluate(async () => {
    const P = window.Wonderland.persistence;
    const { importHeirRecord } = window.Wonderland.importHeirRecord;
    const results = {};

    async function threwAsync(fn) {
      try { await fn(); return null; }
      catch (e) { return e.message; }
    }
    function threw(fn) {
      try { fn(); return null; }
      catch (e) { return e.message; }
    }

    results.oversizedKeyRejected = !!(await threwAsync(() => P.getEntity('entity:' + 'a'.repeat(100000))));
    // A syntactically valid key that was never written correctly throws
    // "no record found" (assertValidKey passed) rather than "invalid key"
    // (assertValidKey failed) — that specific message is the pass signal.
    results.reasonableKeyPassesValidation =
      (await threwAsync(() => P.getEntity('entity:legit_id_123'))) === 'wonderland/persistence: no record found for key "entity:legit_id_123"';

    const hostileJson = JSON.parse(JSON.stringify({
      identity: { givenName: 'Evil Heir', __proto__: { polluted: 'yes' } },
      awakening: { revealedSchool: 'Evocation', startingSpells: ['Fireball'] },
      house: { name: 'House Proto Test', ideal1: 'a', __proto__: { polluted2: 'yes' } },
      capstone: { __proto__: { polluted3: 'yes' }, name: 'Cap' },
      npcs: { councillor: { name: 'C', __proto__: { polluted4: 'yes' } } },
    }));
    results.hostileProtoJsonImportsWithoutThrowing = !threw(() => importHeirRecord(hostileJson));
    results.globalPrototypeCleanAfterHostileImport =
      ({}).polluted === undefined && ({}).polluted2 === undefined && ({}).polluted3 === undefined && ({}).polluted4 === undefined;

    results.stringStartingSpellsRejected = !!threw(() => importHeirRecord({
      identity: { givenName: 'A' },
      awakening: { revealedSchool: 'X', startingSpells: 'Fireball' },
    }));
    results.nonStringSpellElementRejected = !!threw(() => importHeirRecord({
      identity: { givenName: 'B' },
      awakening: { revealedSchool: 'X', startingSpells: [12345] },
    }));
    results.legitimateStartingSpellsStillWork = (() => {
      const r = importHeirRecord({
        identity: { givenName: 'C' },
        awakening: { revealedSchool: 'X', startingSpells: ['Fireball', 'Old Grant (adjacent)'] },
      });
      return r.character.spells.length === 1 && r.character.spells[0].name === 'Fireball';
    })();

    return results;
  });
  ok(hostileInputResults.oversizedKeyRejected, 'persistence.js rejects a 100,000-char key instead of accepting an unbounded id length');
  ok(hostileInputResults.reasonableKeyPassesValidation, 'persistence.js still accepts a normal, reasonably-sized key (fails only on "not found", not on validation)');
  ok(hostileInputResults.hostileProtoJsonImportsWithoutThrowing, 'importHeirRecord imports a heir record whose JSON is laced with "__proto__" keys without crashing');
  ok(hostileInputResults.globalPrototypeCleanAfterHostileImport, 'Object.prototype carries no leaked fields after importing __proto__-laced heir JSON — JSON.parse/spread both produce inert own-properties, not real pollution');
  ok(hostileInputResults.stringStartingSpellsRejected, 'importHeirRecord rejects awakening.startingSpells being a string instead of an array, with a clear message (previously crashed on .forEach)');
  ok(hostileInputResults.nonStringSpellElementRejected, 'importHeirRecord rejects a non-string element inside startingSpells, with a clear message (previously crashed on .includes)');
  ok(hostileInputResults.legitimateStartingSpellsStillWork, 'A legitimate startingSpells array still imports correctly after the type-validation fix');

  console.log('24. First Principles reconciliation (WONDERLAND_RPG_FLAGSHIP_DESIGN.md §5)');
  // The design doc, supplied after the six-house content already existed,
  // names four canonical First Principles (distinction/relation/
  // transformation/persistence) as the game's actual ability taxonomy —
  // "every ability must be classifiable under exactly one Principle."
  // What had been built used a differently-scoped `principle` field for
  // each house's own free-form motto instead (e.g. "The Undercurrent"),
  // which schema.js's own comment even called "free-form" — a real
  // divergence from spec, not a naming coincidence. Reconciled by keeping
  // the motto (renamed to houseTheme, still purely narrative) and adding
  // a new, validated firstPrinciple field alongside it.
  const firstPrincipleResults = await page.evaluate(() => {
    const { resolve } = window.Wonderland.engine;
    const { createSaveState, createCharacterRecord } = window.Wonderland.schema;
    const FIRST_PRINCIPLES = window.Wonderland.schema.FIRST_PRINCIPLES;
    const results = {};

    function makeSave() {
      const s = createSaveState();
      s.characters.char_x = createCharacterRecord({ id: 'char_x' });
      return s;
    }
    function threw(fn) {
      try { fn(); return null; }
      catch (e) { return e.message; }
    }

    results.exactlyFourPrinciples = FIRST_PRINCIPLES.length === 4 &&
      ['distinction', 'relation', 'transformation', 'persistence'].every((p) => FIRST_PRINCIPLES.includes(p));

    results.invalidFirstPrincipleRejected = !!threw(() => resolve(makeSave(), {
      type: 'GRANT_TECHNIQUE',
      characterId: 'char_x',
      technique: { id: 't_bad', name: 'Bad Move', firstPrinciple: 'nonsense' },
    }));
    results.missingFirstPrincipleStillAllowed = !threw(() => resolve(makeSave(), {
      type: 'GRANT_TECHNIQUE',
      characterId: 'char_x',
      technique: { id: 't_scaffold', name: 'Scaffold Move' },
    }));
    results.validFirstPrincipleAccepted = (() => {
      const next = resolve(makeSave(), {
        type: 'GRANT_TECHNIQUE',
        characterId: 'char_x',
        technique: { id: 't_good', name: 'Good Move', firstPrinciple: 'persistence' },
      });
      return next.characters.char_x.techniques.some((t) => t.id === 't_good' && t.firstPrinciple === 'persistence');
    })();
    results.invalidNestedFirstPrincipleInTransformationRejected = !!threw(() => resolve(makeSave(), {
      type: 'ACTIVATE_TRANSFORMATION',
      characterId: 'char_x',
      transformationForm: {
        id: 'form_bad',
        name: 'Bad Form',
        unlockCondition: null,
        grantedTechnique: { id: 't_bad2', name: 'Bad Move 2', firstPrinciple: 'made_up' },
      },
    }));

    return results;
  });
  ok(firstPrincipleResults.exactlyFourPrinciples, 'schema.js exposes exactly the four canonical First Principles: distinction, relation, transformation, persistence');
  ok(firstPrincipleResults.invalidFirstPrincipleRejected, 'GRANT_TECHNIQUE rejects a technique with an invalid firstPrinciple value ("nonsense" is not one of the four)');
  ok(firstPrincipleResults.missingFirstPrincipleStillAllowed, 'GRANT_TECHNIQUE still allows a scaffolding/test technique with no firstPrinciple at all — the rule targets real content, not every technique ever');
  ok(firstPrincipleResults.validFirstPrincipleAccepted, 'GRANT_TECHNIQUE accepts and preserves a technique with a valid firstPrinciple');
  ok(firstPrincipleResults.invalidNestedFirstPrincipleInTransformationRejected, 'ACTIVATE_TRANSFORMATION rejects a transformationForm whose nested grantedTechnique has an invalid firstPrinciple');

  console.log('25. Checkpoint 8 — grid, weapons, rally/defeat, currency (Monolith_Universe.pdf, verified against the source PDF directly)');
  // Scope, per WONDERLAND_RPG_CHECKPOINT8_HANDOVER.md: five systems
  // ported (grid, weapons, rally/defeat, currency, equipment), three
  // explicitly rejected (card-deck/hand-draw, initiative-as-currency,
  // Classes/Positions). Three real design resolutions made during this
  // build, all recorded in wonderland/README.md:
  //   - Rally/defeat has NO numeric Life pool — Wonderland has never
  //     modeled damage as arithmetic. "Critically injured" reuses
  //     isCombatOver's exact existing threshold (stamina spent or 3+
  //     wounds) instead of a new HP stat.
  //   - Equipment's Helmet/Necklace bonuses ("hand size"/"basic ability
  //     count") have no Wonderland target (no hand/deck, no cap on
  //     known techniques) — kept as descriptive data, same treatment as
  //     Dagger/Wand's weapon bonuses.
  //   - Currency ports Stars/Fragments/Favor only — Stones is excluded
  //     outright (its own source text ties it to real-money purchase).
  const checkpoint8Results = await page.evaluate(() => {
    const { resolve, combatStatus, isInWeaponRange, isWeaponCritCondition, isCellOnBoard, isCellBlocked } = window.Wonderland.engine;
    const { createSaveState, createCharacterRecord, createBoardState, WEAPON_STATS, EQUIPMENT_SLOTS, FIRST_PRINCIPLES } = window.Wonderland.schema;
    const results = {};

    function threw(fn) {
      try { fn(); return null; }
      catch (e) { return e.message; }
    }
    function freshDuel(overridesA, overridesB, board) {
      let s = createSaveState();
      s.characters.char_a = createCharacterRecord({ id: 'char_a', ...overridesA });
      s.characters.char_b = createCharacterRecord({ id: 'char_b', ...overridesB });
      s = resolve(s, { type: 'INIT_ENCOUNTER', characterIds: ['char_a', 'char_b'], location: 'outskirts', board: board || createBoardState() });
      return s;
    }

    // --- Grid / DECLARE_MOVEMENT ---
    let s = freshDuel({}, {}, createBoardState({ blockedCells: [{ x: 3, y: 3 }] }));
    s = resolve(s, { type: 'DECLARE_MOVEMENT', characterId: 'char_a', to: { x: 0, y: 0 } });
    results.initialPlacementFree = s.currentEncounter.combatants[0].distanceSpentThisExchange === 0;
    s = resolve(s, { type: 'DECLARE_MOVEMENT', characterId: 'char_a', to: { x: 4, y: 0 } }); // 4 cells, base distance 4
    results.validMovementWithinDistance = s.characters.char_a.position.x === 4;
    results.exceedingRemainingDistanceBlocked = !!threw(() => resolve(s, { type: 'DECLARE_MOVEMENT', characterId: 'char_a', to: { x: 5, y: 0 } }));
    results.movementToBlockedCellRejected = !!threw(() => resolve(s, { type: 'DECLARE_MOVEMENT', characterId: 'char_b', to: { x: 3, y: 3 } }));
    results.movementOutOfBoundsRejected = !!threw(() => resolve(s, { type: 'DECLARE_MOVEMENT', characterId: 'char_b', to: { x: 9, y: 9 } }));
    // Distance budget resets on RESOLVE_EXCHANGE
    let s2 = resolve(s, { type: 'DECLARE_ACTION', characterId: 'char_a', slots: ['react'] });
    s2 = resolve(s2, { type: 'DECLARE_ACTION', characterId: 'char_b', slots: ['react'] });
    s2 = resolve(s2, { type: 'RESOLVE_EXCHANGE' });
    results.distanceBudgetResetsPerExchange = s2.currentEncounter.combatants[0].distanceSpentThisExchange === 0;
    s2 = resolve(s2, { type: 'DECLARE_MOVEMENT', characterId: 'char_a', to: { x: 8, y: 0 } }); // another 4 cells, only possible if reset worked
    results.movementWorksAgainAfterReset = s2.characters.char_a.position.x === 8;

    // Sword's +1 distance bonus (real, wired) vs. Dagger/Wand's
    // secondary bonuses (real ported data, deliberately NOT wired)
    let sSword = freshDuel({ weaponSpecialty: 'sword' }, {});
    sSword = resolve(sSword, { type: 'DECLARE_MOVEMENT', characterId: 'char_a', to: { x: 0, y: 0 } });
    results.swordDistanceBonusWired = !threw(() => resolve(sSword, { type: 'DECLARE_MOVEMENT', characterId: 'char_a', to: { x: 5, y: 0 } })); // 5 > base 4, needs +1
    results.daggerStrikeBonusIsDataOnly = WEAPON_STATS.dagger.strikeBonusAsMain === 1;
    results.wandAbilityRangeBonusIsDataOnly = WEAPON_STATS.wand.abilityRangeBonusAsMain === 1;

    // --- Weapon range gate (real, wired into DECLARE_ACTION) ---
    let sRange = freshDuel({ weaponSpecialty: 'dagger' }, {});
    sRange = resolve(sRange, { type: 'DECLARE_MOVEMENT', characterId: 'char_a', to: { x: 0, y: 0 } });
    sRange = resolve(sRange, { type: 'DECLARE_MOVEMENT', characterId: 'char_b', to: { x: 3, y: 0 } });
    results.daggerOutOfRangeBlocked = !!threw(() => resolve(sRange, { type: 'DECLARE_ACTION', characterId: 'char_a', slots: ['act'] }));
    sRange = resolve(sRange, { type: 'DECLARE_MOVEMENT', characterId: 'char_b', to: { x: 1, y: 0 } });
    results.daggerInRangeAllowed = !threw(() => resolve(sRange, { type: 'DECLARE_ACTION', characterId: 'char_a', slots: ['act'] }));
    // Spear's line-only range (verified against the PDF's own "range 2
    // cells in a line" wording)
    results.spearLineRangeAccepted = isInWeaponRange('spear', { x: 0, y: 0 }, { x: 2, y: 0 }) === true;
    results.spearDiagonalRejected = isInWeaponRange('spear', { x: 0, y: 0 }, { x: 2, y: 2 }) === false;
    // Projectile's range has no line requirement (only its crit does)
    results.projectileDiagonalRangeStillValid = isInWeaponRange('projectile', { x: 0, y: 0 }, { x: 4, y: 3 }) === true;
    results.projectileCritRequiresLine = isWeaponCritCondition('projectile', { x: 0, y: 0 }, { x: 4, y: 0 }) === true &&
      isWeaponCritCondition('projectile', { x: 0, y: 0 }, { x: 4, y: 3 }) === false;
    results.spearCritRequiresFirstCellHit = isWeaponCritCondition('spear', { x: 0, y: 0 }, { x: 2, y: 0 }, true) === true &&
      isWeaponCritCondition('spear', { x: 0, y: 0 }, { x: 2, y: 0 }, false) === false;

    // --- Rally/defeat full trace: defeat -> rally -> second hit -> permanent removal ---
    let sRally = freshDuel({}, {});
    results.startsActive = combatStatus(sRally.characters.char_a) === 'active';
    sRally = resolve(sRally, { type: 'APPLY_WOUND', characterId: 'char_a', location: 'torso' });
    sRally = resolve(sRally, { type: 'APPLY_WOUND', characterId: 'char_a', location: 'legs' });
    sRally = resolve(sRally, { type: 'APPLY_WOUND', characterId: 'char_a', location: 'head' }); // 3rd wound -> defeated
    results.threeWoundsCauseDefeated = combatStatus(sRally.characters.char_a) === 'defeated';
    results.actBlockedWhileDefeated = !!threw(() => resolve(sRally, { type: 'DECLARE_ACTION', characterId: 'char_a', slots: ['act'] }));
    results.moveStillAllowedWhileDefeated = !threw(() => resolve(sRally, { type: 'DECLARE_MOVEMENT', characterId: 'char_a', to: { x: 0, y: 0 } }));
    results.rallyOnActiveCharacterRejected = !!threw(() => resolve(sRally, { type: 'RALLY_CHARACTER', characterId: 'char_b', allyId: 'char_a' }));
    sRally = resolve(sRally, { type: 'RALLY_CHARACTER', characterId: 'char_a', allyId: 'char_b' });
    results.rallyRestoresRalliedStatus = combatStatus(sRally.characters.char_a) === 'rallied';
    results.actAllowedAfterRally = !threw(() => resolve(sRally, { type: 'DECLARE_ACTION', characterId: 'char_a', slots: ['act'] }));
    results.secondRallyRejected = !!threw(() => resolve(sRally, { type: 'RALLY_CHARACTER', characterId: 'char_a', allyId: 'char_b' }));
    sRally = resolve(sRally, { type: 'APPLY_WOUND', characterId: 'char_a', location: 'torso' }); // hit while rallied -> permanent removal
    results.hitWhileRalliedCausesPermanentRemoval = combatStatus(sRally.characters.char_a) === 'removed';
    results.furtherWoundAfterRemovalRejected = !!threw(() => resolve(sRally, { type: 'APPLY_WOUND', characterId: 'char_a', location: 'torso' }));
    results.declareActionAfterRemovalRejected = !!threw(() => resolve(sRally, { type: 'DECLARE_ACTION', characterId: 'char_a', slots: ['move'] }));

    // Immediate removal path: defeated, NOT rallied, takes another hit
    let sNoRally = freshDuel({}, {});
    sNoRally = resolve(sNoRally, { type: 'APPLY_WOUND', characterId: 'char_a', location: 'torso' });
    sNoRally = resolve(sNoRally, { type: 'APPLY_WOUND', characterId: 'char_a', location: 'legs' });
    sNoRally = resolve(sNoRally, { type: 'APPLY_WOUND', characterId: 'char_a', location: 'head' });
    sNoRally = resolve(sNoRally, { type: 'APPLY_WOUND', characterId: 'char_a', location: 'weaponArm' }); // hit while defeated, never rallied
    results.hitWhileDefeatedUnrallyedCausesRemoval = combatStatus(sNoRally.characters.char_a) === 'removed';

    // --- Currency: Stars/Fragments/Favor real, Stones absent ---
    let sCur = createSaveState();
    results.currencyStartsAtZero = sCur.currency.stars === 0 && sCur.currency.fragments === 0 && sCur.currency.favor === 0;
    sCur = resolve(sCur, { type: 'MODIFY_CURRENCY', key: 'stars', amount: 10 });
    results.currencyEarns = sCur.currency.stars === 10;
    sCur = resolve(sCur, { type: 'MODIFY_CURRENCY', key: 'stars', amount: -10 });
    results.currencySpends = sCur.currency.stars === 0;
    results.currencyOverspendRejected = !!threw(() => resolve(sCur, { type: 'MODIFY_CURRENCY', key: 'fragments', amount: -1 }));
    results.stonesHasNoSlot = !!threw(() => resolve(sCur, { type: 'MODIFY_CURRENCY', key: 'stones', amount: 1 }));

    // --- Equipment: data verified against the PDF, Helmet/Necklace resolution ---
    results.fourEquipmentSlotsPresent = Object.keys(EQUIPMENT_SLOTS).length === 4;
    results.bootsSandalsDistanceBonusIsRealTarget = EQUIPMENT_SLOTS.bootsSandals.bonusB === 'distance';
    results.helmetNecklaceOptionsPreservedAsData = EQUIPMENT_SLOTS.helmetNecklace.bonusA === 'handSize' && EQUIPMENT_SLOTS.helmetNecklace.bonusB === 'basicAbilityCount';

    // --- SCHEMA_VERSION bump ---
    results.schemaVersionBumpedTo3 = window.Wonderland.schema.SCHEMA_VERSION === 3;

    // --- Existing systems unaffected: real houses' content still works with the new CharacterRecord fields ---
    results.firstPrinciplesStillIntact = FIRST_PRINCIPLES.length === 4;

    return results;
  });
  ok(checkpoint8Results.initialPlacementFree, 'DECLARE_MOVEMENT: first placement on the board costs no distance (not "movement" in the source sense)');
  ok(checkpoint8Results.validMovementWithinDistance, 'DECLARE_MOVEMENT: a move within remaining distance succeeds');
  ok(checkpoint8Results.exceedingRemainingDistanceBlocked, 'DECLARE_MOVEMENT: a move exceeding remaining distance this exchange throws');
  ok(checkpoint8Results.movementToBlockedCellRejected, 'DECLARE_MOVEMENT: a blocked/obstacle cell is rejected');
  ok(checkpoint8Results.movementOutOfBoundsRejected, 'DECLARE_MOVEMENT: a target outside the board is rejected');
  ok(checkpoint8Results.distanceBudgetResetsPerExchange, 'distanceSpentThisExchange resets to 0 on RESOLVE_EXCHANGE, same lifecycle as declarations');
  ok(checkpoint8Results.movementWorksAgainAfterReset, 'Movement is usable again next exchange after the budget resets');
  ok(checkpoint8Results.swordDistanceBonusWired, 'Sword-as-main\'s +1 distance is really wired into DECLARE_MOVEMENT\'s effective distance');
  ok(checkpoint8Results.daggerStrikeBonusIsDataOnly, 'Dagger\'s strikeBonusAsMain is real ported data (not wired into a nonexistent numeric strike stat)');
  ok(checkpoint8Results.wandAbilityRangeBonusIsDataOnly, 'Wand\'s abilityRangeBonusAsMain is real ported data (not wired into a nonexistent technique range field)');
  ok(checkpoint8Results.daggerOutOfRangeBlocked, 'DECLARE_ACTION with an act slot is blocked when no positioned opponent is within weapon range');
  ok(checkpoint8Results.daggerInRangeAllowed, 'DECLARE_ACTION with an act slot succeeds once the opponent is within weapon range');
  ok(checkpoint8Results.spearLineRangeAccepted, 'Spear range accepts an orthogonal-line target at distance 2');
  ok(checkpoint8Results.spearDiagonalRejected, 'Spear range rejects a diagonal target even at the same Chebyshev distance ("in a line" per the PDF)');
  ok(checkpoint8Results.projectileDiagonalRangeStillValid, 'Projectile\'s basic range has no line requirement (only its crit condition does, per the PDF\'s own wording)');
  ok(checkpoint8Results.projectileCritRequiresLine, 'Projectile crits on the 4th cell only in a straight line, not diagonally');
  ok(checkpoint8Results.spearCritRequiresFirstCellHit, 'Spear crits on the 2nd cell only if the first cell was hit');
  ok(checkpoint8Results.startsActive, 'A fresh character starts combatStatus "active"');
  ok(checkpoint8Results.threeWoundsCauseDefeated, 'combatStatus reuses isCombatOver\'s exact threshold (3+ wounds) to become "defeated" — no numeric Life pool involved');
  ok(checkpoint8Results.actBlockedWhileDefeated, 'A defeated character cannot declare an act slot (no abilities/strikes per the PDF)');
  ok(checkpoint8Results.moveStillAllowedWhileDefeated, 'A defeated character can still move (capped at 1 distance, not fully immobilized)');
  ok(checkpoint8Results.rallyOnActiveCharacterRejected, 'RALLY_CHARACTER rejects a target that is not currently "defeated"');
  ok(checkpoint8Results.rallyRestoresRalliedStatus, 'RALLY_CHARACTER moves a defeated character to "rallied"');
  ok(checkpoint8Results.actAllowedAfterRally, 'A rallied character regains full access to abilities/strikes per the PDF, despite still being at the critical threshold');
  ok(checkpoint8Results.secondRallyRejected, 'A character can only ever be rallied once (rallyUsed latches)');
  ok(checkpoint8Results.hitWhileRalliedCausesPermanentRemoval, 'A further hit while "rallied" causes permanent removal from the encounter');
  ok(checkpoint8Results.furtherWoundAfterRemovalRejected, 'A removed character cannot take further wounds — fails loudly rather than silently no-op\'ing');
  ok(checkpoint8Results.declareActionAfterRemovalRejected, 'A removed character cannot declare any action at all');
  ok(checkpoint8Results.hitWhileDefeatedUnrallyedCausesRemoval, 'A further hit while "defeated" (never rallied) also causes immediate permanent removal — the race the source describes');
  ok(checkpoint8Results.currencyStartsAtZero, 'A fresh SaveState starts with stars/fragments/favor all at 0');
  ok(checkpoint8Results.currencyEarns, 'MODIFY_CURRENCY can add to a currency counter');
  ok(checkpoint8Results.currencySpends, 'MODIFY_CURRENCY can subtract from a currency counter');
  ok(checkpoint8Results.currencyOverspendRejected, 'MODIFY_CURRENCY rejects spending a currency below 0');
  ok(checkpoint8Results.stonesHasNoSlot, 'MODIFY_CURRENCY rejects "stones" outright — the premium currency was deliberately never given a slot');
  ok(checkpoint8Results.fourEquipmentSlotsPresent, 'EQUIPMENT_SLOTS has all four slot pairs from the PDF');
  ok(checkpoint8Results.bootsSandalsDistanceBonusIsRealTarget, 'Boots/Sandals\' distance bonus option names a field (distance) that really exists and is really used');
  ok(checkpoint8Results.helmetNecklaceOptionsPreservedAsData, 'Helmet/Necklace\'s hand-size/basic-ability-count options are preserved as real ported data, not silently dropped or invented away');
  ok(checkpoint8Results.schemaVersionBumpedTo3, 'SCHEMA_VERSION bumped 2 -> 3 for the new CharacterRecord/SaveState fields — an old save fails loudly rather than half-loading');
  ok(checkpoint8Results.firstPrinciplesStillIntact, 'Checkpoint 8\'s CharacterRecord changes did not disturb the First Principles reconciliation from before it');

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Harness crashed:', err);
  process.exit(1);
});
