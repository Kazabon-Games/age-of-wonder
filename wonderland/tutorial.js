'use strict';
/*
 * WONDERLAND: FIRST PRINCIPLES — Checkpoint 9's one playable encounter.
 *
 * Wires Studio-Internal-/TUTORIAL_NLDR_AETHERIA_NOVA.md's structural
 * mapping appendix to real resolve() calls. Browser-only UI file, like
 * playUI.js — reads state, dispatches into window.WonderlandEngine,
 * never invents its own combat logic.
 *
 * The tutorial's fiction ("You Read. It Commits.") is NLDR's
 * plain-language framing of a real mechanic, not a literal action type —
 * aow_srd.html's own "The Read Declaration" section is explicit that
 * Read/Commit/Hold is Presence (derived from wounds/stamina), and "The
 * GM adjudicates Read accuracy" with no formula given for two otherwise-
 * matched fresh combatants. A fresh player vs. a fresh Construct really
 * does tie on computeInitiative() (both full Read) — engine.js's own
 * 'readParity-gmAdjudicates' result. That tie IS the mechanically
 * correct outcome here, not a bug to route around: this tutorial script
 * plays the GM-adjudication role the SRD explicitly leaves open,
 * breaking the tie in the player's favor exactly the way NLDR does in
 * fiction. The outcome-transparency panel shows the real tie, not a
 * fabricated "you won the Read," so the display stays honest even
 * though the narrative framing is confident.
 *
 * "Commit" for the Construct maps to declaring the 'act' slot (full
 * offensive commitment); the player's "Read" maps to declaring 'react'
 * (watching, not acting) — using the real ACTION_SLOTS vocabulary,
 * not a new one invented for this scene.
 *
 * The Construct's behavior is 100% scripted, not real NPC AI — flagged
 * here per the tutorial doc's own explicit instruction, and nowhere
 * else in this codebase should this pattern be copied as "how NPCs
 * behave."
 */

