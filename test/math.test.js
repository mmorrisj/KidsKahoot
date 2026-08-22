import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/lib/rng.js';
import { generateQuestions, topicsInSubject } from '../src/lib/generator.js';
import {
  ADDITION_FACTS,
  BORROW_FACTS,
  CARRY_FACTS,
  TIMES_FACTS,
  additionTraps,
  borrowTraps,
  carryTraps,
  divisionTraps,
  subtractionTraps,
  timesTraps,
} from '../src/data/math.js';

const MATH_TOPICS = topicsInSubject('math').map((t) => t.id);
const mathRound = (count = 400, seed = 13) =>
  generateQuestions({ rng: createRng(seed), topics: MATH_TOPICS, count });

/** Work the prompt out independently, rather than trusting the generator. */
function solve(prompt) {
  const m = prompt.match(/^(\d+) ([×÷+−]) (\d+) = \?$/);
  assert.ok(m, `cannot parse prompt: ${prompt}`);
  const [, a, op, b] = m;
  const [x, y] = [Number(a), Number(b)];
  switch (op) {
    case '×': return x * y;
    case '÷': return x / y;
    case '+': return x + y;
    default: return x - y;
  }
}

test('every math answer is actually right', () => {
  // The whole point of a math quiz. Re-derive rather than trust the template.
  for (const q of mathRound()) {
    assert.equal(Number(q.answer), solve(q.prompt), `${q.id}: ${q.prompt} answered ${q.answer}`);
  }
});

test('answers are whole positive numbers, written plainly', () => {
  for (const q of mathRound()) {
    assert.match(q.answer, /^[1-9]\d*$/, `${q.id}: odd answer "${q.answer}"`);
  }
});

test('every math question offers four distinct choices including the answer', () => {
  for (const q of mathRound()) {
    assert.equal(q.choices.length, 4, `${q.id} has ${q.choices.length} choices`);
    assert.equal(new Set(q.choices).size, 4, `${q.id} repeats a choice`);
    assert.ok(q.choices.includes(q.answer), `${q.id} omits its own answer`);
  }
});

test('no wrong answer is secretly the right one', () => {
  for (const q of mathRound()) {
    for (const trap of q.traps) {
      assert.notEqual(trap.value, q.answer, `${q.id}: trap ${trap.value} equals the answer`);
      assert.match(trap.value, /^[1-9]\d*$/, `${q.id}: odd trap "${trap.value}"`);
    }
  }
});

test('math questions ask for a typed answer', () => {
  for (const q of mathRound()) assert.equal(q.input, 'number', `${q.id} is not a keypad question`);
});

test('the classic slips are offered, and explained', () => {
  // 52 - 27: taking the smaller digit from the larger in each column gives 35.
  const borrow = borrowTraps({ a: 52, b: 27 });
  assert.equal(borrow[0].value, 35);
  assert.match(borrow[0].why, /borrow/);

  // 27 + 15 without carrying gives 32; writing the columns side by side gives 312.
  const carry = carryTraps({ a: 27, b: 15 });
  assert.ok(carry.some((t) => t.value === 32 && /carr/i.test(t.why)));
  assert.ok(carry.some((t) => t.value === 312));

  // 7 x 8: the neighbouring rows of the table.
  const times = timesTraps({ a: 7, b: 8 }).map((t) => t.value);
  assert.ok(times.includes(49) && times.includes(63));
});

test('every fact can fill a four-choice question', () => {
  const sets = [
    ['times', TIMES_FACTS, timesTraps],
    ['division', TIMES_FACTS, divisionTraps],
    ['addition', ADDITION_FACTS, additionTraps],
    ['subtraction', ADDITION_FACTS, subtractionTraps],
    ['carry', CARRY_FACTS, carryTraps],
    ['borrow', BORROW_FACTS, borrowTraps],
  ];
  for (const [name, facts, traps] of sets) {
    assert.ok(facts.length > 50, `${name} only has ${facts.length} facts`);
    for (const fact of facts) {
      const list = traps(fact);
      assert.ok(list.length >= 3, `${name} ${fact.id} only offers ${list.length} wrong answers`);
      assert.equal(new Set(list.map((t) => t.value)).size, list.length,
        `${name} ${fact.id} repeats a wrong answer`);
    }
  }
});

test('two-digit facts always need the regrouping they are drilling', () => {
  for (const { a, b } of CARRY_FACTS) {
    assert.ok((a % 10) + (b % 10) >= 10, `${a} + ${b} needs no carry`);
  }
  for (const { a, b } of BORROW_FACTS) {
    assert.ok(b % 10 > a % 10, `${a} - ${b} needs no borrow`);
    assert.ok(a > b, `${a} - ${b} goes negative`);
  }
});

test('the hard corner of the times tables is where tier 3 lives', () => {
  const tier3 = TIMES_FACTS.filter((f) => f.tier === 3);
  assert.ok(tier3.length > 8 && tier3.length < 40, `tier 3 has ${tier3.length} facts`);
  for (const f of tier3) {
    // x2, x5, x10 and x11 all have patterns; none of them belong in tier 3.
    assert.ok(![2, 5, 10, 11].includes(f.a) && ![2, 5, 10, 11].includes(f.b),
      `${f.id} should not be tier 3`);
  }
});

test('a math round is spread across its topics, not swamped by the biggest', () => {
  // Two-digit addition enumerates 3,645 facts against the times tables' 121, so
  // an unweighted draw would return a round of nothing but carrying.
  const counts = {};
  for (const q of mathRound(120, 21)) counts[q.topic] = (counts[q.topic] ?? 0) + 1;
  assert.equal(Object.keys(counts).length, MATH_TOPICS.length, 'a topic was left out entirely');
  const biggest = Math.max(...Object.values(counts));
  assert.ok(biggest <= 120 / MATH_TOPICS.length * 1.5,
    `one topic took ${biggest} of 120 questions: ${JSON.stringify(counts)}`);
});
