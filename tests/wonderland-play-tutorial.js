// Wonderland Checkpoint 9 — UI-driven playtest of the one playable
// milestone (house select -> NLDR/Aetheria Nova tutorial -> victory).
//
// Deliberately does NOT use page.evaluate() for interaction — every step
// drives the real DOM (click, read visible text) the way a person would,
// matching this studio's worldbreaker/browser-test-harness discipline:
// "the harness is the user." page.evaluate() is only ever used here to
// *read* rendered text/attributes for assertions, never to inject state
// or trigger an action a real tap/click wouldn't.
//
// Usage: serve the repo (`npx http-server -p 8935`), then
// `NODE_PATH=/opt/node22/lib/node_modules node tests/wonderland-play-tutorial.js`.
const { chromium, devices } = require('playwright');

const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const BASE_URL = process.env.WONDERLAND_PLAY_URL || 'http://localhost:8935/wonderland/play.html';

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ok   -', label); }
  else { fail++; console.log('  FAIL -', label); }
}

async function activeScreenId(page) {
  return page.evaluate(() => document.querySelector('.screen.active')?.id);
}

/*
 * init() awaits a real IndexedDB round-trip (checkForUpdates()) before
 * showing ANY screen, so there's a genuine — if brief — window right
 * after 'domcontentloaded' where .screen.active doesn't exist yet.
 * Found by this suite's own flakiness, not assumed: asserting the
 * active screen immediately after page.goto() raced that window on a
 * slower run and failed. Waiting for the selector to actually exist is
 * the honest fix — checking too early here isn't the same mistake as
 * the app quietly picking a default and hiding the wait, since the
 * whole point of the version check is that it has to resolve first.
 */
async function waitForAnyScreenActive(page) {
  await page.waitForSelector('.screen.active', { state: 'attached' });
}

async function clickActiveButton(page, textContains) {
  const btn = textContains
    ? page.locator('.screen.active button', { hasText: textContains })
    : page.locator('.screen.active button').first();
  await btn.click();
  await page.waitForTimeout(30);
}

