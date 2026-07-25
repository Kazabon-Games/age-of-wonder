'use strict';
/*
 * WONDERLAND: FIRST PRINCIPLES — real World NPC content, ported from
 * aow_gm_screen.html's own `WORLD_NPCS` array.
 *
 * This IS real, already-shipped content — unlike placeholderHouse.js,
 * nothing here is invented. aow_gm_screen.html's own comment on this data
 * says it plainly: "Authored once — nine specific named people, not a
 * generated pool. All content is grounded in the SRD; nothing invented
 * beyond it." Transcribed here are exactly the mechanical fields
 * engine.js's ripple propagation needs (key/name/weight/conductors) plus
 * the two short descriptive fields (role/responds) carried through as
 * flavor context, same way CharacterRecord.name is descriptive rather
 * than engine-evaluated.
 *
 * NOT ported: aow_gm_screen.html's much larger `NPC_DOSSIER` object (per
 * NPC: voice/presence/tell/line, a private wants/fears layer, inter-NPC
 * relations prose, GM-only secrets, leverage-tier gating for revealing
 * each layer). That's real content too, but it's narrative/GM-table
 * material for a presentation layer this repo doesn't have yet — not
 * pure engine data. Worth a future pass once there's a UI to gate it
 * behind real leverage tiers the way the source tool does.
 *
 * Usage: createPoliticalNodeFromWorldNpc(npc) builds a schema.js
 * PoliticalNode ready to seed into SaveState.politicalNodes — the same
 * baseThreshold-by-weight derivation aow_gm_screen.html's own init() uses
 * (high=8, special=3, medium/default=5).
 */

(function (root) {

const Schema =
  typeof module !== 'undefined' && module.exports
    ? require('./schema.js')
    : root.WonderlandSchema;

const WORLD_NPCS = [
  {
    key: 'kingHector',
    name: 'King Hector',
    role: 'The Monarch · Crown of Legitimacy',
    cluster: 'crown',
    weight: 'high',
    responds: 'Demonstrated capability. Political stability. Usefulness to the Crown.',
    conductors: [{ key: 'royalChamberlain', type: 'allied' }],
  },
  {
    key: 'royalChamberlain',
    name: 'Edrin Castellane',
    role: 'Royal Chamberlain · Keeper of Access',
    cluster: 'crown',
    weight: 'high',
    responds: 'Order. Discretion. Loyalty to Hector above all factions.',
    conductors: [{ key: 'kingHector', type: 'allied' }],
  },
  {
    key: 'merchantConsortium',
    name: 'Mira Thessaly',
    role: 'Merchant Guildmaster · Trade & Commerce',
    cluster: 'factions',
    weight: 'medium',
    responds: 'Commercial advantage. Competitor intelligence. Harbor protection.',
    conductors: [
      { key: 'dockworkersForeman', type: 'allied' },
      { key: 'outskirtsBroker', type: 'neutral' },
    ],
  },
  {
    key: 'watchCommander',
    name: 'Bren Calder',
    role: 'Watch Commander · City Watch',
    cluster: 'factions',
    weight: 'medium',
    responds: 'Order. Resources. Actionable threat intelligence.',
    conductors: [
      { key: 'royalChamberlain', type: 'neutral' },
      { key: 'merchantConsortium', type: 'neutral' },
    ],
  },
  {
    key: 'dockworkersForeman',
    name: 'Otto Greave',
    role: 'Dockworkers Foreman · Harbor Labor',
    cluster: 'factions',
    weight: 'medium',
    responds: 'Fair coin. Worker protection. Predictable dealing.',
    conductors: [
      { key: 'merchantConsortium', type: 'allied' },
      { key: 'outskirtsBroker', type: 'neutral' },
    ],
  },
  {
    key: 'courierMaster',
    name: 'Ysolde Farrin',
    role: 'Courier Master · Information Flow',
    cluster: 'factions',
    weight: 'medium',
    responds: 'Coin and information trades. Sells to all parties equally.',
    conductors: [
      { key: 'outskirtsBroker', type: 'allied' },
      { key: 'archivistGeneral', type: 'rival' },
    ],
  },
  {
    key: 'highPriest',
    name: 'Father Corwen Ashe',
    role: 'High Priest of the Axiom · Religious Legitimacy',
    cluster: 'factions',
    weight: 'medium',
    responds: 'Theological alignment. Generosity. Moral consistency.',
    conductors: [
      { key: 'royalChamberlain', type: 'allied' },
      { key: 'archivistGeneral', type: 'allied' },
    ],
  },
  {
    key: 'archivistGeneral',
    name: 'Roven Maddox',
    role: 'Archivist General · Historical Records',
    cluster: 'factions',
    weight: 'medium',
    responds: 'Truth. Knowledge preservation. The long view.',
    conductors: [
      { key: 'highPriest', type: 'allied' },
      { key: 'courierMaster', type: 'rival' },
    ],
  },
  {
    key: 'outskirtsBroker',
    name: '"The Tallyman"',
    role: 'Outskirts Broker · Black Market',
    cluster: 'outskirts',
    weight: 'special',
    responds: 'Coin. Favors. Willingness to operate outside the law.',
    conductors: 'all',
  },
];

function baseThresholdForWeight(weight) {
  if (weight === 'high') return 8;
  if (weight === 'special') return 3;
  return 5;
}

function createPoliticalNodeFromWorldNpc(npc) {
  return Schema.createPoliticalNode({
    id: npc.key,
    name: npc.name,
    baseThreshold: baseThresholdForWeight(npc.weight),
    conductors: npc.conductors,
  });
}

const api = { WORLD_NPCS, baseThresholdForWeight, createPoliticalNodeFromWorldNpc };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (root) {
  root.WonderlandWorldNpcs = api;
}

})(typeof window !== 'undefined' ? window : undefined);
