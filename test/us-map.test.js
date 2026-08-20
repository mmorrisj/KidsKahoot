import test from 'node:test';
import assert from 'node:assert/strict';
import { US_MAP } from '../src/data/us-map.js';
import { US_STATES } from '../src/data/us-states.js';

/**
 * These guard the generated file: src/data/us-map.js must always be able to
 * light up whichever state the quiz asks about.
 */

const [, , width, height] = US_MAP.viewBox.split(' ').map(Number);

test('the map covers exactly the fifty states the quiz asks about', () => {
  assert.deepEqual(
    US_MAP.states.map((s) => s.name).sort(),
    US_STATES.map((s) => s.name).sort(),
  );
  assert.equal(new Set(US_MAP.states.map((s) => s.id)).size, 50, 'state ids collide');
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

test('every state has a drawable path and a label anchor inside its own box', () => {
  for (const state of US_MAP.states) {
    assert.ok(state.d.startsWith('M'), `${state.id}: path does not start with a move`);
    assert.ok(state.d.endsWith('Z'), `${state.id}: path is not closed`);
    assert.ok(state.area > 0, `${state.id}: no area`);
    const box = bboxOf(state.d);
    const [x, y] = state.label;
    assert.ok(x >= box.minX && x <= box.maxX, `${state.id}: label x ${x} is outside the state`);
    assert.ok(y >= box.minY && y <= box.maxY, `${state.id}: label y ${y} is outside the state`);
    assert.ok(box.minX >= 0 && box.maxX <= width, `${state.id} is clipped horizontally`);
    assert.ok(box.minY >= 0 && box.maxY <= height, `${state.id} is clipped vertically`);
  }
});

test('Alaska and Hawaii sit inside their inset frames, below the lower 48', () => {
  assert.equal(US_MAP.insetFrames.length, 2);
  const insetTop = Math.min(...US_MAP.insetFrames.map((f) => f.y));

  for (const name of ['Alaska', 'Hawaii']) {
    const box = bboxOf(US_MAP.states.find((s) => s.name === name).d);
    const frame = US_MAP.insetFrames.find((f) =>
      box.minX >= f.x && box.maxX <= f.x + f.width
      && box.minY >= f.y && box.maxY <= f.y + f.height);
    assert.ok(frame, `${name} does not fit inside either inset frame`);
  }

  for (const state of US_MAP.states) {
    if (state.name === 'Alaska' || state.name === 'Hawaii') continue;
    const box = bboxOf(state.d);
    assert.ok(box.maxY < insetTop, `${state.name} reaches down into the inset band`);
  }
});

test('recognisable shapes: Tennessee is wide, California is tall', () => {
  // A cheap projection sanity check — if the aspect ratios are off, every
  // shape on the map is off.
  const shapeOf = (name) => {
    const box = bboxOf(US_MAP.states.find((s) => s.name === name).d);
    return (box.maxX - box.minX) / (box.maxY - box.minY);
  };
  // Real Tennessee is 4:1, but Albers tilts states east of the central
  // meridian, so its bounding box comes out nearer 3:1.
  assert.ok(shapeOf('Tennessee') > 2.5, `Tennessee ratio ${shapeOf('Tennessee').toFixed(2)}`);
  assert.ok(shapeOf('California') < 1, `California ratio ${shapeOf('California').toFixed(2)}`);
  const colorado = shapeOf('Colorado');
  assert.ok(colorado > 1.2 && colorado < 1.6,
    `Colorado ratio ${colorado.toFixed(2)} should be about 1.4`);
});

test('the whole file stays small enough to ship inline', () => {
  const bytes = US_MAP.states.reduce((sum, s) => sum + s.d.length, 0);
  assert.ok(bytes < 60_000, `map geometry is ${bytes} bytes; simplify harder`);
});
