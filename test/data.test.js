import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES } from '../src/data/countries.js';
import { US_STATES } from '../src/data/us-states.js';
import { WORLD_FACTS, WORLD_POOLS } from '../src/data/world-geography.js';
import { US_FACTS, US_POOLS, US_REGIONS } from '../src/data/us-geography.js';
import { VA_FACTS, VA_PLACES, VA_POOLS, VA_REGIONS } from '../src/data/virginia.js';
import { CONTINENTS } from '../src/data/continents.js';

/** Every fact dataset has the same shape, so it gets the same checks. */
function checkFacts(name, facts, pools) {
  test(`${name}: every fact draws from a pool that contains its answer`, () => {
    const ids = new Set();
    for (const f of facts) {
      assert.ok(pools[f.pool], `unknown pool "${f.pool}" on ${f.id}`);
      assert.ok(pools[f.pool].includes(f.answer), `${f.id}: answer missing from pool`);
      assert.ok(pools[f.pool].length >= 4, `pool "${f.pool}" is too small for 4 choices`);
      assert.ok([1, 2, 3].includes(f.tier), `${f.id}: bad tier`);
      assert.ok(f.prompt && f.clue, `${f.id}: missing prompt or clue`);
      assert.ok(!ids.has(f.id), `duplicate fact id: ${f.id}`);
      ids.add(f.id);
    }
  });
}

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

test('all 50 states are present exactly once, in a known region', () => {
  assert.equal(US_STATES.length, 50);
  assert.equal(new Set(US_STATES.map((s) => s.name)).size, 50);
  assert.equal(new Set(US_STATES.map((s) => s.abbr)).size, 50);
  for (const s of US_STATES) {
    assert.ok(US_REGIONS.includes(s.region), `${s.name} has an unknown region: ${s.region}`);
    assert.equal(s.firstLetter, s.name[0]);
  }
});

checkFacts('world', WORLD_FACTS, WORLD_POOLS);
checkFacts('united states', US_FACTS, US_POOLS);
checkFacts('virginia', VA_FACTS, VA_POOLS);

test('virginia: every place is in a real region, or is flagged as a Fall Line city', () => {
  const regions = new Set(VA_REGIONS.map((r) => r.short));
  const names = new Set();
  for (const p of VA_PLACES) {
    assert.ok(!names.has(p.name), `duplicate Virginia place: ${p.name}`);
    names.add(p.name);
    if (p.fallLine) assert.equal(p.region, null, `${p.name} is on the Fall Line and needs no region`);
    else assert.ok(regions.has(p.region), `${p.name} has an unknown region: ${p.region}`);
  }
});

test('virginia: the five regions are all represented by places', () => {
  assert.equal(VA_REGIONS.length, 5);
  for (const region of VA_REGIONS) {
    const places = VA_PLACES.filter((p) => p.region === region.short);
    assert.ok(places.length >= 3, `${region.short} only has ${places.length} places`);
    assert.ok(region.clue, `${region.short} has no clue text`);
  }
});

test('virginia: the Fall Line cities are the four taught as being on it', () => {
  assert.deepEqual(
    VA_PLACES.filter((p) => p.fallLine).map((p) => p.name).sort(),
    ['Alexandria', 'Fredericksburg', 'Petersburg', 'Richmond'],
  );
});
