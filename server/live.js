/**
 * The live-game hub: rooms, joining, and the question loop for games played
 * across devices.
 *
 * Kahoot-shaped where the pass-the-device round is turn-based: the host builds
 * the round and controls pacing, every player answers every question at the
 * same time on their own device, and the server is the referee — it holds the
 * answers, scores the round, and never sends a correct answer over the wire
 * before the reveal.
 *
 * Deliberately transport-free: connections are anything with a `send(object)`,
 * and time is injected, so test/live.test.js can drive whole games with plain
 * arrays and a fake clock. server.mjs binds this to real WebSockets.
 *
 * Scoring matches src/lib/session.js (same constants): speed only ever *adds*
 * points, so the slowest reader still scores for being right. Live games have
 * no retries — everyone faces each question exactly once — so the requeue
 * mechanic stays in pass-the-device mode.
 */
import {
  BASE_POINTS,
  MAX_SPEED_BONUS,
  STREAK_BONUS,
  STREAK_THRESHOLD,
} from '../src/lib/session.js';

export const MAX_LIVE_PLAYERS = 12;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
/** Extra time the server waits past the player-side timer, for slow networks. */
const TIMER_GRACE_MS = 750;

export function createHub({
  makeQuestions,
  onFinished = null,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (id) => clearTimeout(id),
  now = () => Date.now(),
  random = Math.random,
} = {}) {
  if (typeof makeQuestions !== 'function') throw new Error('the hub needs makeQuestions()');

  const rooms = new Map(); // code -> room

  const makeCode = () => {
    let code;
    do {
      code = Array.from({ length: 4 },
        () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join('');
    } while (rooms.has(code));
    return code;
  };

  // ----------------------------------------------------------------- rooms

  const playersIn = (room) => [...room.players.values()];

  function lobbyMessage(room) {
    return {
      type: 'lobby',
      code: room.code,
      name: room.name,
      hostName: room.hostName,
      players: playersIn(room).map((p) => p.name),
      count: room.settings.count,
      timerSeconds: room.settings.timerSeconds,
    };
  }

  function broadcast(room, message, { includeHost = true } = {}) {
    if (includeHost && room.host) room.host.send(message);
    for (const player of room.players.values()) player.conn.send(message);
  }

  /** Rooms a player can still join, newest first. */
  function openSessions() {
    return [...rooms.values()]
      .filter((room) => room.state === 'lobby')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((room) => ({
        code: room.code,
        name: room.name,
        hostName: room.hostName,
        players: room.players.size,
        maxPlayers: MAX_LIVE_PLAYERS,
        count: room.settings.count,
        timerSeconds: room.settings.timerSeconds,
      }));
  }

  function closeRoom(room, reason) {
    if (room.timer != null) { cancel(room.timer); room.timer = null; }
    broadcast(room, { type: 'ended', reason });
    for (const player of room.players.values()) player.conn.room = null;
    if (room.host) room.host.room = null;
    rooms.delete(room.code);
  }

  // ------------------------------------------------------------- questions

  /**
   * What a question looks like on the wire: everything except the answer.
   * `locate` names the answer's country and continent outright, so it ships
   * with the reveal instead.
   */
  function publicQuestion(question) {
    const { answer, explanation, note, card, clue, locate, ...open } = question;
    return open;
  }

  function askCurrent(room) {
    const question = room.questions[room.index];
    room.state = 'question';
    room.answers = new Map();
    room.askedAt = now();
    const seconds = room.settings.timerSeconds;
    room.deadline = seconds ? room.askedAt + seconds * 1000 : null;
    if (seconds) {
      room.timer = schedule(() => reveal(room), seconds * 1000 + TIMER_GRACE_MS);
    }
    broadcast(room, {
      type: 'question',
      index: room.index,
      total: room.questions.length,
      seconds,
      question: publicQuestion(question),
    });
  }

  function speedBonus(room, answeredAt) {
    if (!room.deadline) return 0;
    const total = room.settings.timerSeconds * 1000;
    const left = Math.max(0, Math.min(total, room.deadline - answeredAt));
    return Math.round(MAX_SPEED_BONUS * (left / total));
  }

  function scoreboard(room) {
    return playersIn(room)
      .map(({ name, score, correct, wrong, bestStreak, left }) =>
        ({ name, score, correct, wrong, bestStreak, left }))
      .sort((a, b) => b.score - a.score || b.correct - a.correct);
  }

  function reveal(room) {
    if (room.state !== 'question') return;
    if (room.timer != null) { cancel(room.timer); room.timer = null; }
    room.state = 'reveal';

    const question = room.questions[room.index];
    const results = [];
    for (const player of room.players.values()) {
      const given = room.answers.get(player.key) ?? null;
      const correct = given != null && given.choice === question.answer;
      let points = 0;
      if (correct) {
        player.correct += 1;
        player.streak += 1;
        player.bestStreak = Math.max(player.bestStreak, player.streak);
        points = BASE_POINTS + speedBonus(room, given.at);
        if (player.streak >= STREAK_THRESHOLD) points += STREAK_BONUS;
        player.score += points;
      } else {
        player.wrong += 1;
        player.streak = 0;
        room.missed.set(question.id, question);
      }
      results.push({
        name: player.name,
        choice: given?.choice ?? null,
        correct,
        points,
        streak: player.streak,
        score: player.score,
      });
    }

    broadcast(room, {
      type: 'reveal',
      answer: question.answer,
      explanation: question.explanation,
      note: question.note,
      locate: question.locate ?? null,
      results,
      scoreboard: scoreboard(room),
      last: room.index + 1 >= room.questions.length,
    });
  }

  function finish(room) {
    room.state = 'done';
    const board = scoreboard(room);
    const review = [...room.missed.values()].map((q) => ({
      front: q.card.front,
      back: q.card.back,
      hint: q.card.hint,
    }));
    // The stats store learns the result and answers with the all-time table,
    // so the final screen can show both without a second round trip.
    const allTime = onFinished?.({ scoreboard: board, name: room.name, at: now() }) ?? null;
    broadcast(room, { type: 'finished', scoreboard: board, review, allTime });
    for (const player of room.players.values()) player.conn.room = null;
    if (room.host) room.host.room = null;
    rooms.delete(room.code);
  }

  function everyoneAnswered(room) {
    return playersIn(room).every((p) => p.left || room.answers.has(p.key));
  }

  // ------------------------------------------------------------- messages

  const handlers = {
    create(conn, { hostName, name, settings }) {
      if (conn.room) return conn.send({ type: 'error', message: 'Already in a game.' });
      let questions;
      try {
        questions = makeQuestions(settings ?? {});
      } catch {
        questions = [];
      }
      if (!questions.length) {
        return conn.send({ type: 'error', message: 'Those settings produce no questions.' });
      }
      const room = {
        code: makeCode(),
        name: String(name ?? 'Kids Quiz Quest').slice(0, 40),
        hostName: String(hostName ?? 'Host').slice(0, 20),
        host: conn,
        settings: {
          count: questions.length,
          timerSeconds: settings?.timerSeconds ?? null,
        },
        questions,
        state: 'lobby',
        createdAt: now(),
        players: new Map(), // key (lowercased name) -> player
        index: 0,
        answers: new Map(),
        missed: new Map(),
        deadline: null,
        timer: null,
      };
      rooms.set(room.code, room);
      conn.room = room;
      conn.role = 'host';
      conn.send(lobbyMessage(room));
    },

    list(conn) {
      conn.send({ type: 'sessions', sessions: openSessions() });
    },

    join(conn, { code, name }) {
      if (conn.room) return conn.send({ type: 'error', message: 'Already in a game.' });
      const room = rooms.get(String(code ?? '').toUpperCase());
      if (!room) return conn.send({ type: 'error', message: 'That game is gone.' });
      if (room.state !== 'lobby') {
        return conn.send({ type: 'error', message: 'That game has already started.' });
      }
      if (room.players.size >= MAX_LIVE_PLAYERS) {
        return conn.send({ type: 'error', message: 'That game is full.' });
      }
      const clean = String(name ?? '').trim().slice(0, 14);
      if (!clean) return conn.send({ type: 'error', message: 'Pick a name first.' });
      const key = clean.toLowerCase();
      if (room.players.has(key)) {
        return conn.send({ type: 'error', message: `Someone here is already called ${clean}.` });
      }
      room.players.set(key, {
        key,
        name: clean,
        conn,
        score: 0,
        correct: 0,
        wrong: 0,
        streak: 0,
        bestStreak: 0,
        left: false,
      });
      conn.room = room;
      conn.role = 'player';
      conn.playerKey = key;
      conn.send({ type: 'joined', code: room.code, you: clean });
      broadcast(room, lobbyMessage(room));
    },

    start(conn) {
      const room = conn.room;
      if (!room || conn.role !== 'host' || room.state !== 'lobby') return;
      if (!room.players.size) {
        return conn.send({ type: 'error', message: 'No players have joined yet.' });
      }
      askCurrent(room);
    },

    answer(conn, { choice }) {
      const room = conn.room;
      if (!room || conn.role !== 'player' || room.state !== 'question') return;
      if (room.answers.has(conn.playerKey)) return; // first answer counts
      const question = room.questions[room.index];
      if (!question.choices.includes(choice)) return;
      room.answers.set(conn.playerKey, { choice, at: now() });
      broadcast(room, {
        type: 'answered',
        name: room.players.get(conn.playerKey).name,
        count: room.answers.size,
        of: playersIn(room).filter((p) => !p.left).length,
      });
      if (everyoneAnswered(room)) reveal(room);
    },

    // The host's "show the answer" button, for when someone wandered off.
    reveal(conn) {
      const room = conn.room;
      if (!room || conn.role !== 'host') return;
      reveal(room);
    },

    next(conn) {
      const room = conn.room;
      if (!room || conn.role !== 'host' || room.state !== 'reveal') return;
      room.index += 1;
      if (room.index >= room.questions.length) finish(room);
      else askCurrent(room);
    },

    leave(conn) {
      disconnect(conn);
    },
  };

  function disconnect(conn) {
    const room = conn.room;
    if (!room) return;
    conn.room = null;

    if (conn.role === 'host') {
      closeRoom(room, 'The host left the game.');
      return;
    }

    const player = room.players.get(conn.playerKey);
    if (!player) return;
    if (room.state === 'lobby') {
      // In the lobby they simply vanish; mid-game their score stays on the
      // board so a dropped connection cannot erase a kid's points.
      room.players.delete(conn.playerKey);
      broadcast(room, lobbyMessage(room));
    } else {
      player.left = true;
      if (room.state === 'question' && room.players.size && everyoneAnswered(room)) {
        reveal(room);
      }
    }
  }

  // ------------------------------------------------------------------ api

  return {
    /** Attach one connection. `send` receives plain objects. */
    connect(send) {
      const conn = { send, room: null, role: null, playerKey: null };
      return {
        handle(message) {
          const handler = handlers[message?.type];
          if (handler) handler(conn, message);
          else send({ type: 'error', message: `Unknown message "${message?.type}".` });
        },
        close() {
          disconnect(conn);
        },
      };
    },

    openSessions,
    roomCount: () => rooms.size,
  };
}
