---
name: playwright-adversarial-harness
description: Use when writing or extending a Playwright test file for any Kazabon Games project — a `<game>-adversarial.js` full-regression pass, a narrower feature suite (`<game>-audio.js`, `rig-*.js`), or an engine/UI verification pass like `wonderland-engine-adversarial.js`. Covers the shared scaffold every one of this studio's 20+ test files already reimplements independently, and the one real bug this pattern has already caused when it wasn't followed. Read this before writing a new test file from scratch — don't reinvent the scaffold per file.
---

# Playwright Adversarial Harness

**Why this exists as a skill:** `TEAM_STRUCTURE.md` corrected an earlier claim
that a `worldbreaker` *skill* already existed — it didn't, no such file was
ever in `.claude/skills/`. But the underlying discipline it was trying to
name is real and heavily used: every one of this studio's 20+ test files
(11 in Shin-Maho-Arcade's `<game>-adversarial.js`/`<game>-audio.js`/`rig-*.js`,
2 in age-of-wonder's `wonderland-*.js`, plus more) independently reimplements
the same scaffold, and several files' own header comments say so directly —
`wardfall-adversarial.js:1` states it "mirrors tests/sigilchain-adversarial.js's
discipline," and `wonderland-engine-adversarial.js:1` states it "mirrors the
discipline of tests/wardfall-adversarial.js in Shin-Maho-Arcade." The
studio has been treating this as a de facto shared pattern for weeks without
it ever being written down once. This closes that gap.

**"The harness is the user."** Drive the real page via Playwright, reading
real DOM/console state — never `page.evaluate()` to inject data for
anything the UI itself can do. `_test` hooks (below) are for fast,
deterministic *setup* (skip past 40 turns of RNG to reach a specific board
state), not a shortcut around actually clicking/typing through the flow
being tested.

## The shared scaffold (reuse verbatim, don't reinvent per file)

Every test file in this studio's history that does this well shares this
exact shape — copy it, don't rederive it:

```js
const { chromium } = require('playwright');
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const BASE_URL = process.env.GAME_URL || 'http://localhost:PORT/game.html';

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ok   -', label); }
  else { fail++; console.log('  FAIL -', label); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH,
    args: ['--autoplay-policy=no-user-gesture-required'] }); // needed if the page has audio
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); // mobile pass
  await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort()); // no network flake
  const page = await context.newPage();
  const consoleErrors = [], pageErrors = [];
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof Game !== 'undefined' && typeof Game._test !== 'undefined');
  ok(consoleErrors.length === 0, 'zero console errors on load');
  ok(pageErrors.length === 0, 'zero page errors on load');

  // ...adversarial checks here...

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
```

Notable deliberate details, each already a fix for a real problem, not
arbitrary style:
- **`msg.text().includes('Failed to load resource')` is excluded** from
  the console-error check — an aborted font request (see the route-block
  above) or a missing favicon logs a benign resource error that isn't a
  real product bug; treating it as one produces false failures every run.
- **390×844 (iPhone-13-CSS-width) viewport by default**, not desktop —
  this studio's real mobile-overflow bugs were caught this way, not by
  running desktop-only and hoping. `rig-mobile-emulation.js` uses
  Playwright's built-in `devices['iPhone 13']` profile instead of the
  literal numbers when a more complete device emulation (touch, UA
  string) matters more than just viewport size — either is fine, pick
  based on whether the thing under test cares about touch/UA.
- **`waitForFunction` gating on a `_test` hook's existence**, not a fixed
  `waitForTimeout`, before the first assertion — the page is genuinely
  not ready to test until its own init code has run.

## `_test` hooks: fast setup, not a shortcut around the UI

Every game/module exposes a `_test` namespace (`Game._test`, `Music._test`,
`Rig._test`, `Wonderland._test`) for reading internal state and setting up
scenarios that would take too long to reach through real input alone (a
specific wave number, a specific board layout). Use it to **get to** the
state under test quickly; drive the actual interaction being verified
through real `page.click()`/`page.keyboard.press()`/pointer events, not
`page.evaluate()` calls that simulate the outcome directly. A test that
only ever calls `_test` methods and never touches the real UI isn't
testing the UI — it's testing the `_test` API's own correctness.

## The one rule that has already caused a real bug: bundle `_test` calls that must not interleave with a real frame

**The incident:** `rig-walk-cycle.js` (Rykndu doll-rig) needed to call
`Rig._test.setMoveIntent()` and then step physics forward to check the
walk-cycle animation responds. Splitting those into two separate
`page.evaluate()` calls left a gap where the page's own real `frame()`
loop could run in between — and that loop calls `applyMoveInput(dt)` every
frame, which reads live input state (inert in a test, so it resolves to
0) and overwrites `moveIntent` right back to 0 before the physics step
ever saw the value the test just set. The fix, and the rule for any
`_test` sequence with the same shape: **when a page's own render/update
loop could run between two calls and undo the first one, bundle both
calls inside a single `page.evaluate()`** so nothing can interleave:

```js
// WRONG — a real animation frame can land between these two calls
await page.evaluate(() => window.Rig._test.setMoveIntent(1, 0));
await page.evaluate(() => window.Rig._test.stepPhysics(1/60));

// RIGHT — one evaluate(), nothing can interleave
await page.evaluate(() => {
  window.Rig._test.setMoveIntent(1, 0);
  window.Rig._test.stepPhysics(1/60);
});
```

This applies to any game with a real-time update loop (most of them) —
before writing a `_test`-hook sequence that sets state and then advances
time/physics/animation, check whether the page has its own frame loop
that could read/reset that state in between, the same way this bug was
found.

## Deterministic fixtures beat incidental ones

When a test's own setup could introduce noise (a shuffled board, random
matches happening incidentally during a fixture-build step),
build a fixed, deterministic fixture instead — `runeshatter-adversarial.js`
builds a checkerboard-pattern board specifically to eliminate incidental
match noise from setup, rather than seeding an RNG and hoping the seed
doesn't happen to produce a confound.

## Float comparisons need an epsilon, and the epsilon needs a comment

`wonderland-engine-adversarial.js` had to add an `approxEqual(a, b)`
helper after `6*0.6 === 3.5999999999999996` (not `3.6`) made an exact
`===` comparison against a hand-computed expected value fail — a bug in
the *test*, not the engine. If a formula chains multiplications, use an
epsilon comparison and say why in a comment (which operation introduces
the float drift), so a future reader doesn't mistake the epsilon for
imprecision about the actual requirement.

## Distinguish a real product bug from a test-script artifact

Before reporting a failure as a product bug, rule out the test itself: a
stale variable read from before a state transition, a fixture that
accidentally changed the very state it meant to hold constant (both have
happened in this studio's own suites — a stale `nextItem` read, and a
test that unintentionally chain-matched an entire board empty during its
own setup). Document the false-positive inline once found, the same way
`wardfall-adversarial.js` and others already do, so it isn't rediscovered
as "the game is broken" by a future run.

## Reporting

Run count (`N passed, M failed`) plus a nonzero exit code on failure
(`process.exit(fail ? 1 : 0)`) — every existing file in this studio does
this, keep doing it, it's what lets a suite be chained/scripted later. A
rising, always-green assertion count across commits is this studio's
primary regression signal in the absence of a persistent CI-integrated
framework — cite the actual count in status reports ("53/53 passing"),
not "tests pass."
