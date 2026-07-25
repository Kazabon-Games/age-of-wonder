'use strict';
/*
 * WONDERLAND: FIRST PRINCIPLES — Checkpoint 1 persistence access layer.
 *
 * The ONE module allowed to touch IndexedDB (§0 of
 * WONDERLAND_RPG_HANDOVER_CHECKPOINT1.md: "Every read/write to save state,
 * World State, or the Essence ledger goes through a single module — never
 * scattered direct calls across the codebase"). engine.js and schema.js
 * never import this file; this file is the only one that imports them.
 *
 * Browser-only by nature — IndexedDB has no meaningful Node equivalent —
 * so unlike schema.js/engine.js this does not export a module.exports
 * branch. It's exercised for real via Playwright in
 * tests/wonderland-engine-adversarial.js, not a Node-side mock.
 *
 * Key design, per the checkpoint doc's "same key-design discipline as the
 * Essence ledger": every key is "<namespace>:<id>", namespace one of
 * entity | choice | save. One object store ("kv"), keyed by that string
 * directly — no separate stores per namespace, so a 7th namespace (or a
 * 7th house's entities) needs no schema migration.
 *
 * Verification standard (checkpoint doc §3): a missing or malformed
 * record must fail loudly — throw — never silently return a default.
 * getEntity/getSaveState both do this; see the tests for the actual
 * fault-injection check.
 */

(function () {
  const DB_NAME = 'wonderland';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';
  // The id portion has no inherent length limit in IndexedDB itself, so
  // without a cap here a caller (or hostile input laundered through
  // importHeirRecord.js) could stash an arbitrarily large key string —
  // found during the Checkpoint 7 adversarial pass, where a 100,000-char
  // id passed validation outright. Every real id in this codebase (a
  // character/house/node slug) is well under this; 200 is a generous cap
  // that only rejects pathological input, never a legitimate one.
  const KEY_PATTERN = /^(entity|choice|save):[A-Za-z0-9_-]{1,200}$/;

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('wonderland/persistence: IndexedDB is not available in this environment'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('wonderland/persistence: IndexedDB open failed'));
    });
    return dbPromise;
  }

  function assertValidKey(key) {
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      throw new Error(
        `wonderland/persistence: invalid key "${key}" — must match "<entity|choice|save>:<id>"`
      );
    }
  }

  function runTransaction(mode, work) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, mode);
          const store = tx.objectStore(STORE_NAME);
          let result;
          Promise.resolve(work(store))
            .then((r) => {
              result = r;
            })
            .catch(reject);
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(tx.error || new Error('wonderland/persistence: transaction failed'));
          tx.onabort = () => reject(tx.error || new Error('wonderland/persistence: transaction aborted'));
        })
    );
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('wonderland/persistence: request failed'));
    });
  }

  /**
   * Fetch a raw record by key. Throws (does not resolve null/undefined)
   * when the key is missing — callers that want "maybe missing" behavior
   * must catch explicitly, never rely on a silent default.
   */
  function getEntity(key) {
    assertValidKey(key);
    return runTransaction('readonly', (store) => requestToPromise(store.get(key))).then((value) => {
      if (value === undefined) {
        throw new Error(`wonderland/persistence: no record found for key "${key}"`);
      }
      if (typeof value !== 'object' || value === null) {
        throw new Error(`wonderland/persistence: malformed record at key "${key}" (not an object)`);
      }
      return value;
    });
  }

  function putEntity(key, value) {
    assertValidKey(key);
    if (typeof value !== 'object' || value === null) {
      throw new Error(`wonderland/persistence: refusing to write non-object value at key "${key}"`);
    }
    return runTransaction('readwrite', (store) => requestToPromise(store.put(value, key)));
  }

  function deleteEntity(key) {
    assertValidKey(key);
    return runTransaction('readwrite', (store) => requestToPromise(store.delete(key)));
  }

  /**
   * Save-state read, with schema-version validation on top of getEntity's
   * existence/shape check — a save written by a future, incompatible
   * schema must fail loudly here rather than get silently half-loaded.
   */
  function getSaveState(slot, expectedSchemaVersion) {
    return getEntity(`save:${slot}`).then((value) => {
      if (value.schemaVersion !== expectedSchemaVersion) {
        throw new Error(
          `wonderland/persistence: save slot "${slot}" has schemaVersion ${value.schemaVersion}, expected ${expectedSchemaVersion}`
        );
      }
      return value;
    });
  }

  function putSaveState(slot, saveState) {
    if (typeof saveState.schemaVersion !== 'number') {
      throw new Error('wonderland/persistence: refusing to save state with no numeric schemaVersion');
    }
    return putEntity(`save:${slot}`, saveState);
  }

  window.WonderlandPersistence = {
    DB_NAME,
    DB_VERSION,
    STORE_NAME,
    KEY_PATTERN,
    getEntity,
    putEntity,
    deleteEntity,
    getSaveState,
    putSaveState,
  };
})();
