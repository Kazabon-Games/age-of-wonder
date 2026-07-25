'use strict';
/*
 * WONDERLAND: FIRST PRINCIPLES — Checkpoint 6: the World State bridge.
 *
 * Checkpoint 1's schema defined `entity:npc_042` / `choice:house_alliance`
 * as the ID-keyed shape for "cross-game continuity" — state that outlives
 * a single save, the way a decision made in one session (or one game)
 * should still be true the next time it matters. persistence.js has
 * always been able to read/write records at those keys; nothing has ever
 * generated or consumed one. This file is that missing piece.
 *
 * Pure, like engine.js and schema.js — no IndexedDB calls of its own.
 * Converting a live SaveState's worldFlags/politicalNodes into
 * WorldStateRecords (and back) is data transformation, not a persistence
 * concern; the caller is responsible for actually writing/reading each
 * record through persistence.js's putEntity/getEntity, one call per key,
 * same as anywhere else that module is used. Keeping this pure means it's
 * unit-testable in plain Node, exactly like engine.js.
 *
 * Key mapping, chosen to match Checkpoint 1's own example keys directly:
 *   - SaveState.worldFlags[flagId]      -> "choice:<flagId>"   (kind: 'choice')
 *   - SaveState.politicalNodes[nodeId]  -> "entity:<nodeId>"   (kind: 'entity')
 * A world flag IS a recorded choice; a political node IS an entity in the
 * world (an NPC or faction) — this isn't an arbitrary assignment, it's
 * the same distinction the original doc's two example keys already draw.
 *
 * What this deliberately does NOT do: decide what any flagId or
 * politicalNode actually MEANS narratively, or when export/import should
 * run. That's game-loop/content-layer policy, not this bridge's concern —
 * same content-agnostic discipline as GRANT_TECHNIQUE/
 * ACTIVATE_TRANSFORMATION.
 */

(function (root) {

const Schema =
  typeof module !== 'undefined' && module.exports
    ? require('./schema.js')
    : root.WonderlandSchema;

function worldStateKeyForFlag(flagId) {
  return `choice:${flagId}`;
}

function worldStateKeyForPoliticalNode(nodeId) {
  return `entity:${nodeId}`;
}

/*
 * importWorldState builds worldFlags/politicalNodes by assigning to a
 * plain {}-literal object keyed by record.id, an external/caller-supplied
 * string. Unlike engine.js's applySetWorldFlag (which only ever assigns a
 * boolean/string/number — a value type the `__proto__` accessor's setter
 * silently ignores, per spec, leaving the object's prototype untouched),
 * this file assigns whole objects (a politicalNode record, or an
 * unrestricted worldFlag value). Object.prototype.hasOwnProperty.call
 * won't save us here the way it does in engine.js's findCharacter/
 * findPoliticalNode: the danger isn't a false-positive lookup, it's that
 * `target['__proto__'] = someObject` really does replace target's own
 * prototype with someObject, silently corrupting every later lookup on
 * that specific worldFlags/politicalNodes object (Object.keys/
 * JSON.stringify/structuredClone would just silently lose the entry
 * rather than throw). Reject '__proto__' outright instead of relying on
 * a subtler distinction elsewhere. Deliberately NOT rejecting
 * 'constructor'/'prototype' too — verified those have no special setter
 * behavior on a plain object, `target.constructor = x` just creates an
 * ordinary own property, so a real flagId/nodeId that happens to be one
 * of those words isn't a threat.
 */
function assertSafeStateId(id, context) {
  if (id === '__proto__') {
    throw new Error(`wonderland/worldStateBridge: "${id}" cannot be used as a ${context} id — it collides with JavaScript's own object prototype chain`);
  }
}

/**
 * Turns a live SaveState's worldFlags and politicalNodes into an array of
 * { key, record } pairs, each ready to hand to persistence.js's
 * putEntity(key, record) unchanged.
 */
function exportWorldState(saveState) {
  const now = new Date().toISOString();
  const records = [];

  Object.keys(saveState.worldFlags).forEach((flagId) => {
    records.push({
      key: worldStateKeyForFlag(flagId),
      record: Schema.createWorldStateRecord('choice', {
        id: flagId,
        data: { value: saveState.worldFlags[flagId] },
        updatedAt: now,
      }),
    });
  });

  Object.keys(saveState.politicalNodes).forEach((nodeId) => {
    records.push({
      key: worldStateKeyForPoliticalNode(nodeId),
      record: Schema.createWorldStateRecord('entity', {
        id: nodeId,
        data: saveState.politicalNodes[nodeId],
        updatedAt: now,
      }),
    });
  });

  return records;
}

/**
 * The reverse: takes WorldStateRecords (as read back via persistence.js's
 * getEntity, one call per key) and reconstructs the worldFlags/
 * politicalNodes shape a caller merges into a fresh SaveState — e.g.
 * `Object.assign(newSaveState, importWorldState(records))`. Throws
 * loudly on a record of unknown kind rather than silently dropping it,
 * consistent with this codebase's fail-loudly discipline everywhere else.
 */
function importWorldState(records) {
  const worldFlags = {};
  const politicalNodes = {};

  records.forEach(({ record }) => {
    if (record.kind === 'choice') {
      assertSafeStateId(record.id, 'worldFlag');
      worldFlags[record.id] = record.data.value;
    } else if (record.kind === 'entity') {
      assertSafeStateId(record.id, 'politicalNode');
      politicalNodes[record.id] = record.data;
    } else {
      throw new Error(`wonderland/worldStateBridge: unknown WorldStateRecord kind "${record.kind}"`);
    }
  });

  return { worldFlags, politicalNodes };
}

const api = { worldStateKeyForFlag, worldStateKeyForPoliticalNode, exportWorldState, importWorldState };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (root) {
  root.WonderlandWorldStateBridge = api;
}

})(typeof window !== 'undefined' ? window : undefined);
