import test from 'node:test';
import assert from 'node:assert/strict';
import { VA_MAP, projectToMap } from '../src/data/virginia-map.js';
import { VA_PLACES, VA_REGIONS } from '../src/data/virginia.js';

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

/** Bounding box of a generated path, which only ever contains M/L/Z commands. */
function bboxOf(d) {
  const numbers = d.match(/-?\d+(\.\d+)?/g).map(Number);
  const xs = numbers.filter((_, i) => i % 2 === 0);
  const ys = numbers.filter((_, i) => i % 2 === 1);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
  };
}

test('the state outline is there and Virginia-shaped', () => {
  assert.ok(VA_MAP.outline.startsWith('M') && VA_MAP.outline.endsWith('Z'));
  // The viewBox now frames the neighbouring states too, so measure Virginia
  // itself: it is a bit over twice as wide as it is tall.
  const box = bboxOf(VA_MAP.outline);
  const ratio = (box.maxX - box.minX) / (box.maxY - box.minY);
  assert.ok(ratio > 2 && ratio < 2.6, `aspect ratio ${ratio.toFixed(2)} does not look like Virginia`);
});

test('the cropped box holds all of Virginia and nothing outside the map', () => {
  const [fx, fy, fw, fh] = VA_MAP.focusBox.split(' ').map(Number);
  const box = bboxOf(VA_MAP.outline);
  assert.ok(fx <= box.minX && fy <= box.minY, 'the crop cuts into Virginia');
  assert.ok(fx + fw >= box.maxX && fy + fh >= box.maxY, 'the crop cuts into Virginia');
  assert.ok(fx >= 0 && fy >= 0 && fx + fw <= width && fy + fh <= height,
    'the crop reaches outside the map');
  assert.ok(fw < width, 'the crop should actually be tighter than the full map');
});

test('Virginia sits inside the map with the neighbours around it', () => {
  const box = bboxOf(VA_MAP.outline);
  assert.ok(box.minX > 0 && box.maxX < width, 'Virginia is clipped horizontally');
  assert.ok(box.minY > 0 && box.maxY < height, 'Virginia is clipped vertically');
  assert.ok(VA_MAP.neighbours.length >= 5, 'expected the five bordering states');
  for (const neighbour of VA_MAP.neighbours) {
    assert.ok(neighbour.d.startsWith('M'), `${neighbour.id}: no path`);
    assert.ok(neighbour.name, `${neighbour.id}: no name`);
  }
});

test('any place can be projected onto the map', () => {
  for (const place of VA_PLACES) {
    assert.ok(place.coords, `${place.name} has no coordinates`);
    const [x, y] = projectToMap(place.coords);
    assert.ok(x > 0 && x < width, `${place.name} projects to x=${x.toFixed(0)}, off the map`);
    assert.ok(y > 0 && y < height, `${place.name} projects to y=${y.toFixed(0)}, off the map`);
  }
});

test('the whole file stays small enough to ship inline', () => {
  const bytes = VA_MAP.outline.length
    + VA_MAP.regions.reduce((sum, r) => sum + r.d.length, 0);
  assert.ok(bytes < 40_000, `map geometry is ${bytes} bytes; simplify harder`);
});
