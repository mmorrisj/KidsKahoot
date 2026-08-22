import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub, MAX_LIVE_PLAYERS } from '../server/live.js';
import { createStatsStore } from '../server/stats.js';

/**
 * The hub is transport-free, so a whole game is playable here with arrays for
 * sockets and a hand-cranked clock — no WebSockets, no timers, no browser.
 */

const q = (id, answer, ...wrong) => ({
  id,
  prompt: `Question ${id}?`,
  media: null,
  map: null,
  choiceStyle: 'text',
  answer,
  choices: [answer, ...wrong],
  explanation: `${answer}.`,
  note: null,
  // locate names the answer outright, so it must ride the reveal, not the question.
  locate: { code: 'XX', name: answer, continent: 'Testland' },
  card: { front: `Q ${id}`, back: answer, hint: null },
  clue: { text: id, response: `What is ${answer}?` },
});

const QUESTIONS = [
  q('one', 'Richmond', 'Norfolk', 'Roanoke', 'Salem'),
  q('two', 'Paris', 'Rome', 'Oslo', 'Bern'),
  q('three', 'Texas', 'Maine', 'Ohio', 'Utah'),
];

function makeHub(overrides = {}) {
  return createHub({
    makeQuestions: () => QUESTIONS.map((question) => ({ ...question })),
    random: (() => { let i = 0; return () => ((i += 7) % 31) / 31; })(),
    ...overrides,
  });
}

function client(hub) {
  const inbox = [];
  const conn = hub.connect((message) => inbox.push(message));
  return {
    inbox,
    conn,
    send: (message) => conn.handle(message),
    close: () => conn.close(),
    last: (type) => [...inbox].reverse().find((m) => m.type === type),
    all: (type) => inbox.filter((m) => m.type === type),
  };
}

/** Host + n joined players, sitting in the lobby. */
function lobby(hub, names = ['Maya', 'Sam'], settings = {}) {
  const host = client(hub);
  host.send({ type: 'create', hostName: 'Dad', name: "Dad's game", settings });
  const code = host.last('lobby').code;
  const players = names.map((name) => {
    const p = client(hub);
    p.send({ type: 'join', code, name });
    return p;
  });
  return { host, players, code };
}

test('creating a game opens a lobby that other devices can see', () => {
  const hub = makeHub();
  const { host, code } = lobby(hub, []);
  assert.match(code, /^[A-Z2-9]{4}$/);
  assert.equal(host.last('lobby').name, "Dad's game");

  const browser = client(hub);
  browser.send({ type: 'list' });
  const { sessions } = browser.last('sessions');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].code, code);
  assert.equal(sessions[0].hostName, 'Dad');
  assert.equal(sessions[0].players, 0);
  assert.equal(sessions[0].maxPlayers, MAX_LIVE_PLAYERS);
});

test('joins update everyone, and name clashes are refused', () => {
  const hub = makeHub();
  const { host, players, code } = lobby(hub);
  assert.deepEqual(host.last('lobby').players, ['Maya', 'Sam']);
  assert.deepEqual(players[0].last('lobby').players, ['Maya', 'Sam']);

  const dupe = client(hub);
  dupe.send({ type: 'join', code, name: '  maya ' });
  assert.match(dupe.last('error').message, /already called/);

  const nameless = client(hub);
  nameless.send({ type: 'join', code, name: '   ' });
  assert.match(nameless.last('error').message, /name/i);
});

test('questions go out without their answers', () => {
  const hub = makeHub();
  const { host, players } = lobby(hub);
  host.send({ type: 'start' });

  for (const c of [host, ...players]) {
    const message = c.last('question');
    assert.equal(message.index, 0);
    assert.equal(message.total, 3);
    assert.equal(message.question.prompt, 'Question one?');
    assert.ok(!('answer' in message.question), 'the answer leaked onto the wire');
    assert.ok(!('explanation' in message.question), 'the explanation leaked');
    assert.ok(!('card' in message.question), 'the flash card leaked');
    assert.ok(!('locate' in message.question),
      'the locator names the answer and must wait for the reveal');
  }
});

