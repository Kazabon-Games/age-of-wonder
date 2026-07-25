'use strict';
/*
 * WONDERLAND: FIRST PRINCIPLES — Checkpoint 3 heir-record import adapter.
 *
 * Maps a real aow_heir_record.html JSON export (Document II, "exports a
 * JSON file your GM imports into the world state engine") into
 * Wonderland's schema.js shapes. This is the actual Checkpoint 3
 * vertical-slice boundary: a real, already-shipped session-zero tool on
 * one side, Wonderland's pure engine on the other.
 *
 * The required-vs-default field discipline here deliberately mirrors
 * aow_play_sheet.html's own importFromS0() — that function is a proven,
 * bug-fixed reference implementation (see its comments on the "adjacent
 * school" spell-tag bug and the additive-vs-reset re-import behavior),
 * not something to redesign from scratch. Two differences from that
 * function, both because this module has no DOM to alert()/confirm()
 * with and returns data instead of mutating a global `state`:
 *   - Missing name/revealed-school still throws (this record truly isn't
 *     usable without them), but an unsupported version becomes a
 *     `warnings` entry in the result instead of a blocking confirm()
 *     dialog — the caller decides whether to proceed, not this module.
 *   - Signature techniques import with `trigger: null` and the real
 *     free-text placeholder in `rawTriggerText`, never a guessed
 *     structured trigger — see schema.js createTechnique's own comment.
 */

