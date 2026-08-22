/**
 * Browser smoke test: plays full rounds — pass-the-device, map-only, and a
 * live three-device game — and asserts the app never throws. Not part of
 * `npm test` because it needs a browser: run `npm start` in another terminal
 * (the live pass needs the real game server, not just static files, so set
 * BASE_URL accordingly if you serve elsewhere), then `npm run test:ui`.
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

/**
 * Tap a map shape where a person would: at the shape's own label anchor, mapped
 * from viewBox units into page pixels. A bounding-box centre is not good enough
 * — the regions are diagonal bands, and the centre of the Piedmont's box lands
 * in the Blue Ridge.
 */
async function tapMapTarget(page, label) {
  const point = await page.evaluate(async (wanted) => {
    const svg = document.querySelector('.map, .usmap--tap');
    // Virginia's border states are also US states, with different anchors on
    // each map — so pick the anchor set by which map is actually on screen.
    let anchors;
    if (svg.classList.contains('usmap--tap')) {
      const { US_MAP } = await import('/src/data/us-map.js');
      anchors = Object.fromEntries(US_MAP.states.map((s) => [s.name, s.label]));
    } else {
      const { VA_MAP } = await import('/src/data/virginia-map.js');
      anchors = Object.fromEntries([
        ...VA_MAP.regions.map((r) => [r.short, r.label]),
        ...VA_MAP.neighbours.map((n) => [n.name, n.label]),
      ]);
    }
    const target = [...svg.querySelectorAll('.map__target')]
      .find((e) => e.getAttribute('aria-label') === wanted);
    if (!target) return null;

    const spot = svg.createSVGPoint();
    if (anchors[wanted]) {
      [spot.x, spot.y] = anchors[wanted];
    } else {
      const box = target.getBBox(); // pins are round, so their centre is fine
      spot.x = box.x + box.width / 2;
      spot.y = box.y + box.height / 2;
    }
    const screen = spot.matrixTransform(svg.getScreenCTM());
    return { x: screen.x, y: screen.y };
  }, label);

  if (!point) throw new Error(`no map target labelled "${label}"`);
  await page.mouse.click(point.x, point.y);
}