test('a full game: scoring, streaks, reveal, and the final scoreboard', () => {
  const finished = [];
  const hub = makeHub({ onFinished: (game) => { finished.push(game); return [{ name: 'Maya' }]; } });
  const { host, players: [maya, sam] } = lobby(hub);
  host.send({ type: 'start' });

  const play = (mayaPick, samPick) => {
    maya.send({ type: 'answer', choice: mayaPick });
    assert.equal(host.last('answered').count, 1);
    sam.send({ type: 'answer', choice: samPick });
  };

  // Maya right, Sam wrong. No timer, so a correct answer is worth exactly 100.
  play('Richmond', 'Norfolk');
  let reveal = maya.last('reveal');
  assert.equal(reveal.answer, 'Richmond');
  assert.equal(reveal.locate?.name, 'Richmond', 'the locator should arrive with the reveal');
  assert.deepEqual(
    reveal.results.map((r) => [r.name, r.correct, r.points]),
    [['Maya', true, 100], ['Sam', false, 0]],
  );
  assert.equal(reveal.last, false);

  host.send({ type: 'next' });
  play('Paris', 'Paris');
  host.send({ type: 'next' });
  play('Texas', 'Texas');

  // Maya's third in a row carries the streak bonus.
  reveal = maya.last('reveal');
  const mayaRow = reveal.results.find((r) => r.name === 'Maya');
  assert.equal(mayaRow.points, 125);
  assert.equal(mayaRow.streak, 3);
  assert.equal(reveal.last, true);

  host.send({ type: 'next' });
  const done = sam.last('finished');
  assert.deepEqual(done.scoreboard.map((p) => [p.name, p.score]), [['Maya', 325], ['Sam', 200]]);
  assert.equal(done.scoreboard[0].bestStreak, 3);
  // Sam missed question one, so it shows up for another look.
  assert.deepEqual(done.review, [{ front: 'Q one', back: 'Richmond', hint: null }]);
  // The stats store's reply rides along for the leaderboard.
  assert.deepEqual(done.allTime, [{ name: 'Maya' }]);
  assert.equal(finished.length, 1);
  assert.equal(finished[0].scoreboard[0].name, 'Maya');
  assert.equal(hub.roomCount(), 0, 'a finished room should be gone');
});

test('a second answer, a bogus choice, and answers after the reveal are ignored', () => {
  const hub = makeHub();
  const { host, players: [maya, sam] } = lobby(hub);
  host.send({ type: 'start' });

  maya.send({ type: 'answer', choice: 'Richmond' });
  maya.send({ type: 'answer', choice: 'Norfolk' }); // too late to change your mind
  sam.send({ type: 'answer', choice: 'Atlantis' }); // not on the tiles
  assert.equal(sam.all('answered').length, 1, 'the bogus choice should not count');

  sam.send({ type: 'answer', choice: 'Norfolk' });
  const reveal = maya.last('reveal');
  assert.equal(reveal.results.find((r) => r.name === 'Maya').choice, 'Richmond');
});

test('the host can force the reveal when someone wandered off', () => {
  const hub = makeHub();
  const { host, players: [maya] } = lobby(hub, ['Maya', 'Sam']);
  host.send({ type: 'start' });
  maya.send({ type: 'answer', choice: 'Richmond' });
  assert.equal(maya.last('reveal'), undefined, 'still waiting on Sam');

  host.send({ type: 'reveal' });
  const reveal = maya.last('reveal');
  assert.equal(reveal.results.find((r) => r.name === 'Sam').choice, null);
});

test('with a timer, the deadline reveals and speed is worth a bonus', () => {
  let clock = 1000;
  const scheduled = [];
  const hub = makeHub({
    now: () => clock,
    schedule: (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length; },
    cancel: () => {},
  });
  const { host, players: [maya, sam] } = lobby(hub, ['Maya', 'Sam'], { timerSeconds: 20 });
  host.send({ type: 'start' });
  assert.equal(scheduled.length, 1);
  assert.ok(scheduled[0].ms >= 20_000, 'the server waits at least the full timer');

  maya.send({ type: 'answer', choice: 'Richmond' }); // instant: full speed bonus
  clock += 10_000;
  sam.send({ type: 'answer', choice: 'Richmond' }); // half the time gone: half bonus

  const { results } = maya.last('reveal');
  assert.equal(results.find((r) => r.name === 'Maya').points, 150);
  assert.equal(results.find((r) => r.name === 'Sam').points, 125);

  // Next question: nobody answers, the deadline fires, everyone is wrong.
  host.send({ type: 'next' });
  scheduled[1].fn();
  const reveal = sam.last('reveal');
  assert.ok(reveal.results.every((r) => !r.correct && r.choice === null));
});