(function (root) {

// Scoped inside this IIFE, not at top-level module/global scope — schema.js
// and engine.js, when loaded as plain <script> tags (no module system),
// share one global lexical scope, and a top-level `const Schema` here would
// risk colliding with any other file that picks the same name. See
// engine.js's own header comment for the bug this exact mistake caused
// there during Checkpoint 1.
const Schema =
  typeof module !== 'undefined' && module.exports
    ? require('./schema.js')
    : root.WonderlandSchema;

const SUPPORTED_S0_VERSIONS = ['1.0', '1.1'];

/**
 * @param {Object} raw - parsed JSON from an aow_heir_record.html export
 * @returns {{ character: Object, house: Object, startingLeverage: Object, warnings: string[] }}
 * @throws if the record is missing what makes it usable at all (no name, no revealed school)
 */
function importHeirRecord(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('wonderland/importHeirRecord: expected a parsed heir record object, got ' + typeof raw);
  }

  const warnings = [];
  const version = raw.version || '1.0'; // pre-versioning exports had no field — treat as 1.0, same as the real tool
  if (!SUPPORTED_S0_VERSIONS.includes(version)) {
    warnings.push(
      `This record was exported by version ${version} of the Heir's Record, which this importer doesn't recognize (supports: ${SUPPORTED_S0_VERSIONS.join(', ')}). Import may be incomplete or incorrect.`
    );
  }

  const identity = raw.identity || {};
  const heirName = (identity.givenName || identity.name || '').trim();
  const revealedSchool = raw.awakening?.revealedSchool || '';
  if (!heirName || !revealedSchool) {
    throw new Error(
      "wonderland/importHeirRecord: this record is missing a name or a revealed school — the Heir's Record must be fully complete, including the Awakening, before it can be imported"
    );
  }

  const combatProfile = raw.combatProfile || {};
  const house = raw.house || {};
  const exploration = raw.explorationProfile || {};

  const characterId = slugify(heirName);
  const houseId = house.name ? slugify(house.name) : null;

  const character = Schema.createCharacterRecord({
    id: characterId,
    name: heirName,
    houseId,
    weaponSpecialty: normalizeWeaponSpecialty(combatProfile.weaponSpecialty),
    techniques: importSignatureTechnique(combatProfile),
    spells: importStartingSpells(raw.awakening, warnings),
    capstone: raw.capstone ? { ...raw.capstone, usedThisSession: false } : null,
    contacts: importContacts(raw.npcs, identity),
  });

  const houseRecord = houseId
    ? Schema.createHouseRecord({
        id: houseId,
        name: house.name || '',
        kitDescription: [house.ideal1, house.ideal2].filter(Boolean).join(' / '),
        // abilities/transformationForms are Wonderland-specific game content
        // the real Heir Record was never designed to produce — it carries
        // house *identity* (name, sigil, colors, ideals, shadow), not
        // Principle-tagged mechanics. Left empty on purpose: this is where
        // Kazabon's own authored house content still needs to go, not
        // something to infer from identity fields.
        abilities: [],
        transformationForms: [],
      })
    : null;

  // Leverage is per-heir (aow_srd.html ch3-leverage), but political nodes
  // are shared SaveState-level state (schema.js createPoliticalNode) that
  // this function has no access to and shouldn't invent — the caller
  // seeds/updates politicalNodes[key].scores[characterId] for each entry
  // here via MODIFY_LEVERAGE, once the target nodes exist.
  const startingLeverage = { ...(raw.startingLeverage || {}) };

  if (exploration.civilizationSpecialty === undefined) {
    // Not fatal — just means this heir has no ruins specialization, a
    // legitimate real state, not a data gap. No warning needed.
  }

  return { character, house: houseRecord, startingLeverage, warnings };
}

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeWeaponSpecialty(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  return Schema.WEAPON_SPECIALTIES.includes(key) ? key : null;
}

function importSignatureTechnique(combatProfile) {
  if (!combatProfile.signatureTechnique) return [];
  // Matches aow_play_sheet.html's real default exactly — a freshly
  // imported signature technique has no machine-readable trigger, only
  // this placeholder prose, until a GM formalizes it at the table.
  return [
    Schema.createTechnique({
      id: 'tech_signature',
      name: combatProfile.signatureTechnique,
      trigger: null,
      rawTriggerText: 'Defined by fighting style — confirm with GM',
      effect: 'Your signature technique. Once trigger, slot cost, and stamina dependency are confirmed with your GM, replace this entry with the full details.',
    }),
  ];
}

function importStartingSpells(awakening, warnings) {
  if (!awakening?.startingSpells) return [];
  // A malformed export (or a hand-edited/hostile one) could carry
  // startingSpells as something other than an array — a bare string has
  // its own truthy `.length`, so a naive `!x.length` guard lets it
  // through and `.forEach` then throws a raw, unhelpful native TypeError
  // far from this file's own error-message discipline. Fail loudly here
  // instead, with a message that actually says what's wrong.
  if (!Array.isArray(awakening.startingSpells)) {
    throw new Error(
      `wonderland/importHeirRecord: awakening.startingSpells must be an array, got ${typeof awakening.startingSpells}`
    );
  }
  if (awakening.startingSpells.length === 0) return [];
  const schoolKey = awakening.revealedSchool;
  const spells = [];
  awakening.startingSpells.forEach((spellName, i) => {
    if (typeof spellName !== 'string') {
      throw new Error(
        `wonderland/importHeirRecord: awakening.startingSpells[${i}] must be a string, got ${typeof spellName}`
      );
    }
    // A retired auto-grant rule (see aow_play_sheet.html's own comment on
    // this) tagged some older exports' spells "(adjacent)" or "*" — never
    // part of the real SRD, which has no adjacent-school concept. Skipped
    // on import rather than relabeled, since silently stripping the tag
    // and keeping the spell under the heir's primary school would
    // misattribute it to a school it was never actually granted from.
    if (spellName.includes('(adjacent)') || spellName.includes('*')) {
      warnings.push(`Skipped starting spell "${spellName}" — tagged by a retired auto-grant rule, not part of the current SRD.`);
      return;
    }
    spells.push(
      Schema.createSpell({
        id: 'spell_' + slugify(spellName),
        name: spellName.trim(),
        tier: 1,
        school: schoolKey || null,
      })
    );
  });
  return spells;
}

function importContacts(npcs, identity) {
  if (!npcs) return [];
  const contacts = [];
  const councillor = npcs.councillor;
  if (councillor?.name) {
    contacts.push({
      name: councillor.name,
      faction: identity.councillorTitle || 'Councillor',
      want: councillor.goal || '—',
      know: [
        councillor.reputation ? `Reputation: ${councillor.reputation}` : '',
        councillor.fear ? `Fears: ${councillor.fear}` : '',
        councillor.expects ? `Expects: ${councillor.expects}` : '',
      ]
        .filter(Boolean)
        .join(' · ') || '—',
      available: 'Check with GM',
      type: 'ally',
      activated: false,
    });
  }
  ['ally', 'rival', 'contact', 'wildCard'].forEach((key) => {
    const npc = npcs[key];
    if (!npc?.name) return;
    const isRival = key === 'rival';
    contacts.push({
      name: npc.name,
      faction: npc.faction || npc.category || '—',
      want: npc.want || npc.goal || '—',
      know: isRival ? npc.leverage || '—' : npc.knows || npc.significance || '—',
      available: isRival ? 'Active opposition — not a resource' : 'Check with GM',
      type: isRival ? 'rival' : 'ally',
      activated: false,
    });
  });
  return contacts;
}

const api = { importHeirRecord, SUPPORTED_S0_VERSIONS };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (root) {
  root.WonderlandImportHeirRecord = api;
}

})(typeof window !== 'undefined' ? window : undefined);
