/**
 * Browser smoke test: plays a full two-player round and asserts the app never
 * throws. Not part of `npm test` because it needs a browser — run it with
 * `npm run test:ui` (starts its own static server is NOT included: run
 * `npm start` in another terminal first, or set BASE_URL).
 *
 * Pass SHOTS=<dir> to also write screenshots of each screen.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8080/index.html';
const SHOTS = process.env.SHOTS ?? null;

const problems = [];
const browser = await chromium.launch();

async function shoot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

function watch(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${tag} console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`${tag} threw: ${e.message}`));
}

try {
  // ---- desktop, two players, timed ----------------------------------------
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  watch(page, 'desktop');
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.waitForSelector('.screen--setup');
  await shoot(page, '1-setup');

  await page.fill('.player-input >> nth=0', 'Maya');
  await page.click('text=+ Add player');
  await page.fill('.player-input >> nth=1', 'Sam');
  await page.click('.chip:has-text("20s")');

  // Virginia is the default curriculum, so only its topics are offered.
  assert.deepEqual(
    await page.locator('.topic-group__title').allTextContents(), ['Virginia'],
    'a fresh setup should show Virginia topics only',
  );
  assert.equal(await page.locator('.topic-group .chip:has-text("The Five Regions")').count(), 1);
  assert.equal(await page.locator('.topic-group .chip:has-text("Flags")').count(), 0,
    'world topics should be hidden until the World curriculum is on');

  // Turning on another curriculum reveals its topics.
  await page.click('.chip:has-text("United States")');
  assert.deepEqual(
    await page.locator('.topic-group__title').allTextContents(),
    ['Virginia', 'United States'],
  );
  await shoot(page, '2-setup-filled');

  await page.click('.btn--xl:has-text("Start")');
  await page.waitForSelector('.screen--handoff');
  assert.equal(await page.locator('.handoff__name').textContent(), 'Maya',
    'the first turn should belong to the first player');
  await shoot(page, '3-handoff');

  await page.click("text=I'm ready");
  await page.waitForSelector('.screen--question');
  assert.equal(await page.locator('.tile').count(), 4, 'every question needs four choices');
  await shoot(page, '4-question');

  await page.click('.tile >> nth=0');
  await page.waitForSelector('.feedback');
  assert.equal(await page.locator('.tile--correct').count(), 1,
    'feedback should mark exactly one tile correct');
  await shoot(page, '5-feedback');

  // Keyboard play: Enter moves on, then 1-4 answer.
  await page.keyboard.press('Enter');
  await page.waitForSelector('.feedback', { state: 'detached' });
  if (await page.locator('.screen--handoff').count()) await page.keyboard.press('Enter');
  await page.waitForSelector('.tile');
  await page.keyboard.press('2');
  await page.waitForSelector('.feedback');

  // Play the round out, always tapping the first tile.
  for (let guard = 0; guard < 200; guard++) {
    if (await page.locator('.screen--results').count()) break;
    if (await page.locator('.feedback .btn').count()) { await page.click('.feedback .btn'); continue; }
    if (await page.locator('.screen--handoff').count()) { await page.click("text=I'm ready"); continue; }
    if (await page.locator('.tile:not([disabled])').count()) { await page.click('.tile >> nth=0'); continue; }
    await page.waitForTimeout(100);
  }
  await page.waitForSelector('.screen--results');
  assert.equal(await page.locator('.scoreboard__row').count(), 2, 'both players should be scored');
  await shoot(page, '6-results');

  // ---- phone, solo, untimed -----------------------------------------------
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  watch(phone, 'mobile');
  await phone.goto(BASE_URL);
  await phone.evaluate(() => localStorage.clear());
  await phone.reload();
  await phone.waitForSelector('.screen--setup');
  const before = await phone.locator('.availability').first().textContent();
  await phone.click('.chip:has-text("Virginia")');
  assert.match(await phone.locator('.availability').first().textContent(),
    /at least one topic/, 'turning the last curriculum off should leave nothing selected');
  await phone.click('.chip:has-text("Virginia")');
  assert.equal(await phone.locator('.availability').first().textContent(), before,
    'turning a curriculum back on should restore its topics');
  await shoot(phone, '7-mobile-setup');

  await phone.click('.btn--xl:has-text("Start")');
  // A single player skips the hand-off screen and goes straight to the question.
  await phone.waitForSelector('.screen--question');
  await shoot(phone, '8-mobile-question');
  await phone.click('.tile >> nth=0');
  await phone.waitForSelector('.feedback');
  await shoot(phone, '9-mobile-feedback');

  const width = await phone.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(width <= 1, `the page scrolls sideways on a phone by ${width}px`);
} finally {
  await browser.close();
}

assert.deepEqual(problems, [], 'the app logged errors while playing');
console.log('UI smoke test passed.');
