import test from 'node:test';
import assert from 'node:assert/strict';
import { VA_MAP } from '../src/data/virginia-map.js';
import { VA_REGIONS } from '../src/data/virginia.js';

/**
 * These guard the generated file, not the geometry — the boundary lines are
 * checked against real place coordinates inside scripts/build-virginia-map.mjs,
 * which fails the build rather than shipping a map that contradicts an answer.
 */

const [, , width, height] = VA_MAP.viewBox.split(' ').map(Number);

test('the map covers the same five regions the quiz asks about', () => {
  assert.deepEqual(
    VA_MAP.regions.map((r) => r.short).sort(),
    VA_REGIONS.map((r) => r.short).sort(),
  );
});

test('every region has a drawable path and a label inside the map', () => {
  for (const region of VA_MAP.regions) {
    assert.ok(region.d.startsWith('M'), `${region.id}: path does not start with a move`);
    assert.ok(region.d.endsWith('Z'), `${region.id}: path is not closed`);
    assert.ok(region.d.length > 100, `${region.id}: path looks too simple to be a region`);
    const [x, y] = region.label;
    assert.ok(x > 0 && x < width, `${region.id}: label x ${x} is outside the map`);
    assert.ok(y > 0 && y < height, `${region.id}: label y ${y} is outside the map`);
  }
});

test('the state outline is there and Virginia-shaped', () => {
  assert.ok(VA_MAP.outline.startsWith('M') && VA_MAP.outline.endsWith('Z'));
  // Virginia is a bit over twice as wide as it is tall.
  const ratio = width / height;
  assert.ok(ratio > 2 && ratio < 2.6, `aspect ratio ${ratio.toFixed(2)} does not look like Virginia`);
});

test('the whole file stays small enough to ship inline', () => {
  const bytes = VA_MAP.outline.length
    + VA_MAP.regions.reduce((sum, r) => sum + r.d.length, 0);
  assert.ok(bytes < 40_000, `map geometry is ${bytes} bytes; simplify harder`);
});