/** Answer whichever surface this question happens to be using. */
async function answerSomehow(page) {
  if (await page.locator('.tile:not([disabled])').count()) {
    await page.click('.tile >> nth=0');
    return;
  }
  const label = await page.evaluate(() =>
    document.querySelector('.map__target')?.getAttribute('aria-label'));
  if (!label) throw new Error('the question offered neither tiles nor a map');
  await tapMapTarget(page, label);
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
  // Pin this pass to the tile surface; the phone pass below covers the map.
  await page.click('.chip:has-text("Answer buttons")');

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
  assert.equal(await page.locator('.map').count(), 0,
    'the answer-buttons setting should keep the map out of the round');
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
  // Left on the default setting, so this question could be either surface.
  await answerSomehow(phone);
  await phone.waitForSelector('.feedback');
  await shoot(phone, '9-mobile-feedback');

  const width = await phone.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(width <= 1, `the page scrolls sideways on a phone by ${width}px`);

  // ---- map questions, on a phone ------------------------------------------
  // In map-only mode each Virginia topic produces exactly one kind of map
  // question, so each layer can be forced deterministically rather than hoping
  // a random round happens to draw all three.
  const LAYER_TOPICS = [
    { topic: 'The Five Regions', layer: 'regions' },
    { topic: 'Cities & Historic Places', layer: 'pins' },
    { topic: 'Rivers, Bay & Borders', layer: 'neighbours' },
  ];
  for (const { topic, layer } of LAYER_TOPICS) {
    await phone.goto(BASE_URL);
    await phone.evaluate(() => localStorage.clear());
    await phone.reload();
    await phone.waitForSelector('.screen--setup');
    await phone.click('.chip:has-text("Map only")');
    for (const other of LAYER_TOPICS.filter((t) => t.topic !== topic)) {
      await phone.click(`.topic-group .chip:has-text("${other.topic}")`);
    }
    if (layer === 'regions') await shoot(phone, '10-map-setup');

    await phone.click('.btn--xl:has-text("Start")');

    for (let i = 0; i < 3; i++) {
      await phone.waitForSelector('.map');

      const info = await phone.evaluate(() => ({
        layer: document.querySelector('.map__pin') ? 'pins'
          : document.querySelector('.map__neighbour--live') ? 'neighbours' : 'regions',
        targets: [...document.querySelectorAll('.map__target')]
          .map((e) => e.getAttribute('aria-label')),
      }));

      assert.equal(info.layer, layer, `the ${topic} topic should ask ${layer} questions`);
      assert.ok(info.targets.length >= 3, 'a map question needs something to tap');
      assert.equal(new Set(info.targets).size, info.targets.length, 'duplicate map targets');
      assert.ok(info.targets.every(Boolean), 'every map target needs an aria-label');

      await tapMapTarget(phone, info.targets[0]);
      await phone.waitForSelector('.feedback');

      // Exactly one shape is marked right, and at most one is marked wrong.
      const marks = await phone.evaluate(() => ({
        correct: document.querySelectorAll('.map__paint--correct').length,
        wrong: document.querySelectorAll('.map__paint--wrong').length,
      }));
      assert.equal(marks.correct, 1, `${layer}: expected one correct shape`);
      assert.ok(marks.wrong <= 1, `${layer}: expected at most one wrong shape`);

      if (i === 0) await shoot(phone, `11-map-${layer}`);
      await phone.click('.feedback .btn');
      if (await phone.locator('.screen--results').count()) break;
    }
  }

  const mapWidth = await phone.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(mapWidth <= 1, `the map makes the page scroll sideways by ${mapWidth}px`);

  // ---- highlighted-state questions, back on the desktop ---------------------
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.screen--setup');

  // Only the "Name the State" topic, pinned to tiles so every question is a
  // highlighted state (the topic also carries tap-the-map questions now).
  await page.click('.chip:has-text("Virginia")');
  await page.click('.chip:has-text("United States")');
  for (const topic of ['State Capitals', 'Regions of the US', 'State Abbreviations',
    'Rivers, Mountains & Lakes', 'Landmarks & Parks']) {
    await page.click(`.topic-group .chip:has-text("${topic}")`);
  }
  await page.click('.chip:has-text("Answer buttons")');
  await page.click('.btn--xl:has-text("Start")');

  for (let i = 0; i < 3; i++) {
    await page.waitForSelector('.screen--question .usmap');
    assert.equal(await page.locator('.usmap__state').count(), 50,
      'the media map should draw all fifty states');
    assert.equal(await page.locator('.usmap__state--lit').count(), 1,
      'exactly one state should be highlighted');
    assert.equal(await page.locator('.usmap .map__target').count(), 0,
      'the media map must not be tappable');
    if (i === 0) await shoot(page, '12-us-highlight');
    await page.click('.tile >> nth=0');
    await page.waitForSelector('.feedback');
    await page.click('.feedback .btn');
    if (await page.locator('.screen--results').count()) break;
  }

  // ---- US map questions: tap the state itself -------------------------------
  await phone.goto(BASE_URL);
  await phone.evaluate(() => localStorage.clear());
  await phone.reload();
  await phone.waitForSelector('.screen--setup');
  await phone.click('.chip:has-text("Virginia")'); // off
  await phone.click('.chip:has-text("United States")'); // on
  await phone.click('.chip:has-text("Map only")');
  await phone.click('.btn--xl:has-text("Start")');

  for (let i = 0; i < 4; i++) {
    await phone.waitForSelector('.usmap--tap');
    const targets = await phone.evaluate(() =>
      [...document.querySelectorAll('.map__target')].map((e) => e.getAttribute('aria-label')));
    assert.equal(targets.length, 50, 'all fifty states should be tappable');
    assert.equal(new Set(targets).size, 50, 'duplicate state targets');

    await tapMapTarget(phone, targets[0]);
    await phone.waitForSelector('.feedback');
    const marks = await phone.evaluate(() => ({
      correct: document.querySelectorAll('.map__paint--correct').length,
      wrong: document.querySelectorAll('.map__paint--wrong').length,
      label: document.querySelector('.map__answer-label')?.textContent,
    }));
    assert.equal(marks.correct, 1, 'expected exactly one correct state');
    assert.ok(marks.wrong <= 1, 'expected at most one wrong state');
    assert.ok(marks.label, 'the answer state should be named on the map');
    if (i === 0) await shoot(phone, '22-us-tap-feedback');
    await phone.click('.feedback .btn');
    if (await phone.locator('.screen--results').count()) break;
  }

  const usTapWidth = await phone.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(usTapWidth <= 1, `the US map makes the page scroll sideways by ${usTapWidth}px`);

  // ---- world questions show where the country is, after answering ---------
  await phone.goto(BASE_URL);
  await phone.evaluate(() => localStorage.clear());
  await phone.reload();
  await phone.waitForSelector('.screen--setup');
  await phone.click('.chip:has-text("Virginia")'); // off
  await phone.click('.chip:has-text("World")'); // on
  await phone.click('.btn--xl:has-text("Start")');

  let locatorsSeen = 0;
  for (let i = 0; i < 25 && locatorsSeen < 2; i++) {
    await phone.waitForSelector('.tile');
    // The locator must not be on screen before the answer is in — it would
    // give away a "which continent is this" question outright.
    assert.equal(await phone.locator('.locator').count(), 0,
      'the world map appeared before the question was answered');

    await phone.click('.tile >> nth=0');
    await phone.waitForSelector('.feedback');

    if (await phone.locator('.locator').count()) {
      locatorsSeen += 1;
      assert.equal(await phone.locator('.locator__land--home').count(), 1,
        'exactly one continent should be highlighted');
      assert.equal(await phone.locator('.locator__pin').count(), 1, 'expected one pin');
      assert.match(await phone.locator('.locator__caption').textContent(), /\sis in\s/);
      if (locatorsSeen === 1) await shoot(phone, '13-world-locator');
    }
    if (await phone.locator('.screen--results').count()) break;
    await phone.click('.feedback .btn');
  }
  assert.ok(locatorsSeen >= 2, `only ${locatorsSeen} world questions showed a locator map`);

  const worldWidth = await phone.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(worldWidth <= 1, `the locator makes the page scroll sideways by ${worldWidth}px`);

  // ---- flag questions actually show flags -----------------------------------
  // Flags are images, not emoji — emoji flags render as letter codes or empty
  // boxes on many devices, which is no question at all.
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.screen--setup');
  await page.click('.chip:has-text("Virginia")');
  await page.click('.chip:has-text("World")');
  for (const topic of ['World Capitals', 'Continents', 'Rivers, Mountains & Landmarks']) {
    await page.click(`.topic-group .chip:has-text("${topic}")`);
  }
  await page.click('.btn--xl:has-text("Start")');

  for (let i = 0; i < 3; i++) {
    await page.waitForSelector('.screen--question img.flag');
    // A broken src never completes with a width, so this times out loudly.
    await page.waitForFunction(() => [...document.querySelectorAll('img.flag')]
      .every((img) => img.complete && img.naturalWidth > 0));
    if (i === 0) await shoot(page, '19-flags');
    await page.click('.tile >> nth=0');
    await page.waitForSelector('.feedback');
    await page.click('.feedback .btn');
    if (await page.locator('.screen--results').count()) break;
  }

  // ---- a live game: one host, two players on their own devices -------------
  // Needs the node server (npm start); a plain static server has no WebSocket.
  const host = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  watch(host, 'host');
  await host.goto(BASE_URL);
  await host.evaluate(() => localStorage.clear());
  await host.reload();
  await host.waitForSelector('.screen--setup');
  await host.fill('.player-input >> nth=0', 'Dad');
  await host.click('.btn:has-text("Host for other devices")');
  await host.waitForSelector('.screen--lobby');
  assert.ok((await host.textContent('.hero__title')).includes("Dad's game"));
  assert.equal(await host.locator('.btn--xl[disabled]').count(), 1,
    'starting with no players should be impossible');

  const joiners = [];
  for (const name of ['Maya', 'Sam']) {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    watch(p, `player-${name}`);
    await p.goto(BASE_URL);
    await p.evaluate(() => localStorage.clear());
    await p.reload();
    await p.click('.btn:has-text("Join a game")');
    if (name === 'Maya') {
      // Regression check: the 2s session poll used to redraw the whole screen,
      // throwing focus out of the name box in the middle of typing.
      await p.click('.player-input');
      await p.keyboard.type(name.slice(0, 2));
      await p.waitForTimeout(2400); // straddle at least one poll tick
      assert.ok(await p.evaluate(() => document.activeElement.classList.contains('player-input')),
        'the name box lost focus while the session list refreshed');
      await p.keyboard.type(name.slice(2));
      assert.equal(await p.inputValue('.player-input'), name);
    } else {
      await p.fill('.player-input', name);
    }
    await p.waitForSelector('.sessions__row');
    assert.ok((await p.textContent('.sessions__name')).includes("Dad's game"),
      'the hosted game should be listed for players');
    await p.click('.sessions__row .btn');
    await p.waitForSelector('.screen--lobby');
    joiners.push(p);
  }
  const [maya, sam] = joiners;
  await host.waitForSelector('.chip:has-text("Sam")');
  await shoot(host, '14-live-lobby');

  await host.click('.btn--xl:has-text("Start the game")');

  for (let guard = 0; guard < 15; guard++) {
    // A fresh question renders unlocked answers; the previous screen's stay locked.
    for (const p of joiners) {
      await p.waitForSelector('.live-answers:not(.live-answers--locked)');
    }
    if (guard === 0) await shoot(maya, '15-live-question');
    await answerSomehow(maya);
    await answerSomehow(sam);

    await host.waitForSelector('.feedback');
    assert.equal(await host.locator('.livewire__row').count(), 2,
      'the host reveal should show one row per player');
    if (guard === 0) await shoot(host, '16-live-reveal');

    const advance = host.locator('.feedback .btn');
    const label = await advance.textContent();
    await advance.click();
    if (label === 'See results') break;
  }

  await host.waitForSelector('.screen--results');
  assert.equal(await host.locator('.scoreboard__row').count(), 2);
  for (const p of joiners) {
    await p.waitForSelector('.screen--results');
    assert.ok(await p.locator('.alltime').count() >= 1,
      'the final screen should carry the all-time leaderboard');
  }
  await shoot(host, '17-live-results');

  // The finished game landed in the all-time stats.
  await maya.click('.btn:has-text("Done")');
  await maya.waitForSelector('.screen--setup');
  await maya.click('.btn:has-text("Leaderboard")');
  await maya.waitForSelector('.alltime__row');
  const board = await maya.locator('.alltime__name').allTextContents();
  assert.ok(board.includes('Maya') && board.includes('Sam'),
    `both players should be on the leaderboard, got ${board.join(', ')}`);
  await shoot(maya, '18-leaderboard');

  // ---- math, on the number pad ---------------------------------------------
  await phone.goto(BASE_URL);
  await phone.evaluate(() => localStorage.clear());
  await phone.reload();
  await phone.waitForSelector('.screen--setup');
  await phone.click('.chip:has-text("Geography")'); // off
  await phone.click('.chip:has-text("Math")');      // on
  await shoot(phone, '20-math-setup');

  await phone.click('.btn--xl:has-text("Start")');

  let namedMistakes = 0;
  const topicsSeen = new Set();
  for (let i = 0; i < 20 && namedMistakes < 1; i++) {
    await phone.waitForSelector('.pad');
    assert.equal(await phone.locator('.tile').count(), 0,
      'a math question should use the keypad, not tiles');
    assert.equal(await phone.locator('.pad__key').count(), 12, 'expected ten digits, delete and check');

    const prompt = await phone.locator('.prompt__text').textContent();
    topicsSeen.add(prompt.replace(/\d+/g, '#'));

    // Check cannot be pressed before anything is typed.
    assert.ok(await phone.locator('.pad__key--check').isDisabled(),
      'the check key should be dead until a digit is typed');

    // Type the "smaller digit from the larger" answer to a borrow question,
    // which is the mistake the feedback is supposed to recognise by name.
    const borrow = prompt.match(/^(\d\d) − (\d\d) = \?$/);
    const typed = borrow
      ? String(Math.abs(Math.floor(borrow[1] / 10) - Math.floor(borrow[2] / 10)) * 10
        + Math.abs((borrow[1] % 10) - (borrow[2] % 10)))
      : '1';

    for (const digit of typed) await phone.click(`.pad__key[aria-label="${digit}"]`);
    assert.equal(await phone.locator('.pad__display').textContent(), typed,
      'the display should show what was typed');

    await phone.click('.pad__key--check');
    await phone.waitForSelector('.feedback');

    if (borrow && await phone.locator('.feedback__mistake').count()) {
      assert.match(await phone.locator('.feedback__mistake').textContent(), /borrow/,
        'a recognised slip should be named, not just marked wrong');
      namedMistakes += 1;
      await shoot(phone, '21-math-mistake');
    }
    if (await phone.locator('.screen--results').count()) break;
    await phone.click('.feedback .btn');
  }
  assert.equal(namedMistakes, 1, 'never saw a borrow mistake explained by name');
  assert.ok(topicsSeen.size >= 3, `a math round should mix topics, saw ${topicsSeen.size} shapes`);

  const mathWidth = await phone.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(mathWidth <= 1, `the keypad makes the page scroll sideways by ${mathWidth}px`);
} finally {
  await browser.close();
}

assert.deepEqual(problems, [], 'the app logged errors while playing');
console.log('UI smoke test passed.');
