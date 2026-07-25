'use strict';
/*
 * WONDERLAND: FIRST PRINCIPLES — Checkpoint 9 redemption-code seam.
 *
 * Scaffolding only, per the handover's own §7 — no real promo codes
 * exist yet. Pure functions throughout; nothing here touches IndexedDB
 * directly (persistence.js stays the only module allowed to), and
 * reward-granting itself lives in engine.js's GRANT_REWARD action,
 * fully decoupled from the code-validity check below — this file never
 * calls it.
 *
 * Dual Node/browser module, same pattern as importHeirRecord.js and
 * worldStateBridge.js.
 */

(function (root) {

const CODE_PREFIX = 'WNDR';
// No I/O — visually ambiguous with 1/0 on a lot of fonts, dropped to
// keep a misread code obviously wrong at the checksum step rather than
// silently resolving to a different valid-looking code.
const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function checksumChar(chars) {
  let sum = 0;
  for (let i = 0; i < chars.length; i++) {
    sum += chars.charCodeAt(i) * (i + 1);
  }
  return ALPHABET[sum % ALPHABET.length];
}

function randomSegment(length) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/*
 * Encodes batchId + issuedAt into the code itself, per the handover's
 * own instruction: "even though nothing reads them yet, so a future
 * server can use codes already issued without needing them
 * regenerated." issuedAt is base36 minutes-since-epoch, not full
 * millisecond precision — a redemption code doesn't need finer
 * resolution than "roughly when this batch went out," and staying in
 * minutes keeps the encoded segment short and typeable.
 */
function createRedemptionCode(batchId, issuedAt) {
  issuedAt = issuedAt || new Date();
  if (typeof batchId !== 'string' || !/^[A-Z0-9]{2,12}$/.test(batchId)) {
    throw new Error('wonderland/redemption: batchId must be 2-12 uppercase alphanumeric characters');
  }
  const issuedMinutes = Math.floor(issuedAt.getTime() / 60000);
  const timeSegment = issuedMinutes.toString(36).toUpperCase();
  const random = randomSegment(6);
  const body = `${CODE_PREFIX}-${batchId}-${timeSegment}-${random}`;
  const checksum = checksumChar(body.replace(/-/g, ''));
  return {
    code: `${body}-${checksum}`,
    batchId,
    issuedAt: new Date(issuedMinutes * 60000).toISOString(),
  };
}

/*
 * Pure format + checksum validation — stays client-side permanently
 * regardless of future server work, per the handover's own §7.
 * Deliberately does NOT check whether the code was actually issued or
 * already redeemed — that's isCodeUnredeemed() below, a separate
 * concern on purpose, since a well-formed code and a *real, unused*
 * code are two different questions with two different failure modes
 * worth distinguishing to the player ("that's not a real code shape" vs
 * "that code's already been used").
 */
function validateCodeFormat(code) {
  if (typeof code !== 'string') {
    return { valid: false, reason: 'not a string' };
  }
  const parts = code.trim().toUpperCase().split('-');
  if (parts.length !== 5 || parts[0] !== CODE_PREFIX) {
    return { valid: false, reason: 'malformed code shape' };
  }
  const [, batchId, timeSegment, random, checksum] = parts;
  if (
    !/^[A-Z0-9]{2,12}$/.test(batchId) ||
    !/^[A-Z0-9]+$/.test(timeSegment) ||
    !/^[A-Z0-9]{6}$/.test(random) ||
    !/^[A-Z0-9]$/.test(checksum)
  ) {
    return { valid: false, reason: 'malformed code shape' };
  }
  const body = `${CODE_PREFIX}-${batchId}-${timeSegment}-${random}`;
  const expectedChecksum = checksumChar(body.replace(/-/g, ''));
  if (checksum !== expectedChecksum) {
    return { valid: false, reason: 'checksum mismatch' };
  }
  const issuedMinutes = parseInt(timeSegment, 36);
  if (!Number.isFinite(issuedMinutes)) {
    return { valid: false, reason: 'malformed timestamp segment' };
  }
  return {
    valid: true,
    batchId,
    issuedAt: new Date(issuedMinutes * 60000).toISOString(),
  };
}

/*
 * The persistence.js key a redemption record lives at — entity:
 * namespace, since a redeemed code is a real, permanent fact about the
 * world/account, not a transient choice. persistence.js's KEY_PATTERN
 * only allows [A-Za-z0-9_-] in the id portion; a valid code (per
 * validateCodeFormat above) is already exactly that charset, so no
 * extra encoding step is needed here.
 */
function redemptionKeyFor(code) {
  return `entity:redeemed_${code}`;
}

/*
 * Pure "has this code already been redeemed" check — data in, data out,
 * same discipline as everywhere else in this engine. persistence.js's
 * getEntity() THROWS on a missing key rather than returning null/
 * undefined (its own fail-loudly discipline) — so the caller is
 * responsible for catching that throw and passing `null` in here for
 * "not found," translating persistence.js's exception-based "missing"
 * signal into this function's value-based one at the call site. This
 * function itself never touches IndexedDB.
 */
function isCodeUnredeemed(existingRecordOrNull) {
  return existingRecordOrNull === null || typeof existingRecordOrNull === 'undefined';
}

const api = { createRedemptionCode, validateCodeFormat, redemptionKeyFor, isCodeUnredeemed };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (root) {
  root.WonderlandRedemption = api;
}

})(typeof window !== 'undefined' ? window : undefined);
