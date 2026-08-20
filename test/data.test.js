import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES } from '../src/data/countries.js';
import { US_STATES } from '../src/data/us-states.js';
import { PHYSICAL_FACTS, POOLS } from '../src/data/physical.js';
import { CONTINENTS } from '../src/data/continents.js';

test('country rows are complete and unique', () => {
  const codes = new Set();
  for (const c of COUNTRIES) {
    assert.ok(c.name && c.capital && c.flag, `incomplete row: ${c.name}`);
    assert.ok(CONTINENTS.includes(c.continent), `bad continent on ${c.name}: ${c.continent}`);
    assert.ok([1, 2, 3].includes(c.tier), `bad tier on ${c.name}`);
    assert.ok(!codes.has(c.code), `duplicate country code: ${c.code}`);
    codes.add(c.code);
  }
});

test('a trap is never the correct capital', () => {
  for (const c of COUNTRIES) {
    assert.ok(!c.traps.includes(c.capital), `${c.name} lists its own capital as a trap`);
  }
  for (const s of US_STATES) {
    assert.ok(!s.traps.includes(s.capital), `${s.name} lists its own capital as a trap`);
  }
});

test('all 50 states are present exactly once', () => {
  assert.equal(US_STATES.length, 50);
  assert.equal(new Set(US_STATES.map((s) => s.name)).size, 50);
  assert.equal(new Set(US_STATES.map((s) => s.abbr)).size, 50);
});

test('every physical fact draws from a pool that contains its answer', () => {
  const ids = new Set();
  for (const f of PHYSICAL_FACTS) {
    assert.ok(POOLS[f.pool], `unknown pool "${f.pool}" on ${f.id}`);
    assert.ok(POOLS[f.pool].includes(f.answer), `${f.id}: answer missing from pool`);
    assert.ok(POOLS[f.pool].length >= 4, `pool "${f.pool}" is too small for 4 choices`);
    assert.ok(!ids.has(f.id), `duplicate fact id: ${f.id}`);
    ids.add(f.id);
  }
});
