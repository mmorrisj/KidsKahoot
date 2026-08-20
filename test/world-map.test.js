import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_MAP } from '../src/data/world-map.js';
import { COUNTRIES } from '../src/data/countries.js';
import { CONTINENTS } from '../src/data/continents.js';

/**
 * Guards the generated world map. The geometry itself is checked inside
 * scripts/build-world-map.mjs, which verifies every country pin sits on the
 * continent this project assigns it before writing the file.
 */

const [, , width, height] = WORLD_MAP.viewBox.split(' ').map(Number);

test('the map has exactly the continents the quiz uses', () => {
  assert.deepEqual(WORLD_MAP.continents.map((c) => c.name).sort(), [...CONTINENTS].sort());
});

test('every continent has a drawable path and a label inside the map', () => {
  for (const continent of WORLD_MAP.continents) {
    assert.ok(continent.d.startsWith('M'), `${continent.id}: path does not start with a move`);
    assert.ok(continent.d.endsWith('Z'), `${continent.id}: path is not closed`);
    assert.ok(continent.d.length > 100, `${continent.id}: path is too simple to be a continent`);
    const [x, y] = continent.label;
    assert.ok(x > 0 && x < width && y > 0 && y < height, `${continent.id}: label is off the map`);
  }
});

test('every country in the quiz has a pin, and it is on the map', () => {
  for (const country of COUNTRIES) {
    const pin = WORLD_MAP.pins[country.code];
    assert.ok(pin, `${country.name} (${country.code}) has no pin`);
    const [x, y] = pin;
    assert.ok(x >= 0 && x <= width, `${country.name} pins at x=${x}, off the map`);
    assert.ok(y >= 0 && y <= height, `${country.name} pins at y=${y}, off the map`);
  }
});

test('the Pacific island nations are not split across the map by the dateline', () => {
  // Samoa and Tonga sit just east of the antimeridian. On a Greenwich-centred
  // map they land on the far left, an ocean away from the Oceania they belong
  // to; the build shifts the seam into open Pacific so they stay together.
  const oceania = ['AU', 'NZ', 'FJ', 'PG', 'WS', 'TO', 'VU', 'SB', 'PW', 'MH', 'KI', 'TV'];
  const xs = oceania.map((code) => WORLD_MAP.pins[code][0]);
  assert.ok(Math.min(...xs) > width * 0.6,
    `an Oceania pin landed at x=${Math.min(...xs).toFixed(0)}, on the wrong side of the map`);
});

test('Antarctica survived the seam handling', () => {
  // Antarctica wraps the globe, so it crosses every possible seam. An earlier
  // build dropped it to a 122-character sliver.
  const antarctica = WORLD_MAP.continents.find((c) => c.name === 'Antarctica');
  assert.ok(antarctica.d.length > 800, `Antarctica is only ${antarctica.d.length} chars`);
});

test('the map stays small enough to ship inline', () => {
  const bytes = WORLD_MAP.continents.reduce((sum, c) => sum + c.d.length, 0);
  assert.ok(bytes < 40_000, `world geometry is ${bytes} bytes; simplify harder`);
});
