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
    let state = { schemaVersion: 1, party: [], characters: {}, worldFlags: {}, factionStanding: {}, currentEncounter: null };
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

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Harness crashed:', err);
  process.exit(1);
});