(function () {

const Engine = window.WonderlandEngine;
const Schema = window.WonderlandSchema;

const CONSTRUCT_ID = 'char_construct';
const PLAYER_ID = 'char_player';

// A Distinction-tagged technique, granted mid-tutorial per the source
// doc's own description: "Not the flashiest, not the strongest. Just
// one that's honestly yours from the start." trigger: null (always
// available) — no modifiers, matching "low complexity" per the
// structural mapping appendix.
const TUTORIAL_TECHNIQUE = {
  id: 'tech_tutorial_severance',
  name: 'Severance',
  houseTheme: null,
  firstPrinciple: 'distinction',
  trigger: null,
  slotCost: ['act'],
  effect: "A clean, simple cut — isolates one thing from another cleanly. Nothing flashy. Honestly yours.",
};

let ctx = null; // { app, showScreen, step }

/*
 * { once: true } — found by adversarial mobile testing, not by design: a
 * fast double-tap on the SAME button dispatches two click events before
 * the DOM re-renders. Since every step function here runs fully
 * synchronously (deepClone-based resolve() calls, no awaits), a naive
 * addEventListener('click', fn) lets the second event re-enter the SAME
 * handler on the stale (already-replaced) button reference — real
 * repro: double-tapping "Read the Construct" left the Construct with 3
 * wounds instead of 2, silently. A busy-flag guard was tried first and
 * rejected: since everything here is synchronous, the flag gets reset
 * before the second click event is even dispatched, so it can't
 * actually block anything — { once: true } is a DOM-level guarantee
 * (the browser removes the listener as part of the first dispatch,
 * before a second click on the same element can re-invoke it), not a
 * timing-dependent one.
 */
function bindContinue(fn) {
  const btn = document.getElementById('btn-continue');
  if (btn) btn.addEventListener('click', fn, { once: true });
}

function narrationHTML(speakerLabel, lines, continueLabel) {
  return `
    <div class="eyebrow">${speakerLabel}</div>
    <div class="tutorial-narration">${lines.map((l) => `<p>${l}</p>`).join('')}</div>
    <button class="btn" id="btn-continue">${continueLabel || 'Continue'}</button>
  `;
}

function renderOutcomeTransparency(exchangeLabel) {
  // Real data, pulled live from the just-resolved state — not a mocked
  // display value. This is the highest-priority UI requirement in the
  // Checkpoint 9 handover: show the actual weight/threshold numbers
  // that decided the exchange, not just win/lose.
  const encounter = ctx.app.save.currentEncounter;
  const player = ctx.app.save.characters[PLAYER_ID];
  const construct = ctx.app.save.characters[CONSTRUCT_ID];
  const initiative = Engine.computeInitiative(ctx.app.save, encounter);
  const stageRow = (character, label) => `
    <div class="presence-row">
      <span class="presence-label">${label}</span>
      <span>Read: ${Engine.presenceStage(character, 'read')}</span>
      <span>Commit: ${Engine.presenceStage(character, 'commit')}</span>
      <span>Hold: ${Engine.presenceStage(character, 'hold')}</span>
    </div>
  `;
  return `
    <div class="outcome-panel">
      <div class="outcome-title">${exchangeLabel} — why it resolved this way</div>
      ${stageRow(player, 'You')}
      ${stageRow(construct, 'Construct')}
      <div class="outcome-initiative">Initiative: <strong>${initiative.first ? (initiative.first === PLAYER_ID ? 'You' : 'Construct') : 'Tied'}</strong> — ${initiative.reason}</div>
    </div>
  `;
}

function step0_threshold() {
  const el = document.getElementById('screen-encounter');
  el.innerHTML = narrationHTML('NLDR', [
    '"Took you long enough," she says, not looking up. "Most of you take a week. You took an afternoon. Either you\'re desperate or you\'re efficient. I haven\'t decided which yet."',
    '"Here\'s what I\'m not going to do. I\'m not going to explain the whole cosmology to you standing on a doorstep. What\'s going to help you in the next ten minutes is not dying. So. Walk with me."',
  ]);
  bindContinue(step1_aetheriaNova);
}

function step1_aetheriaNova() {
  const el = document.getElementById('screen-encounter');
  el.innerHTML = narrationHTML('NLDR', [
    'The world doesn\'t open up so much as it admits it was already there. Aetheria Nova — a working place, something between a city half-finished and a battlefield half-cleared.',
    '"Not our problem yet," she says, catching you looking toward the ridge. "Other Esori. Older ones. That\'s not going to wait for you to catch up."',
    '"That\'s a Construct," NLDR says, nodding at a shape already waiting in the clearing. "Not alive, not really trying, here to make sure you don\'t embarrass yourself in front of someone who is. Let\'s fix that."',
  ]);
  bindContinue(step2_explainCombat);
}

function step2_explainCombat() {
  const el = document.getElementById('screen-encounter');
  el.innerHTML = narrationHTML('NLDR', [
    '"Combat here isn\'t a coin flip. Whatever happens, you\'ll be able to trace exactly why."',
    '"Three things you can do each turn — Move, Act, React. Read means you\'re watching, not acting. Commit means you\'re all in. Pick wrong and it\'ll cost you. Pick right and it\'ll matter."',
    '"It\'s going to Commit," NLDR says, flat. "It always does, first exchange. Constructs don\'t bluff. People do. Remember the difference."',
  ], 'Read the Construct');
  bindContinue(step3_firstExchange);
}

/*
 * The first real engine-backed beat: INIT_ENCOUNTER, both declarations,
 * RESOLVE_EXCHANGE — see this file's header comment for why a tied
 * initiative result is the mechanically honest outcome here, not a bug.
 */
function step3_firstExchange() {
  let s = ctx.app.save;
  s = Engine.resolve(s, { type: 'INIT_ENCOUNTER', characterIds: [PLAYER_ID, CONSTRUCT_ID], location: 'outskirts' });
  // Scripted Construct behavior — hardcoded, not real NPC AI. See file header.
  s = Engine.resolve(s, { type: 'DECLARE_ACTION', characterId: CONSTRUCT_ID, slots: ['act'] });
  // Player "Reads" — declares the watching slot, not the committing one.
  s = Engine.resolve(s, { type: 'DECLARE_ACTION', characterId: PLAYER_ID, slots: ['react'] });
  s = Engine.resolve(s, { type: 'RESOLVE_EXCHANGE' });
  // The scripted "GM adjudication" NLDR performs in fiction: the tie
  // breaks in the player's favor. Wounding the Construct (never the
  // player) is how that adjudication is expressed in real state.
  s = Engine.resolve(s, { type: 'APPLY_WOUND', characterId: CONSTRUCT_ID, location: 'torso' });
  ctx.app.save = s;

  const el = document.getElementById('screen-encounter');
  el.innerHTML = `
    ${renderOutcomeTransparency('First Exchange')}
    ${narrationHTML('NLDR', [
      'It Commits, exactly like she said. The exchange resolves in your favor — not because anything rolled well, but because you knew something it didn\'t know you knew.',
      '"See that? That\'s not luck. That\'s the whole game."',
    ])}
  `;
  bindContinue(step4_technique);
}

function step4_technique() {
  const el = document.getElementById('screen-encounter');
  el.innerHTML = narrationHTML('NLDR', [
    '"You\'ve got Techniques. Not spells, not tricks. Everything you\'ll ever do here falls under one of four things — Distinction, Relation, Transformation, Persistence. If it doesn\'t fit one of those, it doesn\'t belong to you yet."',
    'She shows you one. Not the flashiest, not the strongest. Just one that\'s honestly yours from the start — something that separates, that isolates, that cuts one thing cleanly away from another. Distinction, plain and simple.',
  ], 'Use Severance');
  bindContinue(step5_secondExchange);
}

function step5_secondExchange() {
  let s = ctx.app.save;
  s = Engine.resolve(s, { type: 'GRANT_TECHNIQUE', characterId: PLAYER_ID, technique: TUTORIAL_TECHNIQUE });
  s = Engine.resolve(s, { type: 'DECLARE_ACTION', characterId: CONSTRUCT_ID, slots: ['act'] });
  s = Engine.resolve(s, { type: 'DECLARE_ACTION', characterId: PLAYER_ID, slots: ['act'], techniqueId: TUTORIAL_TECHNIQUE.id });
  s = Engine.resolve(s, { type: 'RESOLVE_EXCHANGE' });
  s = Engine.resolve(s, { type: 'APPLY_WOUND', characterId: CONSTRUCT_ID, location: 'legs' });
  ctx.app.save = s;

  const el = document.getElementById('screen-encounter');
  el.innerHTML = `
    ${renderOutcomeTransparency('Second Exchange')}
    ${narrationHTML('NLDR', [
      'You use it. The Construct\'s stance breaks, cleanly, without drama.',
      '"Good," NLDR says, and for the first time she sounds almost satisfied instead of bored. "That\'s the whole lesson. You\'ll learn the other three the hard way, same as everyone."',
    ], 'Continue')}
  `;
  bindContinue(step6_victory);
}

function step6_victory() {
  window.WonderlandTutorial.onComplete(ctx);
}

function start(app, showScreen) {
  ctx = { app, showScreen };
  step0_threshold();
}

window.WonderlandTutorial = {
  start,
  // Overwritten by playUI.js so this file never needs to know what a
  // "victory screen" looks like — kept decoupled the same way engine.js
  // keeps GRANT_TECHNIQUE content-agnostic.
  onComplete: function () {},
};

})();
