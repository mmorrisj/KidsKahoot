import test from 'node:test';
import assert from 'node:assert/strict';
import { SCIENCE_FACTS } from '../src/data/science.js';
import { generateQuestions, topicsInSubject } from '../src/lib/generator.js';
import { createRng } from '../src/lib/rng.js';
import { createSession, current, submitAnswer, advance, isFinished } from '../src/lib/session.js';
import { createHub } from '../server/live.js';

const topics = topicsInSubject('science').map((t) => t.id);
const round = (options = {}) => generateQuestions({
  rng: createRng(42), topics, count: 100, ...options,
});

test('science content has unique ids, curated alternatives and all tiers in each topic', () => {
  assert.equal(SCIENCE_FACTS.length, 64);
  assert.equal(new Set(SCIENCE_FACTS.map((f) => f.id)).size, 64);
  assert.equal(new Set(SCIENCE_FACTS.map((f) => f.prompt)).size, 64);
  for (const fact of SCIENCE_FACTS) {
    assert.ok(topics.includes(fact.topic), fact.id);
    assert.equal(fact.distractors.length, 3, fact.id);
    assert.equal(new Set([fact.answer, ...fact.distractors]).size, 4, fact.id);
    assert.ok(fact.explanation.length > 40, fact.id);
  }
  for (const topic of topics) {
    for (const tier of [1, 2, 3]) {
      const questions = round({ topics: [topic], tiers: [tier] });
      assert.ok(questions.length >= 4, `${topic}, tier ${tier}`);
      assert.ok(questions.every((q) => q.topic === topic && q.tier === tier));
    }
  }
});

test('the complete science bank preserves answers, explanations and alternate forms', () => {
  const questions = round();
  assert.equal(questions.length, 64);
  const facts = new Map(SCIENCE_FACTS.map((f) => [`science-fact:${f.id}`, f]));
  for (const q of questions) {
    const fact = facts.get(q.id);
    assert.equal(q.curriculum, 'living-world');
    assert.equal(q.answer, fact.answer);
    assert.deepEqual(new Set(q.choices), new Set([fact.answer, ...fact.distractors]));
    assert.equal(q.explanation, fact.explanation);
    assert.equal(q.card.back, q.answer);
    assert.ok(q.clue.text && q.clue.response);
    assert.equal(q.input, 'choice');
    assert.equal(q.map, null);
    assert.equal(q.locate, null);
  }
  assert.deepEqual(questions, round());
  assert.notDeepEqual(questions.map((q) => q.choices), round({ rng: createRng(43) }).map((q) => q.choices));
  const mixed = round({ count: 20 });
  for (const topic of topics) assert.equal(mixed.filter((q) => q.topic === topic).length, 5);
});

test('science questions complete a scored solo session', () => {
  const session = createSession({ questions: round({ count: 8 }) });
  while (!isFinished(session)) {
    submitAnswer(session, { choice: current(session).question.answer });
    advance(session);
  }
  assert.equal(session.players[0].correct, 8);
  assert.equal(session.players[0].wrong, 0);
  assert.ok(session.players[0].score >= 800);
});

test('live science games hide teaching fields until reveal and record results', () => {
  let questions;
  let finished;
  const hub = createHub({
    makeQuestions: (settings) => (questions = round(settings)),
    onFinished: (game) => { finished = game; },
  });
  const hostInbox = [];
  const playerInbox = [];
  const host = hub.connect((m) => hostInbox.push(m));
  const player = hub.connect((m) => playerInbox.push(m));
  const last = (inbox, type) => inbox.filter((m) => m.type === type).at(-1);
  host.handle({ type: 'create', hostName: 'Parent', name: 'Science', settings: { topics, count: 4 } });
  player.handle({ type: 'join', code: last(hostInbox, 'lobby').code, name: 'Kid' });
  host.handle({ type: 'start' });
  for (const q of questions) {
    const open = last(playerInbox, 'question').question;
    assert.equal(open.prompt, q.prompt);
    for (const key of ['answer', 'explanation', 'card', 'clue']) assert.ok(!(key in open));
    player.handle({ type: 'answer', choice: q.answer });
    const reveal = last(playerInbox, 'reveal');
    assert.equal(reveal.answer, q.answer);
    assert.equal(reveal.explanation, q.explanation);
    host.handle({ type: 'next' });
  }
  assert.equal(last(playerInbox, 'finished').scoreboard[0].correct, 4);
  assert.ok(finished);
  host.close();
  player.close();
});
