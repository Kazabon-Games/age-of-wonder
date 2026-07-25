'use strict';
/*
 * WONDERLAND: FIRST PRINCIPLES — the canonical six-house registry.
 *
 * REAL content, not placeholder. Five of these houses come directly from
 * real player-created aow_heir_record.html exports (Miran of House Aethra,
 * Ye K'ali of House Ye, Griffith Lightwell of House Lightwell, Alaric
 * Aurelius Lionheart II of House Lionheart, Emily der Dachs of House
 * Badgerhold) — their identity fields (seat, colors, sigil, orientation,
 * ideals, shadow, founding, wound) are transcribed from those files
 * verbatim, not invented. The sixth (House Corvane) is authored fresh to
 * complete the roster, matching the same depth and style.
 *
 * aow_srd.html ch1-districts is explicit: "Six noble houses govern six
 * cities... military, mercantile, religious, scholarly, agricultural, or
 * magical" — one house per type. The five real houses don't map cleanly:
 * Aethra AND Lionheart both landed on Military (independent player
 * choices, made before this six-house structure existed), and Trade
 * (mercantile) and Scholarly were both completely unrepresented.
 * Resolved, with Kazabon's explicit sign-off to adjust rather than force
 * a redundant roster: House Lionheart is classified here as the Trade
 * house, not Military — its own real data already leans that way
 * (orientation.hold: "Wealth", resource: "Hidden wealth", conquest that
 * functions as profitable expansion) even though its player picked the
 * Military DISTRICT on their own character sheet. That original heir
 * file is untouched; this is only how Wonderland's world-building
 * classifies the house's political type. House Corvane fills the
 * remaining gap, Scholarly.
 *
 * What's NEW here, authored for Wonderland specifically (none of this
 * exists in any AOW suite file — Checkpoint 4's research confirmed
 * Kit/Theme/Transformation content doesn't exist anywhere real): each
 * house's theme (a one-phrase philosophy every one of its abilities'
 * `houseTheme` field carries), its Kit description, 1 themed ability, and
 * 1 Transformation form with a real unlock condition. Every one of these
 * is grounded in that house's own established identity (its orientation,
 * ideals, founding, shadow, wound) rather than generic reskins of each
 * other — see each house's inline reasoning.
 *
 * Mechanically real, not descriptive-only: every ability and granted
 * Transformation technique is a full Technique object (schema.js
 * createTechnique), usable through the exact same DECLARE_ACTION/
 * RESOLVE_EXCHANGE flow as any combat-trained technique. Unlock
 * conditions deliberately exercise all three types engine.js supports
 * (staminaAtLeast, woundCountAtLeast, leverageAtLeast) across different
 * houses — see tests/wonderland-engine-adversarial.js for the real,
 * hand-verified proof.
 *
 * `firstPrinciple` reconciliation (added once WONDERLAND_RPG_FLAGSHIP_
 * DESIGN.md was supplied, after this content already existed): every
 * ability/granted technique below is also tagged with one of the design
 * doc's four canonical First Principles (distinction/relation/
 * transformation/persistence, schema.js's FIRST_PRINCIPLES), classified
 * by what each ability actually mechanically does — NOT by its
 * `houseTheme` motto, which is a separate, purely narrative axis.
 * Deliberately none of the 12 are tagged "transformation": that Principle
 * (a stance/form shift that changes what a character's existing kit
 * does) is already what the engine's own ACTIVATE_TRANSFORMATION action
 * structurally embodies — the individual abilities a Transformation form
 * grants are classified by their own payload effect instead.
 */

