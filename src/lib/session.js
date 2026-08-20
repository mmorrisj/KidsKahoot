/**
 * Round state: the queue, the players, and the scoring.
 *
 * Kept free of DOM so it can be unit-tested and reused by the modes that come
 * after multiple choice.
 *
 * Two deliberate choices:
 *
 * 1. A missed question comes back later in the same round (a crude Leitner
 *    box). Getting it wrong once and never seeing it again teaches nothing.
 * 2. Speed only ever *adds* points, and only when a timer is on. Kahoot's
 *    faster-is-worth-more scoring means the slowest reader always loses, which
 *    is the kid who most needs to stay in the game.
 */

export const BASE_POINTS = 100;
export const RETRY_POINTS = 50;
export const MAX_SPEED_BONUS = 50;
export const STREAK_BONUS = 25;
export const STREAK_THRESHOLD = 3; // Bonus starts on the third correct in a row.
export const MAX_ATTEMPTS = 2; // One retry per question.
const REQUEUE_GAP = 4; // Questions to wait before a missed one returns.

export function createSession({ questions, players = ['Player 1'], timerSeconds = null }) {
  if (!questions.length) throw new Error('A round needs at least one question.');
  return {
    queue: questions.map((question) => ({ question, attempt: 1 })),
    index: 0,
    turnIndex: 0,
    timerSeconds,
    originalCount: questions.length,
    players: players.map((name) => ({
      name,
      score: 0,
      correct: 0,
      wrong: 0,
      streak: 0,
      bestStreak: 0,
    })),
    history: [],
  };
}

export function isFinished(state) {
  return state.index >= state.queue.length;
}

export function current(state) {
  if (isFinished(state)) return null;
  const entry = state.queue[state.index];
  return {
    question: entry.question,
    attempt: entry.attempt,
    player: state.players[state.turnIndex % state.players.length],
    position: state.index + 1,
    total: state.queue.length,
  };
}

function speedBonus(state, secondsLeft) {
  if (!state.timerSeconds || secondsLeft == null) return 0;
  const fraction = Math.max(0, Math.min(1, secondsLeft / state.timerSeconds));
  return Math.round(MAX_SPEED_BONUS * fraction);
}

/**
 * Score one answer. Does not advance the round — the UI needs to show the
 * result first — so call `advance` once the player has read it.
 */
export function submitAnswer(state, { choice, secondsLeft = null }) {
  const turn = current(state);
  if (!turn) throw new Error('The round is already over.');

  const { question, attempt, player } = turn;
  const correct = choice === question.answer;
  const isRetry = attempt > 1;
  let points = 0;

  if (correct) {
    player.correct += 1;
    player.streak += 1;
    player.bestStreak = Math.max(player.bestStreak, player.streak);
    points = isRetry ? RETRY_POINTS : BASE_POINTS + speedBonus(state, secondsLeft);
    if (player.streak >= STREAK_THRESHOLD) points += STREAK_BONUS;
    player.score += points;
  } else {
    player.wrong += 1;
    player.streak = 0;
    if (attempt < MAX_ATTEMPTS) requeue(state);
  }

  const result = {
    correct,
    isRetry,
    choice,
    answer: question.answer,
    explanation: question.explanation,
    note: question.note,
    points,
    streak: player.streak,
    player,
    question,
  };
  state.history.push(result);
  return result;
}

/** Timed out with no answer: same as a wrong answer, but with no choice. */
export function submitTimeout(state) {
  return submitAnswer(state, { choice: null, secondsLeft: 0 });
}

function requeue(state) {
  const entry = state.queue[state.index];
  const target = Math.min(state.index + REQUEUE_GAP, state.queue.length);
  state.queue.splice(target, 0, {
    question: entry.question,
    attempt: entry.attempt + 1,
  });
}

export function advance(state) {
  state.index += 1;
  state.turnIndex += 1;
  return current(state);
}

export function standings(state) {
  return state.players
    .map((p) => ({ ...p }))
    .sort((a, b) => b.score - a.score || b.correct - a.correct);
}

/** Questions missed at least once, for the "practice these" list at the end. */
export function missedQuestions(state) {
  const missed = new Map();
  for (const entry of state.history) {
    if (entry.correct) continue;
    missed.set(entry.question.id, entry.question);
  }
  return [...missed.values()];
}
