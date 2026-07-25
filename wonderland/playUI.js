'use strict';
/*
 * WONDERLAND: FIRST PRINCIPLES — Checkpoint 9 UI layer.
 *
 * Browser-only, like persistence.js — no module.exports branch, this
 * never runs in Node. Owns DOM rendering and screen-switching only; per
 * the checkpoint handover's own non-negotiable, it never contains game
 * logic of its own. Every state change goes through
 * window.WonderlandEngine.resolve() — this file reads state and
 * dispatches actions into it, nothing more.
 */

(function () {

const Engine = window.WonderlandEngine;
const Schema = window.WonderlandSchema;
const Persistence = window.WonderlandPersistence;

// Deliberately separate from schema.js's SCHEMA_VERSION (Checkpoint 9
// handover §6) — this tracks UI/content releases, not save-data shape.
// Kept in sync with play.html's own phase0-scaffold version marker by
// hand, one canonical version per the scaffold skill's "pick one on
// purpose" guidance for a single document (not a family needing
// independent per-document versions).
const UI_VERSION = '0.1.0';
const CHANGELOG = [
  {
    version: '0.1.0',
    date: '2026-07-24',
    summary: 'First playable slice: pick a house, play the NLDR/Aetheria Nova tutorial encounter start to finish, see exactly why each exchange resolved the way it did.',
  },
];
const UI_VERSION_KEY = 'choice:ui_version';

/*
 * app holds this session's live SaveState plus whatever UI-only
 * bookkeeping the screens need (which house was picked, where the
 * tutorial script currently is). app.save is the ONLY thing that's ever
 * real game state; everything else on app is scratch the UI owns.
 */
const app = {
  save: null,
};

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  const target = document.getElementById(id);
  if (!target) {
    throw new Error(`wonderland/playUI: unknown screen id "${id}"`);
  }
  target.classList.add('active');
}

function renderStartScreen() {
  const el = document.getElementById('screen-start');
  el.innerHTML = `
    <div class="eyebrow">Age of Wonder</div>
    <h1 class="screen-title">Wonderland: First Principles</h1>
    <button class="btn" id="btn-begin">Begin</button>
  `;
  // { once: true } throughout this file for the same reason
  // tutorial.js's bindContinue() uses it — found by adversarial
  // double-tap testing: a fast repeat click on the same element fires
  // twice before the DOM re-renders, since every handler here runs
  // synchronously start to finish.
  document.getElementById('btn-begin').addEventListener('click', () => {
    renderHouseSelectScreen();
    showScreen('screen-house-select');
  }, { once: true });
}

function renderHouseSelectScreen() {
  const el = document.getElementById('screen-house-select');
  const houses = window.WonderlandHouses.SIX_HOUSES;
  el.innerHTML = `
    <div class="eyebrow">Choose Your House</div>
    <h1 class="screen-title">Six Houses Govern Shemsara</h1>
    <div class="house-grid" id="house-grid"></div>
  `;
  const grid = document.getElementById('house-grid');
  houses.forEach((house) => {
    const card = document.createElement('button');
    card.className = 'house-card';
    card.setAttribute('data-house-id', house.id);
    card.style.setProperty('--house-primary', house.colorPrimary);
    card.style.setProperty('--house-secondary', house.colorSecondary);
    card.innerHTML = `
      <div class="house-card-name">${house.name}</div>
      <div class="house-card-seat">${house.seat} &middot; ${house.district}</div>
      <div class="house-card-kit">${house.kitDescription}</div>
    `;
    card.addEventListener('click', () => selectHouse(house.id), { once: true });
    grid.appendChild(card);
  });
}

/*
 * Selecting a house creates the player's tutorial character — a plain
 * CharacterRecord tied to that house, nothing more. This is the only
 * place house selection touches game state, and it goes through
 * schema.js's own factory, not a hand-built object literal.
 */
function selectHouse(houseId) {
  const next = Schema.createSaveState();
  next.characters.char_player = Schema.createCharacterRecord({
    id: 'char_player',
    name: 'Your Esori',
    houseId,
  });
  // The Construct — created here alongside the player, not by
  // tutorial.js, since character creation is this screen's job the same
  // way it already owns creating the player's own record.
  next.characters.char_construct = Schema.createCharacterRecord({
    id: 'char_construct',
    name: 'Construct',
  });
  app.save = next;
  app.houseId = houseId;
  window.WonderlandTutorial.start(app, showScreen);
  showScreen('screen-encounter');
}

function renderVictoryScreen() {
  const house = window.WonderlandHouses.SIX_HOUSES.find((h) => h.id === app.houseId);
  const construct = app.save.characters.char_construct;
  const el = document.getElementById('screen-victory');
  el.innerHTML = `
    <div class="eyebrow">Threshold Crossed</div>
    <h1 class="screen-title">The Construct Doesn't Dissolve So Much As Stop Mattering</h1>
    <p class="victory-line">"You won," NLDR says. "Don't get used to it feeling that clean."</p>
    <p class="victory-summary">Playing as ${house ? house.name : 'an unaffiliated Esori'}. The Construct took ${construct.wounds.length} wound${construct.wounds.length === 1 ? '' : 's'} and never landed one on you.</p>
    <button class="btn" id="btn-restart">Return to House Select</button>
  `;
  document.getElementById('btn-restart').addEventListener('click', () => {
    renderHouseSelectScreen();
    showScreen('screen-house-select');
  }, { once: true });
}

function renderUpdatesScreen(onDone) {
  const el = document.getElementById('screen-updates');
  el.innerHTML = `
    <div class="eyebrow">What's New</div>
    <h1 class="screen-title">Wonderland — v${UI_VERSION}</h1>
    <div class="changelog-list">
      ${CHANGELOG.map((entry) => `
        <div class="changelog-entry">
          <div class="changelog-version">v${entry.version} — ${entry.date}</div>
          <div class="changelog-summary">${entry.summary}</div>
        </div>
      `).join('')}
    </div>
    <button class="btn" id="btn-updates-continue">Continue</button>
  `;
  document.getElementById('btn-updates-continue').addEventListener('click', onDone, { once: true });
}

/*
 * Checkpoint 9 handover §6: compare the stored UI version to the
 * current one on load; if they differ (including "never stored at
 * all," which reads as different by the same comparison — a first-ever
 * visit sees the same one-time screen a returning player would after an
 * update, rather than a separately-decided "skip on first install"
 * rule this handover doesn't ask for), show the changelog once, then
 * persist the new version so it doesn't show again until the next
 * release. Goes through persistence.js's own access layer, unchanged,
 * per §1's non-negotiable — this file never touches IndexedDB directly.
 */
async function checkForUpdates() {
  let storedVersion = null;
  try {
    const record = await Persistence.getEntity(UI_VERSION_KEY);
    storedVersion = record.data.value;
  } catch (e) {
    storedVersion = null; // getEntity throws on a missing key — that's "never stored," not an error to surface
  }
  if (storedVersion === UI_VERSION) {
    return false;
  }
  await Persistence.putEntity(UI_VERSION_KEY, Schema.createWorldStateRecord('choice', {
    id: 'ui_version',
    data: { value: UI_VERSION },
    updatedAt: new Date().toISOString(),
  }));
  return true;
}

async function init() {
  app.save = Schema.createSaveState();
  window.WonderlandTutorial.onComplete = function () {
    renderVictoryScreen();
    showScreen('screen-victory');
  };

  const shouldShowUpdates = await checkForUpdates();
  if (shouldShowUpdates) {
    renderUpdatesScreen(() => {
      renderStartScreen();
      showScreen('screen-start');
    });
    showScreen('screen-updates');
  } else {
    renderStartScreen();
    showScreen('screen-start');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Exposed for the UI-driven Playwright test (drives the real DOM, but
// needs a way to inspect app state after real clicks) and for later
// screens in this same file to build on.
window.WonderlandPlay = { app, showScreen };

})();