(function (root) {

const Schema =
  typeof module !== 'undefined' && module.exports
    ? require('./schema.js')
    : root.WonderlandSchema;

// ─── House Aethra — Military — Theme: "The Undercurrent" ───
// Real data: orientation Mobility/Loyalty/Transform; founding won in
// battle via a Transposition "Spellweave" against a blood-ritual regent;
// shadow is Miran's own resistance-network smuggling; house identity is
// martial strength inseparable from a hidden loyal network beneath it.
// Ability reflects Mobility (a Move-costed always-available technique).
// Transformation's woundCountAtLeast(2) echoes that the founding battle
// was won only after real losses, not a clean victory.
const houseAethra = Schema.createHouseRecord({
  id: 'house_aethra',
  name: 'House Aethra',
  seat: 'Aetherdrift',
  colorPrimary: '#04e1f1',
  colorSecondary: '#86099f',
  sigilDesc: 'A seed of life repeating pattern',
  district: 'military',
  orientation: { acquire: 'Mobility', hold: 'Loyalty', use: 'Transform' },
  ideal1: 'Justice',
  ideal2: 'Knowledge',
  shadow: 'A criminal connection',
  shadowDetail: "Miran is a rogue, cad, gambler and adventurer. Not only does he steal and fence expensive goods, Miran has become involved with a resistance network outlawed by the King that provides goods and services free of charge to the destitute and impoverished.",
  founding: 'Won in battle',
  foundingDetail: "House Aethra were magisters for House Kairn, who ruled the Aether drifts, but when House Kairn's regent began using their subjects for blood rituals, Miran's grandfather raised an army against their Generals and decisively captured the resources of the Aether Drifts with a Spellweave.",
  wound: 'A death that weakened succession',
  woundDetail: "The Lord of the House, Miran's father Estebor, passed two years previously from a withering disease. Miran's mother is now the Lady of the House; Miran has been reticent to truly hold the reins as heir.",
  heirStanding: 'Complicated — capable but the relationship is fraught',
  resources: ['Military reserve', 'Spy network', 'Ancestral artifact'],
  kitDescription: 'Soldiers of House Aethra fight with one hand on the sword and one hand on the network beneath the city — mobility and loyalty bought as often as commanded.',
  abilities: [
    Schema.createTechnique({
      id: 'tech_aethra_spy_opening',
      name: "Spy's Opening",
      houseTheme: 'The Undercurrent',
      // Reconnaissance is perceiving a hidden connection to the battlefield
      // itself — matches Relation ("bind, summon, link") more than it
      // isolates/removes anything or grants a lasting resource.
      firstPrinciple: 'relation',
      trigger: null,
      slotCost: ['move'],
      effect: "Reposition and read the field at once — the ancestral artifact's gift, mobility that doubles as reconnaissance.",
    }),
  ],
  transformationForms: [
    Schema.createTransformationForm({
      id: 'form_aethra_regents_reckoning',
      name: "The Regent's Reckoning",
      description: "The battle House Aethra won was never clean. This form doesn't surface until the cost of holding ground has been paid in full.",
      unlockCondition: { type: 'woundCountAtLeast', count: 2 },
      grantedTechnique: Schema.createTechnique({
        id: 'tech_aethra_spellweave',
        name: 'Ancestral Spellweave',
        houseTheme: 'The Undercurrent',
        // Transposition is literally a positional exchange between two
        // combatants — a bind between self and opponent for the swap.
        firstPrinciple: 'relation',
        trigger: { type: 'opponentCommitsSlots', slots: ['act', 'move'] },
        slotCost: ['act', 'react'],
        resolvesRegardlessOfInitiative: true,
        effect: "Transposition-born counter — swap positions with the overcommitted advance and land the strike meant for you, the same working that captured the Aether Drifts.",
      }),
    }),
  ],
  startingEquipment: [],
});

// ─── House Ye — Magical — Theme: "The Measured Scale" ───
// Real data: orientation Influence/Knowledge/Suppress; sigil is literally
// Scales; ideals Legacy/Service to the Crown; Ye K'ali is specifically
// the Third Heir, favored despite that, and her revealed school is
// Divination even after years leaning Dominion study — a house that
// weighs what it knows before spending any of it.
const houseYe = Schema.createHouseRecord({
  id: 'house_ye',
  name: 'House Ye',
  seat: 'Ætherian Citadel',
  colorPrimary: '#ffffff',
  colorSecondary: '#d4b013',
  sigilDesc: 'Scales',
  district: 'magical',
  orientation: { acquire: 'Influence', hold: 'Knowledge', use: 'Suppress' },
  ideal1: 'Legacy',
  ideal2: 'Service to the Crown',
  shadow: 'A heretical belief',
  shadowDetail: 'Third heir favored',
  founding: 'Founded the city itself',
  foundingDetail: 'Innovation',
  wound: 'A scandal that became public',
  woundDetail: 'Leaked information on flagged spell experimentation.',
  heirStanding: "Favored — the councillor's clear and stated choice",
  resources: ['Religious influence'],
  kitDescription: 'House Ye holds knowledge like a ledger — every truth weighed, most kept, some spent exactly when spending them tips the scale.',
  abilities: [
    Schema.createTechnique({
      id: 'tech_ye_weighed_words',
      name: 'Weighed Words',
      houseTheme: 'The Measured Scale',
      // Deploying read information as leverage against a target is a bond
      // between the character and that target (matches politicalNodes'
      // own per-actor leverage model) — Relation, not a removal or ward.
      firstPrinciple: 'relation',
      trigger: null,
      slotCost: ['act'],
      effect: 'A Divination-born read of the room, spoken as diplomacy — information deployed as leverage rather than magic.',
    }),
  ],
  transformationForms: [
    Schema.createTransformationForm({
      id: 'form_ye_third_heirs_gambit',
      name: "The Third Heir's Gambit",
      description: "Ye K'ali was never meant to be the favored heir. This form only answers once the Archivist General — Shemsara's actual Scholarly-district authority — has noticed her.",
      // Real heir data (Ye K'ali's own startingLeverage) uses the faction
      // key "scholarsGuild"; aow_gm_screen.html's real WORLD_NPCS has no
      // node by that name — it keys the same institution's leader by
      // person-role instead ("archivistGeneral", Roven Maddox). A real
      // naming inconsistency between the two AOW suite systems, not a
      // typo here — using the node that actually exists in the ripple
      // graph this engine can evaluate against.
      unlockCondition: { type: 'leverageAtLeast', nodeId: 'archivistGeneral', score: 2 },
      grantedTechnique: Schema.createTechnique({
        id: 'tech_ye_sovereign_read',
        name: 'Sovereign Read',
        houseTheme: 'The Measured Scale',
        // A decisive counter that negates the opponent's advantage the
        // instant they fully commit — removing their overcommitment's
        // value, not binding to them or granting a lasting effect.
        firstPrinciple: 'distinction',
        trigger: { type: 'opponentCommitsSlots', slots: ['act', 'react'] },
        slotCost: ['act'],
        resolvesRegardlessOfInitiative: true,
        effect: 'A Divination read pressed to its limit — the scale tips the instant the opponent commits fully, and House Ye already knew which way.',
      }),
    }),
  ],
  startingEquipment: [],
});

// ─── House Lightwell — Religious — Theme: "Veiled Radiance" ───
// Real data: orientation Law/Secrecy/Reveal; sigil a pillar of light
// between cupped hands (radiance deliberately held, not displayed);
// Griffith's own philosophical orientation is "Purist — every cast is an
// act of reverence," and his school is Negation — faith expressed as
// principled refusal, not force.
const houseLightwell = Schema.createHouseRecord({
  id: 'house_lightwell',
  name: 'House Lightwell',
  seat: 'Solastia',
  colorPrimary: '#ffffff',
  colorSecondary: '#ffff00',
  sigilDesc: 'A pillar of light between cupped hands',
  district: 'religious',
  orientation: { acquire: 'Law', hold: 'Secrecy', use: 'Reveal' },
  ideal1: 'Faith',
  ideal2: 'Strength',
  shadow: 'A concealed bloodline',
  shadowDetail: '',
  founding: 'Sealed by marriage',
  foundingDetail: '',
  wound: 'A death that weakened succession',
  woundDetail: '',
  heirStanding: 'Contested — another heir rivals your position',
  resources: ['Military reserve', 'Spy network', 'Religious influence'],
  kitDescription: 'Faith held in reserve — House Lightwell reveals only what the moment demands, a pillar of light that stays cupped in shadow until it must shine.',
  abilities: [
    Schema.createTechnique({
      id: 'tech_lightwell_cupped_flame',
      name: 'Cupped Flame',
      houseTheme: 'Veiled Radiance',
      // Explicitly a ward in its own effect text — the design doc names
      // wards directly under Persistence.
      firstPrinciple: 'persistence',
      trigger: null,
      slotCost: ['react'],
      effect: "A Negation-born ward, faith turned into refusal — unconform the world's permission for the incoming harm to continue.",
    }),
  ],
  transformationForms: [
    Schema.createTransformationForm({
      id: 'form_lightwell_reverence_undimmed',
      name: 'Reverence Undimmed',
      description: 'Every cast is an act of reverence — but reverence shown easily isn\'t reverence at all. This form only reveals itself under real pressure.',
      unlockCondition: { type: 'staminaAtLeast', stage: 'strained' },
      grantedTechnique: Schema.createTechnique({
        id: 'tech_lightwell_unhidden_pillar',
        name: 'The Unhidden Pillar',
        houseTheme: 'Veiled Radiance',
        // The same Negation ward taken to full strength — still a warding
        // effect, so still Persistence, not a different Principle.
        firstPrinciple: 'persistence',
        trigger: null,
        slotCost: ['act', 'move', 'react'],
        resolvesRegardlessOfInitiative: true,
        effect: 'The pillar uncups completely — full Negation cast at the exact moment concealment stops being the more faithful choice.',
      }),
    }),
  ],
  startingEquipment: [],
});

// ─── House Lionheart — Trade (reassigned; see file header) — Theme:
// "The Conqueror's Ledger" ───
// Real data: orientation Force/Wealth/Expand; founding claimed through
// conquest; wound is the Aurelia Bastion, a magic-fueled dreadnought that
// blew up over mismanaged ore — a war machine that was also, first, an
// economic asset. Strength and tradition in service of accumulation, not
// strength for its own sake.
const houseLionheart = Schema.createHouseRecord({
  id: 'house_lionheart',
  name: 'House Lionheart',
  seat: 'Solari Aurelia',
  colorPrimary: '#ffdb29',
  colorSecondary: '#000f0b',
  sigilDesc: 'A lion surrounded by swords',
  district: 'mercantile', // reassigned from the heir file's own "Military" — see file header
  orientation: { acquire: 'Force', hold: 'Wealth', use: 'Expand' },
  ideal1: 'Strength',
  ideal2: 'Tradition',
  shadow: 'An illegitimate claim to the seat',
  shadowDetail: '',
  founding: 'Claimed through conquest',
  foundingDetail: 'House Lionheart were and are to this day rooted in strength and power, who gained their power by crushing those beneath them and making them bend the knee.',
  wound: 'A magical catastrophe',
  woundDetail: 'The Aurelia Bastion, a floating dreadnought fuelled by magic, blew up over mismanagement of proper magical ores.',
  heirStanding: 'Complicated — capable but the relationship is fraught',
  resources: ['Military reserve', 'Hidden wealth'],
  kitDescription: "What House Lionheart cannot hold by force, it holds by wealth taken in force's name — conquest that pays for itself, expansion that never quite stops being profitable.",
  abilities: [
    Schema.createTechnique({
      id: 'tech_lionheart_spoils_counted',
      name: 'Spoils Counted',
      houseTheme: "The Conqueror's Ledger",
      // A held gain from seizing ground, matching the house's "hold:
      // Wealth" orientation and Persistence's resource-management framing
      // — not a removal, and no other entity is being bound to.
      firstPrinciple: 'persistence',
      trigger: null,
      slotCost: ['act'],
      effect: "A Transposition-quick seizure — take the ground, take what's on it.",
    }),
  ],
  transformationForms: [
    Schema.createTransformationForm({
      id: 'form_lionheart_bastions_echo',
      name: "The Bastion's Echo",
      description: 'It takes a ruin on the scale of the Aurelia Bastion to summon this — House Lionheart at its most costly and most dangerous.',
      unlockCondition: { type: 'woundCountAtLeast', count: 3 },
      grantedTechnique: Schema.createTechnique({
        id: 'tech_lionheart_aurelias_last_volley',
        name: "Aurelia's Last Volley",
        houseTheme: "The Conqueror's Ledger",
        // A decisive punishing counter-burst that ends the opponent's
        // overextension outright — removal of their advantage, matching
        // the other overcommitment-punishing counters below.
        firstPrinciple: 'distinction',
        trigger: { type: 'opponentCommitsSlots', slots: ['act', 'move'] },
        slotCost: ['act', 'react'],
        resolvesRegardlessOfInitiative: true,
        effect: "The dreadnought's last discharge, remembered in the body — a Transposition burst that answers overextension with the same mismanaged force that once ended the Bastion.",
      }),
    }),
  ],
  startingEquipment: [],
});

// ─── House Badgerhold — Agricultural — Theme: "Earned Ground" ───
// Real data: orientation Commerce/Loyalty/Transform; sigil a honey badger
// taking out a snake; shadow is the house's own commoner bloodline,
// looked down on by older houses; founding is literally "worked hard
// from the bottom up to the top." Nothing here was inherited.
const houseBadgerhold = Schema.createHouseRecord({
  id: 'house_badgerhold',
  name: 'House Badgerhold',
  seat: 'Agri sector',
  colorPrimary: '#f0ec42',
  colorSecondary: '#006a00',
  sigilDesc: 'The sigil is that of a honey badger taking out a snake.',
  district: 'agricultural',
  orientation: { acquire: 'Commerce', hold: 'Loyalty', use: 'Transform' },
  ideal1: 'Strength',
  ideal2: 'Unity',
  shadow: 'An illegitimate claim to the seat',
  shadowDetail: "Most other houses look down upon Badgerhold due to their bloodline not being of noble descent, rather from commoner descent.",
  founding: 'Founded the city itself',
  foundingDetail: 'Badgerhold was founded by the der Dachs family, who worked hard from the bottom up to the top.',
  wound: 'A magical catastrophe',
  woundDetail: "A recent accident at one of the potion factories caused the area where the factory was to become uninhabitable, thanks to upper management ignoring safety regulations.",
  heirStanding: "Favored — the councillor's clear and stated choice",
  resources: ['Trade network', 'Foreign alliance'],
  kitDescription: "Nothing House Badgerhold holds was given — the badger doesn't ask the snake's permission to take back the burrow.",
  abilities: [
    Schema.createTechnique({
      id: 'tech_badgerhold_bottom_up',
      name: 'Bottom-Up',
      houseTheme: 'Earned Ground',
      // Conjuration is literally summoning — the design doc names
      // "summoned allies" directly under Relation.
      firstPrinciple: 'relation',
      trigger: null,
      slotCost: ['react'],
      effect: "Conjuration-quick — call up what's needed from the ground itself, the way the family always has.",
    }),
  ],
  transformationForms: [
    Schema.createTransformationForm({
      id: 'form_badgerhold_honest_bite',
      name: 'The Honest Bite',
      description: "Badgerhold's commerce isn't a favor from the old houses — it's a foothold in the market they can't ignore. This form only surfaces once that foothold is real.",
      unlockCondition: { type: 'leverageAtLeast', nodeId: 'merchantConsortium', score: 2 },
      grantedTechnique: Schema.createTechnique({
        id: 'tech_badgerhold_snake_in_grain',
        name: 'Snake in the Grain',
        houseTheme: 'Earned Ground',
        // Despite the Conjuration flavor, mechanically this is the same
        // decisive punish-the-overcommitment counter shape as the other
        // Transformation-granted counters — classified by that shape, not
        // by its spell-school label.
        firstPrinciple: 'distinction',
        trigger: { type: 'opponentCommitsSlots', slots: ['act', 'react'] },
        slotCost: ['act'],
        resolvesRegardlessOfInitiative: true,
        effect: 'A Conjuration counter-strike, timed the way a badger takes a snake — not first, but decisively, the instant the opening is real.',
      }),
    }),
  ],
  startingEquipment: [],
});

// ─── House Corvane — Scholarly (fabricated to complete the roster; see
// file header) — Theme: "The Long Memory" ───
// Authored fresh, matching the other five houses' depth and the SRD's
// real Scholarly-district description (ch1-districts: "Archive, academy,
// scriptorium... any document the Guild has decided belongs in the long
// memory of the kingdom lives in this district").
const houseCorvane = Schema.createHouseRecord({
  id: 'house_corvane',
  name: 'House Corvane',
  seat: 'Velmara',
  colorPrimary: '#241b3d',
  colorSecondary: '#c9c9c9',
  sigilDesc: 'An open book with a single unblinking eye where the text should be',
  district: 'scholarly',
  orientation: { acquire: 'Knowledge', hold: 'Secrecy', use: 'Reveal' },
  ideal1: 'Truth',
  ideal2: 'Legacy',
  shadow: 'A heretical belief',
  shadowDetail: "House Corvane's founding archivists preserved texts the Church of the Axiom ruled heretical rather than destroy them, and the family has never fully renounced the belief that some knowledge is worth the danger of keeping.",
  founding: 'Founded the city itself',
  foundingDetail: "House Corvane built Velmara around a single vault of pre-Aetheria Nova records its founders refused to hand over to the Crown unexamined, and has been the kingdom's memory — official and otherwise — ever since.",
  wound: 'A scandal that became public',
  woundDetail: "A junior archivist sold restricted research to a foreign buyer three years ago. House Corvane caught it, but not before the sale completed, and the Scholars Guild has questioned their vault security ever since.",
  heirStanding: 'Uncertain — the councillor has not yet chosen a favorite',
  resources: ['Spy network', 'Ancestral artifact'],
  kitDescription: 'House Corvane keeps what everyone else forgets, and reveals it exactly when forgetting stops being safe.',
  abilities: [
    Schema.createTechnique({
      id: 'tech_corvane_marginal_note',
      name: 'Marginal Note',
      houseTheme: 'The Long Memory',
      // Information that persists across time and resurfaces when needed
      // — matches Persistence's "lingers into later chapters" framing,
      // not a removal or a bind to another entity.
      firstPrinciple: 'persistence',
      trigger: null,
      slotCost: ['react'],
      effect: "A Divination-quick recollection — the record remembers what the moment doesn't.",
    }),
  ],
  transformationForms: [
    Schema.createTransformationForm({
      id: 'form_corvane_unsealed_vault',
      name: 'The Unsealed Vault',
      description: 'What Corvane keeps sealed is worth more than what it reveals — until the Archivist General himself needs the vault opened.',
      unlockCondition: { type: 'leverageAtLeast', nodeId: 'archivistGeneral', score: 2 },
      grantedTechnique: Schema.createTechnique({
        id: 'tech_corvane_what_vault_remembers',
        name: 'What the Vault Remembers',
        houseTheme: 'The Long Memory',
        // Same decisive punish-the-overcommitment counter shape as the
        // other Transformation-granted techniques above.
        firstPrinciple: 'distinction',
        trigger: { type: 'opponentCommitsSlots', slots: ['act', 'react'] },
        slotCost: ['act'],
        resolvesRegardlessOfInitiative: true,
        effect: "A Divination strike pulled from the long record — the vault opens for exactly one truth, aimed at the opponent who just committed to everything.",
      }),
    }),
  ],
  startingEquipment: ["archivist's cipher-key"],
});

const SIX_HOUSES = [houseAethra, houseYe, houseLightwell, houseLionheart, houseBadgerhold, houseCorvane];

const api = {
  houseAethra,
  houseYe,
  houseLightwell,
  houseLionheart,
  houseBadgerhold,
  houseCorvane,
  SIX_HOUSES,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (root) {
  root.WonderlandHouses = api;
}

})(typeof window !== 'undefined' ? window : undefined);
