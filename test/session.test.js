import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_POINTS,
  MAX_SPEED_BONUS,
  RETRY_POINTS,
  STREAK_BONUS,
  advance,
  createSession,
  current,
  isFinished,
  missedQuestions,
  standings,
  submitAnswer,
  submitTimeout,
} from '../src/lib/session.js';

/** Minimal stand-in questions: answer is always "right". */
const fakeQuestions = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    answer: 'right',
    choices: ['right', 'wrong', 'other', 'more'],
    explanation: `because ${i}`,
    note: null,
  }));

const answerAll = (state, choice) => {
  while (!isFinished(state)) {
    submitAnswer(state, { choice });
    advance(state);
  }
};

test('a correct answer with no timer is worth the flat base score', () => {
  const state = createSession({ questions: fakeQuestions(3) });
  const result = submitAnswer(state, { choice: 'right' });
  assert.equal(result.correct, true);
  assert.equal(result.points, BASE_POINTS);
});

test('a timer adds a speed bonus that scales with time left', () => {
  const state = createSession({ questions: fakeQuestions(3), timerSeconds: 20 });
  const instant = submitAnswer(state, { choice: 'right', secondsLeft: 20 });
  assert.equal(instant.points, BASE_POINTS + MAX_SPEED_BONUS);

  advance(state);
  const slow = submitAnswer(state, { choice: 'right', secondsLeft: 10 });
  assert.equal(slow.points, BASE_POINTS + MAX_SPEED_BONUS / 2);
});

test('answering at the buzzer still scores the full base points', () => {
  // The slowest reader must never be able to score zero for a right answer.
  const state = createSession({ questions: fakeQuestions(1), timerSeconds: 20 });
  const result = submitAnswer(state, { choice: 'right', secondsLeft: 0 });
  assert.equal(result.points, BASE_POINTS);
});

test('a streak pays a bonus from the third correct answer on', () => {
  const state = createSession({ questions: fakeQuestions(4) });
  const points = [];
  for (let i = 0; i < 4; i++) {
    points.push(submitAnswer(state, { choice: 'right' }).points);
    advance(state);
  }
  assert.deepEqual(points, [
    BASE_POINTS,
    BASE_POINTS,
    BASE_POINTS + STREAK_BONUS,
    BASE_POINTS + STREAK_BONUS,
  ]);
});

test('a wrong answer breaks the streak', () => {
  const state = createSession({ questions: fakeQuestions(5) });
  submitAnswer(state, { choice: 'right' });
  advance(state);
  submitAnswer(state, { choice: 'right' });
  advance(state);
  submitAnswer(state, { choice: 'wrong' });
  advance(state);
  assert.equal(submitAnswer(state, { choice: 'right' }).points, BASE_POINTS);
});

test('a missed question comes back later in the same round', () => {
  const state = createSession({ questions: fakeQuestions(10) });
  const missedId = current(state).question.id;

  submitAnswer(state, { choice: 'wrong' });
  advance(state);

  assert.equal(state.queue.length, 11, 'the missed question should be re-queued');
  const returnsAt = state.queue.findIndex((e, i) => i > 0 && e.question.id === missedId);
  assert.ok(returnsAt > 1, 'it should not come back immediately');
  assert.equal(state.queue[returnsAt].attempt, 2);
});

test('a question only gets one retry, however many times it is missed', () => {
  const state = createSession({ questions: fakeQuestions(2) });
  answerAll(state, 'wrong');
  // Two questions, each re-queued once: four attempts, then the round ends.
  assert.equal(state.queue.length, 4);
  assert.equal(state.history.length, 4);
});

test('a retry is worth less than getting it right first time', () => {
  const state = createSession({ questions: fakeQuestions(1) });
  submitAnswer(state, { choice: 'wrong' });
  advance(state);
  assert.equal(current(state).attempt, 2);
  assert.equal(submitAnswer(state, { choice: 'right' }).points, RETRY_POINTS);
});

test('pass-and-play rotates through the players', () => {
  const state = createSession({ questions: fakeQuestions(5), players: ['Maya', 'Sam'] });
  const order = [];
  while (!isFinished(state)) {
    order.push(current(state).player.name);
    submitAnswer(state, { choice: 'right' });
    advance(state);
  }
  assert.deepEqual(order, ['Maya', 'Sam', 'Maya', 'Sam', 'Maya']);
});

test('scores are tracked per player, not for the round as a whole', () => {
  const state = createSession({ questions: fakeQuestions(4), players: ['Maya', 'Sam'] });
  // Maya gets both of hers right, Sam gets both wrong.
  for (const choice of ['right', 'wrong', 'right', 'wrong']) {
    submitAnswer(state, { choice });
    advance(state);
  }
  const [first, second] = standings(state);
  assert.equal(first.name, 'Maya');
  assert.equal(first.correct, 2);
  assert.equal(second.name, 'Sam');
  assert.equal(second.score, 0);
});

test('running out of time counts as a miss, not a crash', () => {
  const state = createSession({ questions: fakeQuestions(3), timerSeconds: 15 });
  const result = submitTimeout(state);
  assert.equal(result.correct, false);
  assert.equal(result.choice, null);
  assert.equal(result.points, 0);
});

test('the end-of-round list reports each missed question once', () => {
  const state = createSession({ questions: fakeQuestions(3) });
  answerAll(state, 'wrong');
  assert.equal(missedQuestions(state).length, 3);
});

test('an empty round is rejected rather than starting a broken game', () => {
  assert.throws(() => createSession({ questions: [] }), /at least one question/);
});
