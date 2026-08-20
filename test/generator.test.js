import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/lib/rng.js';
import {
  CHOICE_COUNT,
  countAvailable,
  generateQuestions,
  listQuestionRefs,
} from '../src/lib/generator.js';

const round = (opts = {}) => generateQuestions({ rng: createRng(7), count: 40, ...opts });

test('every question is answerable: the answer is among unique choices', () => {
  for (const q of round()) {
    assert.equal(q.choices.length, CHOICE_COUNT, `${q.id} has ${q.choices.length} choices`);
    assert.equal(new Set(q.choices).size, CHOICE_COUNT, `${q.id} has a duplicate choice`);
    assert.ok(q.choices.includes(q.answer), `${q.id} does not offer its own answer`);
  }
});

test('every question carries flash-card and Jeopardy forms too', () => {
  for (const q of round()) {
    assert.ok(q.card.front && q.card.back, `${q.id} is missing a flash card`);
    assert.ok(q.clue.text && q.clue.response.startsWith('What is '), `${q.id} has a bad clue`);
    assert.ok(q.explanation.length > 0, `${q.id} has no explanation`);
  }
});

test('the same seed produces the same round', () => {
  const a = generateQuestions({ rng: createRng(99), count: 15 });
  const b = generateQuestions({ rng: createRng(99), count: 15 });
  assert.deepEqual(a, b);
});

test('different seeds produce different rounds', () => {
  const a = generateQuestions({ rng: createRng(1), count: 15 }).map((q) => q.id);
  const b = generateQuestions({ rng: createRng(2), count: 15 }).map((q) => q.id);
  assert.notDeepEqual(a, b);
});

test('tier filtering keeps hard questions out of a warm-up round', () => {
  for (const q of round({ tiers: [1] })) {
    assert.equal(q.tier, 1, `${q.id} is tier ${q.tier} in a tier-1 round`);
  }
});

test('topic filtering only draws from the chosen topics', () => {
  for (const q of round({ topics: ['us-states'] })) {
    assert.equal(q.topic, 'us-states');
  }
});

test('a round does not ask about the same place twice', () => {
  const ids = round({ count: 20 }).map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('famous near-misses are offered as wrong answers', () => {
  // Sydney for Australia is the whole point: a kid who picks it learns
  // something, and a kid who avoids it proves they actually knew.
  const refs = listQuestionRefs({ topics: ['world-capitals'] });
  const australia = refs.find(
    (r) => r.template.id === 'capital-of-country' && r.entity.name === 'Australia',
  );
  const q = australia.template.make(createRng(3), australia.entity);
  assert.ok(q.choices.includes('Canberra'));
  assert.ok(
    q.choices.some((c) => australia.entity.traps.includes(c)),
    `expected a trap city among ${q.choices.join(', ')}`,
  );
});

test('wrong answers stay in the same category as the right one', () => {
  // Capitals compete with capitals, never with country names.
  const refs = listQuestionRefs({ topics: ['world-capitals'] });
  const france = refs.find(
    (r) => r.template.id === 'capital-of-country' && r.entity.name === 'France',
  );
  const q = france.template.make(createRng(11), france.entity);
  const countryNames = new Set(refs.map((r) => r.entity.name));
  for (const choice of q.choices) {
    assert.ok(!countryNames.has(choice), `"${choice}" is a country, not a city`);
  }
});

test('the question bank is large enough to be worth playing', () => {
  assert.ok(countAvailable() > 700, `only ${countAvailable()} questions available`);
  for (const tier of [1, 2, 3]) {
    assert.ok(countAvailable({ tiers: [tier] }) > 40, `tier ${tier} is too thin`);
  }
});

test('asking for more questions than exist returns everything, not duplicates', () => {
  const all = generateQuestions({ rng: createRng(5), topics: ['physical'], count: 9999 });
  assert.equal(new Set(all.map((q) => q.id)).size, all.length);
  assert.equal(all.length, countAvailable({ topics: ['physical'] }));
});
