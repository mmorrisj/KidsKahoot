import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/lib/rng.js';
import {
  CHOICE_COUNT,
  CURRICULA,
  TOPICS,
  countAvailable,
  generateQuestions,
  listQuestionRefs,
  topicsIn,
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
  for (const q of round({ topics: ['us-capitals'] })) {
    assert.equal(q.topic, 'us-capitals');
  }
});

test('a Virginia round never asks about the rest of the world', () => {
  const topics = topicsIn('virginia').map((t) => t.id);
  for (const q of round({ topics })) {
    assert.equal(q.curriculum, 'virginia', `${q.id} leaked into a Virginia round`);
  }
});

test('every curriculum has enough questions to fill a round on its own', () => {
  for (const c of CURRICULA) {
    const topics = topicsIn(c.id).map((t) => t.id);
    assert.ok(topics.length > 0, `${c.id} has no topics`);
    assert.ok(countAvailable({ topics }) >= 20,
      `${c.label} only has ${countAvailable({ topics })} questions`);
  }
});

test('every topic belongs to a real curriculum and can produce questions', () => {
  const known = new Set(CURRICULA.map((c) => c.id));
  for (const t of TOPICS) {
    assert.ok(known.has(t.curriculum), `${t.id} points at unknown curriculum ${t.curriculum}`);
    assert.ok(countAvailable({ topics: [t.id] }) >= 5,
      `topic ${t.id} only has ${countAvailable({ topics: [t.id] })} questions`);
  }
});

test('the Fall Line cities are never asked which region they are in', () => {
  // Classroom materials disagree about whether Richmond is Coastal Plain or
  // Piedmont, so the game does not pick a side.
  const asked = listQuestionRefs({ topics: ['va-regions'] })
    .filter((r) => r.template.id === 'va-region-of-place')
    .map((r) => r.entity.name);
  for (const city of ['Richmond', 'Fredericksburg', 'Alexandria', 'Petersburg']) {
    assert.ok(!asked.includes(city), `${city} is on the Fall Line and should not be asked`);
  }
});

test('state abbreviations compete with same-letter abbreviations', () => {
  // MI/MN/MO/MS/MT is exactly the set kids confuse, so those are the distractors.
  const refs = listQuestionRefs({ topics: ['us-abbreviations'] });
  const minnesota = refs.find(
    (r) => r.template.id === 'abbreviation-of-state' && r.entity.name === 'Minnesota',
  );
  const q = minnesota.template.make(createRng(8), minnesota.entity);
  assert.ok(q.choices.includes('MN'));
  assert.ok(q.choices.every((c) => c.startsWith('M')), `got ${q.choices.join(', ')}`);
});

test('Virginia and Vatican City do not collide despite sharing the code VA', () => {
  // Both entities key on "VA"; the dataset namespace is what keeps them apart.
  const questions = generateQuestions({
    rng: createRng(21),
    topics: ['us-abbreviations', 'world-capitals'],
    count: 400,
  });
  const virginia = questions.filter((q) => q.id.endsWith(':VA'));
  assert.ok(virginia.length >= 2, 'expected both the state and the country to appear');
  assert.equal(new Set(virginia.map((q) => q.id)).size, virginia.length);
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
  assert.ok(countAvailable() > 1000, `only ${countAvailable()} questions available`);
  for (const tier of [1, 2, 3]) {
    assert.ok(countAvailable({ tiers: [tier] }) > 40, `tier ${tier} is too thin`);
  }
});

test('asking for more questions than exist returns everything, not duplicates', () => {
  const all = generateQuestions({ rng: createRng(5), topics: ['world-physical'], count: 9999 });
  assert.equal(new Set(all.map((q) => q.id)).size, all.length);
  assert.equal(all.length, countAvailable({ topics: ['world-physical'] }));
});