// Every fresh browser context has empty IndexedDB, so the first-ever
// load always shows the one-time "what's new" screen (Checkpoint 9
// handover §6) before the start screen — a real, intentional part of
// the app, not a test-only quirk, so tests dismiss it explicitly rather
// than assuming it's absent.
async function dismissUpdatesScreenIfPresent(page) {
  if (await activeScreenId(page) === 'screen-updates') {
    await clickActiveButton(page, 'Continue');
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });

  console.log('1. Desktop viewport — full milestone, real clicks only');
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForAnyScreenActive(page);
    await dismissUpdatesScreenIfPresent(page);
    ok(await activeScreenId(page) === 'screen-start', 'Reaches the start screen (after dismissing first-load updates, if shown)');
    ok(await page.locator('#versionMarker').textContent().then((t) => /v\d+\.\d+\.\d+/.test(t)), 'Version marker is present and shaped like a real version string');

    await clickActiveButton(page);
    ok(await activeScreenId(page) === 'screen-house-select', 'Begin advances to house select');
    const houseCount = await page.locator('.house-card').count();
    ok(houseCount === 6, `House select shows all six real houses (got ${houseCount})`);

    // Real tap on a specific house card, not a synthetic selection.
    await page.locator('.house-card', { hasText: 'House Ye' }).click();
    ok(await activeScreenId(page) === 'screen-encounter', 'Picking a house advances to the encounter screen');

    // Beat 0-2: pure narration, no engine calls yet.
    await clickActiveButton(page); // NLDR intro -> Aetheria Nova
    await clickActiveButton(page); // Aetheria Nova -> combat explainer
    ok(await page.locator('.screen.active').textContent().then((t) => t.includes('Commit')), 'Combat-explainer beat mentions Commit before the first real exchange');

    // Beat 3: the first real resolve() calls happen here.
    await clickActiveButton(page, 'Read the Construct');
    const firstOutcomeText = await page.locator('.outcome-panel').textContent();
    ok(firstOutcomeText.includes('First Exchange'), 'Outcome-transparency panel renders after the first real exchange');
    ok(/Read: (full|degraded)/.test(firstOutcomeText), 'Outcome panel shows a real Presence Read stage, not a placeholder');
    ok(firstOutcomeText.includes('Initiative:'), 'Outcome panel shows the real initiative result');

    // Beat 4-5: technique grant + second real exchange.
    await clickActiveButton(page); // -> technique explainer
    await clickActiveButton(page, 'Use Severance');
    const secondOutcomeText = await page.locator('.outcome-panel').textContent();
    ok(secondOutcomeText.includes('Second Exchange'), 'Second outcome-transparency panel renders after the technique exchange');

    await clickActiveButton(page); // -> victory
    ok(await activeScreenId(page) === 'screen-victory', 'Reaches the victory screen at the end of the scripted encounter');
    const victoryText = await page.locator('.victory-summary').textContent();
    ok(victoryText.includes('House Ye'), 'Victory screen reflects the actual house picked at the start, not a hardcoded one');
    ok(victoryText.includes('2 wounds'), 'Victory screen reflects the real wound count applied to the Construct during play');
    ok(victoryText.includes('never landed one on you'), 'Victory screen confirms the player took no wounds — this fight was never meant to threaten them');

    ok(consoleErrors.length === 0, 'Zero console errors across the full playthrough (got: ' + JSON.stringify(consoleErrors) + ')');
    ok(pageErrors.length === 0, 'Zero page errors across the full playthrough (got: ' + JSON.stringify(pageErrors) + ')');

    await context.close();
  }

  console.log('2. Theme toggle — real toggle, real persistence check');
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForAnyScreenActive(page);
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.click('#theme-toggle');
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    ok(before !== after, 'Clicking the theme toggle actually flips data-theme on <html>');
    await page.reload({ waitUntil: 'domcontentloaded' });
    const afterReload = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    ok(afterReload === after, 'The chosen theme survives a real page reload (localStorage round-trip)');
    await context.close();
  }

  console.log('3. Mobile viewport (iPhone 13 emulation) — real device size, not a desktop-tab read');
  // Caveat, stated plainly rather than implied: this is Playwright's
  // device emulation, the closest available substitute for the
  // handover's "checked on an actual phone" standard — not a
  // replacement for a human actually holding a device. Report this
  // honestly rather than claiming full compliance.
  {
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) consoleErrors.push(msg.text()); });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForAnyScreenActive(page);
    ok(await activeScreenId(page) === 'screen-updates', 'Mobile viewport: a fresh session shows the one-time updates screen first, same as desktop');
    const updatesBtnBox = await page.locator('.screen.active button').first().boundingBox();
    ok(updatesBtnBox && updatesBtnBox.x >= 0 && updatesBtnBox.x + updatesBtnBox.width <= 391, 'Mobile viewport: the updates screen\'s Continue button fits within the viewport width');
    await dismissUpdatesScreenIfPresent(page);

    await clickActiveButton(page); // Begin
    ok(await activeScreenId(page) === 'screen-house-select', 'Mobile viewport: Begin still advances correctly');

    // Every house card must be fully tappable within the viewport width
    // — no horizontal scroll, no card clipped off-screen.
    const viewportWidth = 390; // iPhone 13 CSS width
    const cardBoxes = await page.locator('.house-card').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
    const allWithinWidth = cardBoxes.every((box) => box.x >= 0 && box.x + box.width <= viewportWidth + 1);
    ok(allWithinWidth, 'Every house card fits within the mobile viewport width — no horizontal overflow');

    await page.locator('.house-card').first().click();
    ok(await activeScreenId(page) === 'screen-encounter', 'Mobile viewport: house selection advances to the encounter screen');

    for (let i = 0; i < 8; i++) {
      const screen = await activeScreenId(page);
      if (screen === 'screen-victory') break;
      await clickActiveButton(page);
    }
    ok(await activeScreenId(page) === 'screen-victory', 'Mobile viewport: the full tutorial is completable by tap alone, start to victory');
    ok(consoleErrors.length === 0, 'Zero console errors on the mobile-viewport playthrough');

    await context.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Harness crashed:', err);
  process.exit(1);
});