test('joining is only possible in the lobby', () => {
  const hub = makeHub();
  const { host, code } = lobby(hub);
  host.send({ type: 'start' });

  const late = client(hub);
  late.send({ type: 'join', code, name: 'Zoe' });
  assert.match(late.last('error').message, /already started/);

  const browser = client(hub);
  browser.send({ type: 'list' });
  assert.equal(browser.last('sessions').sessions.length, 0, 'started games are not listed');
});

test('the host leaving ends the game for everyone', () => {
  const hub = makeHub();
  const { host, players: [maya] } = lobby(hub);
  host.close();
  assert.match(maya.last('ended').reason, /host left/i);
  assert.equal(hub.roomCount(), 0);
});

test('a player dropping mid-question does not stall the others', () => {
  const hub = makeHub();
  const { host, players: [maya, sam] } = lobby(hub);
  host.send({ type: 'start' });
  maya.send({ type: 'answer', choice: 'Richmond' });
  sam.close();
  const reveal = maya.last('reveal');
  assert.ok(reveal, 'the reveal should fire once the leaver is discounted');
  assert.equal(reveal.results.find((r) => r.name === 'Sam').correct, false,
    'the leaver keeps their place on the board');
});

test('a player leaving the lobby just leaves', () => {
  const hub = makeHub();
  const { host, players: [maya, sam] } = lobby(hub);
  sam.close();
  assert.deepEqual(host.last('lobby').players, ['Maya']);
  void maya;
});

test('settings that produce no questions are refused at create time', () => {
  const hub = createHub({ makeQuestions: () => [] });
  const host = client(hub);
  host.send({ type: 'create', hostName: 'Dad', name: 'Empty', settings: {} });
  assert.match(host.last('error').message, /no questions/);
  assert.equal(hub.roomCount(), 0);
});

// ---------------------------------------------------------------- the stats

test('the leaderboard accumulates across games and counts wins', () => {
  const store = createStatsStore(':memory:');
  const row = (name, score, correct, wrong, bestStreak) =>
    ({ name, score, correct, wrong, bestStreak });

  store.record({
    name: 'Game night',
    at: 111,
    scoreboard: [row('Maya', 300, 3, 1, 3), row('Sam', 200, 2, 2, 2)],
  });
  const standings = store.record({
    name: 'Rematch',
    at: 222,
    scoreboard: [row('sam', 400, 4, 0, 4), row('Maya', 250, 2, 2, 2)],
  });

  assert.deepEqual(standings.map((p) => [p.name, p.totalPoints, p.wins, p.games]), [
    ['sam', 600, 1, 2], // latest capitalisation wins
    ['Maya', 550, 1, 2],
  ]);
  assert.equal(standings[0].bestStreak, 4);
  assert.equal(standings[1].correct, 5);
  assert.equal(standings[1].lastPlayed, 222);
  store.close();
});

test('a solo game earns points but never a win', () => {
  const store = createStatsStore(':memory:');
  const [player] = store.record({
    scoreboard: [{ name: 'Maya', score: 500, correct: 5, wrong: 0, bestStreak: 5 }],
  });
  assert.equal(player.totalPoints, 500);
  assert.equal(player.wins, 0);
  store.close();
});

test('tied top scores are both wins', () => {
  const store = createStatsStore(':memory:');
  const standings = store.record({
    scoreboard: [
      { name: 'Maya', score: 300, correct: 3, wrong: 0, bestStreak: 3 },
      { name: 'Sam', score: 300, correct: 3, wrong: 0, bestStreak: 3 },
      { name: 'Zoe', score: 100, correct: 1, wrong: 2, bestStreak: 1 },
    ],
  });
  assert.deepEqual(
    standings.map((p) => [p.name, p.wins]).sort(),
    [['Maya', 1], ['Sam', 1], ['Zoe', 0]],
  );
  store.close();
});
