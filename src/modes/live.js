/**
 * Live mode: one device hosts, the others join and play — the Kahoot shape.
 *
 * The server (server/live.js) is the referee: it holds the questions, scores
 * the answers, and tells everyone what happened. These flows are deliberately
 * dumb renderers of the last message received:
 *
 *   host:    lobby -> question (watch answers come in) -> reveal -> ... -> finished
 *   player:  browse sessions -> lobby -> question (answer!) -> reveal -> ... -> finished
 *
 * The host paces the game — the reveal stays up until they press Next — because
 * a parent reading the explanation aloud is the whole point of playing together.
 */
import { h, render } from '../ui/dom.js';
import { connectLive } from '../lib/net.js';
import { withFlags } from '../ui/flag.js';
import { renderWorldLocator } from '../ui/world-locator.js';
import { renderAnswers, renderPrompt } from './multiple-choice.js';

const NAME_KEY = 'geography-quest.live-name';

// ------------------------------------------------------------------ helpers

/**
 * A ticking timer bar, purely cosmetic — the server enforces the real deadline.
 * Pass the same `deadline` on re-render so redrawing a screen (the host redraws
 * on every incoming answer) does not restart the clock.
 */
function countdown(seconds, deadline = performance.now() + seconds * 1000) {
  const fill = h('div.timer__fill');
  const label = h('span.timer__label');
  const node = h('div.timer', h('div.timer__track', fill), label);
  const tick = () => {
    const remaining = Math.max(0, deadline - performance.now());
    fill.style.width = `${(remaining / (seconds * 1000)) * 100}%`;
    label.textContent = `${Math.ceil(remaining / 1000)}s`;
    fill.classList.toggle('timer__fill--low', remaining < seconds * 1000 * 0.25);
    if (remaining <= 0) clearInterval(id);
  };
  const id = setInterval(tick, 100);
  tick();
  return { node, stop: () => clearInterval(id) };
}

function scoreboardList(entries, { medals = true } = {}) {
  const icons = ['🥇', '🥈', '🥉'];
  return h('ol.scoreboard', entries.map((p, i) =>
    h('li.scoreboard__row', { class: i === 0 && medals && entries.length > 1 ? 'scoreboard__row--top' : '' },
      h('span.scoreboard__rank', medals ? (icons[i] ?? `${i + 1}`) : `${i + 1}`),
      h('span.scoreboard__name', p.name, p.left ? ' (left)' : ''),
      h('span.scoreboard__detail', `${p.correct} right · ${p.wrong} wrong`),
      h('span.scoreboard__score', `${p.score}`),
    )));
}

function allTimeTable(players) {
  if (!players?.length) return null;
  return h('section.panel',
    h('h2.panel__title', '🏆 All-time leaderboard'),
    h('ol.alltime', players.map((p) =>
      h('li.alltime__row',
        h('span.alltime__name', p.name),
        h('span.alltime__detail',
          `${p.games} game${p.games === 1 ? '' : 's'} · ${p.wins} win${p.wins === 1 ? '' : 's'}`),
        h('span.alltime__points', `${p.totalPoints} pts`),
      ))));
}

function finishedScreen({ mount, message, onExit, exitLabel }) {
  const { scoreboard, review, allTime } = message;
  const solo = scoreboard.length === 1;
  render(mount,
    h('section.screen.screen--results',
      h('h1.results__title', solo ? 'Round complete!' : `${scoreboard[0].name} wins!`),
      scoreboardList(scoreboard),
      review.length > 0 && h('section.panel',
        h('h2.panel__title', `Worth another look (${review.length})`),
        h('ul.review', review.map((q) =>
          h('li.review__item',
            h('span.review__front', q.hint ? [withFlags(q.hint), ' '] : '', q.front),
            h('span.review__arrow', '→'),
            h('span.review__back', withFlags(q.back)),
          )))),
      allTimeTable(allTime),
      h('div.actions',
        h('button.btn.btn--primary', { type: 'button', onclick: onExit }, exitLabel)),
    ));
}

function noticeScreen({ mount, headline, detail, onExit, exitLabel = 'Back' }) {
  render(mount,
    h('section.screen.screen--notice',
      h('section.panel',
        h('h2.panel__title', headline),
        detail && h('p.hint', detail),
        h('div.actions',
          h('button.btn.btn--primary', { type: 'button', onclick: onExit }, exitLabel)),
      )));
}

// ---------------------------------------------------------------- host flow

export function runHostFlow({ mount, settings, hostName, gameName, onExit }) {
  let timer = null;
  let answeredNames = new Set();
  let lastLobby = null;
  let question = null; // the current 'question' message
  let questionDeadline = null;
  let done = false;

  function cleanup() {
    done = true;
    timer?.stop();
    net.close();
  }

  const exit = () => { cleanup(); onExit(); };

  const net = connectLive({
    onMessage: handle,
    onClose: () => {
      if (done) return;
      noticeScreen({
        mount,
        headline: 'Lost the game server',
        detail: 'The connection dropped. Is the server still running?',
        onExit: exit,
      });
    },
  });

  net.send({ type: 'create', hostName, name: gameName, settings });

  function handle(message) {
    if (message.type === 'lobby') { lastLobby = message; showLobby(message); }
    if (message.type === 'question') {
      answeredNames = new Set();
      question = message;
      questionDeadline = message.seconds ? performance.now() + message.seconds * 1000 : null;
      showQuestion();
    }
    if (message.type === 'answered') {
      answeredNames.add(message.name);
      showQuestion();
    }
    if (message.type === 'reveal') showReveal(message);
    if (message.type === 'finished') {
      finishedScreen({ mount, message, onExit: exit, exitLabel: 'Back to setup' });
      done = true;
      net.close();
    }
    if (message.type === 'error') {
      noticeScreen({ mount, headline: message.message, onExit: exit });
    }
    if (message.type === 'ended') {
      noticeScreen({ mount, headline: message.reason, onExit: exit });
    }
  }

  function showLobby(lobby) {
    render(mount,
      h('section.screen.screen--lobby',
        h('header.hero',
          h('h1.hero__title', `📡 ${lobby.name}`),
          h('p.hero__sub',
            `Players join from their own device at ${location.host} → Join a game.`),
        ),
        h('section.panel',
          h('h2.panel__title', `Who's here (${lobby.players.length})`),
          lobby.players.length
            ? h('div.chips', lobby.players.map((name) => h('span.chip.chip--on', name)))
            : h('p.hint', 'Waiting for players…'),
        ),
        h('p.availability',
          `${lobby.count} questions · timer ${lobby.timerSeconds ? `${lobby.timerSeconds}s` : 'off'}`),
        h('div.actions',
          h('button.btn.btn--primary.btn--xl', {
            type: 'button',
            disabled: !lobby.players.length,
            onclick: () => net.send({ type: 'start' }),
          }, 'Start the game'),
          h('button.btn.btn--ghost', { type: 'button', onclick: exit }, 'Cancel'),
        ),
      ));
  }

  function showQuestion() {
    timer?.stop();
    timer = question.seconds ? countdown(question.seconds, questionDeadline) : null;
    const players = lastLobby?.players ?? [];
    render(mount,
      h('section.screen.screen--question',
        h('header.qbar',
          h('span.qbar__player', 'Hosting'),
          h('span.qbar__progress', `${question.index + 1} of ${question.total}`),
          h('span.qbar__score', `${answeredNames.size}/${players.length} in`),
        ),
        renderPrompt(question.question),
        timer?.node ?? h('p.hint', 'No timer — waiting for everyone to answer.'),
        h('section.panel',
          h('h2.panel__title', 'Answers in'),
          h('div.chips', players.map((name) =>
            h('span.chip', { class: answeredNames.has(name) ? 'chip--on' : '' },
              answeredNames.has(name) ? `✓ ${name}` : name))),
        ),
        h('div.actions',
          h('button.btn.btn--ghost', {
            type: 'button',
            onclick: () => net.send({ type: 'reveal' }),
          }, 'Show the answer'),
        ),
      ));
  }

  function showReveal(message) {
    timer?.stop();
    render(mount,
      h('section.screen.screen--question',
        h('header.qbar',
          h('span.qbar__player', 'Hosting'),
          h('span.qbar__progress', `${question.index + 1} of ${question.total}`),
          h('span.qbar__score', ''),
        ),
        renderPrompt(question.question),
        h('div.feedback.feedback--good', { role: 'status' },
          h('p.feedback__headline', 'The answer is ', withFlags(message.answer), '.'),
          h('p.feedback__why', withFlags(message.explanation)),
          message.note && h('p.feedback__note', message.note),
          message.locate && renderWorldLocator(message.locate),
          h('ul.livewire', message.results.map((r) =>
            h('li.livewire__row', { class: r.correct ? 'livewire__row--right' : 'livewire__row--wrong' },
              h('span', r.correct ? '✅' : r.choice == null ? '⌛' : '❌', ` ${r.name}`),
              h('span.livewire__points',
                r.correct ? `+${r.points}` : r.choice == null ? 'no answer' : withFlags(r.choice)),
            ))),
          h('button.btn.btn--primary', {
            type: 'button',
            onclick: () => net.send({ type: 'next' }),
          }, message.last ? 'See results' : 'Next question'),
        ),
      ));
  }

  return { stop: cleanup };
}

// -------------------------------------------------------------- player flow

export function runJoinFlow({ mount, onExit }) {
  let sessions = [];
  let sessionsBox = null; // the "Open games" panel body, updated in place
  let poll = null;
  let timer = null;
  let done = false;
  let myName = localStorage.getItem(NAME_KEY) ?? '';
  let question = null; // the current 'question' message
  let answers = null; // the live answer surface
  let myChoice = null;
  let myScore = 0;
  let answeredCount = null;
  let keyHandler = null;

  function bindKeys(handler) {
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = handler;
    if (handler) document.addEventListener('keydown', handler);
  }

  function cleanup() {
    done = true;
    clearInterval(poll);
    timer?.stop();
    bindKeys(null);
    net.close();
  }

  const exit = () => { cleanup(); onExit(); };

  const net = connectLive({
    onMessage: handle,
    onClose: () => {
      if (done) return;
      clearInterval(poll);
      noticeScreen({
        mount,
        headline: 'Lost the game server',
        detail: 'Joining needs the game server — the address only works while npm start is running.',
        onExit: exit,
      });
    },
  });

  // Ask right away and keep the list fresh while browsing.
  net.send({ type: 'list' });
  poll = setInterval(() => net.send({ type: 'list' }), 2000);

  showBrowse();

  function handle(message) {
    if (message.type === 'sessions') {
      sessions = message.sessions;
      // Refresh the list only, and only while browsing — a full-screen redraw
      // would tear down the name input mid-keystroke every poll tick, and a
      // lobby or question screen must stay put entirely.
      if (poll && sessionsBox?.isConnected) renderSessions();
    }
    if (message.type === 'joined') {
      clearInterval(poll);
      poll = null;
    }
    if (message.type === 'lobby') showLobby(message);
    if (message.type === 'question') {
      question = message;
      myChoice = null;
      answeredCount = null;
      showQuestion();
    }
    if (message.type === 'answered') {
      answeredCount = message;
      updateWaiting();
    }
    if (message.type === 'reveal') showReveal(message);
    if (message.type === 'finished') {
      finishedScreen({ mount, message, onExit: exit, exitLabel: 'Done' });
      done = true;
      net.close();
    }
    if (message.type === 'error') {
      // Bad joins (name taken, game started) bounce back to the list.
      noticeScreen({
        mount,
        headline: message.message,
        onExit: () => {
          poll = setInterval(() => net.send({ type: 'list' }), 2000);
          net.send({ type: 'list' });
          showBrowse();
        },
      });
    }
    if (message.type === 'ended') {
      timer?.stop();
      noticeScreen({ mount, headline: message.reason, onExit: exit });
    }
  }

  /** Fill just the "Open games" panel, leaving the rest of the screen alone. */
  function renderSessions() {
    render(sessionsBox,
      sessions.length
        ? h('ul.sessions', sessions.map((s) =>
          h('li.sessions__row',
            h('div.sessions__info',
              h('span.sessions__name', s.name),
              h('span.sessions__detail',
                `${s.players} player${s.players === 1 ? '' : 's'} waiting · ${s.count} questions`
                + ` · timer ${s.timerSeconds ? `${s.timerSeconds}s` : 'off'}`),
            ),
            h('button.btn.btn--primary', {
              type: 'button',
              onclick: () => {
                const name = myName.trim();
                if (!name) {
                  mount.querySelector('.player-input')?.focus();
                  return;
                }
                net.send({ type: 'join', code: s.code, name });
              },
            }, 'Join'),
          )))
        : h('p.hint', 'No games yet. Ask your host to press "Host for other devices".'));
  }

  function showBrowse() {
    sessionsBox = h('div.sessions-box');
    renderSessions();
    render(mount,
      h('section.screen.screen--join',
        h('header.hero',
          h('h1.hero__title', '📡 Join a game'),
          h('p.hero__sub', 'Games being hosted on this network show up here.'),
        ),
        h('section.panel',
          h('h2.panel__title', 'Your name'),
          h('input.player-input', {
            type: 'text',
            value: myName,
            maxLength: 14,
            placeholder: 'Type your name',
            'aria-label': 'Your name',
            oninput: (e) => {
              myName = e.target.value;
              localStorage.setItem(NAME_KEY, myName);
            },
          }),
        ),
        h('section.panel',
          h('h2.panel__title', 'Open games'),
          sessionsBox,
        ),
        h('div.actions',
          h('button.btn.btn--ghost', { type: 'button', onclick: exit }, 'Back')),
      ));
  }

  function showLobby(lobby) {
    render(mount,
      h('section.screen.screen--lobby',
        h('header.hero',
          h('h1.hero__title', `📡 ${lobby.name}`),
          h('p.hero__sub', `You're in! Waiting for ${lobby.hostName} to start the game.`),
        ),
        h('section.panel',
          h('h2.panel__title', `Who's here (${lobby.players.length})`),
          h('div.chips', lobby.players.map((name) =>
            h('span.chip', { class: name === myName.trim() ? 'chip--on' : '' }, name))),
        ),
        h('div.actions',
          h('button.btn.btn--ghost', { type: 'button', onclick: exit }, 'Leave')),
      ));
  }

  const waitingLine = () => (answeredCount
    ? `${answeredCount.count} of ${answeredCount.of} answered`
    : '');

  function updateWaiting() {
    const line = mount.querySelector('.live-waiting');
    if (line) line.textContent = waitingLine();
  }

  function showQuestion() {
    timer?.stop();
    timer = question.seconds ? countdown(question.seconds) : null;

    answers = renderAnswers(question.question, (choice) => {
      if (myChoice != null) return;
      myChoice = choice;
      net.send({ type: 'answer', choice });
      bindKeys(null);
      const wrap = mount.querySelector('.live-answers');
      wrap.classList.add('live-answers--locked');
      for (const button of wrap.querySelectorAll('button')) button.disabled = true;
      mount.querySelector('.live-status').textContent = '✓ Locked in — waiting for the others…';
    });

    render(mount,
      h('section.screen.screen--question',
        h('header.qbar',
          h('span.qbar__player', myName.trim()),
          h('span.qbar__progress', `${question.index + 1} of ${question.total}`),
          h('span.qbar__score', `${myScore} pts`),
        ),
        renderPrompt(question.question),
        timer?.node ?? h('p.hint', 'No timer — take your time.'),
        h('div.live-answers', answers.node),
        h('p.hint.live-status', answers.hint),
        h('p.hint.live-waiting', waitingLine()),
      ));

    bindKeys(answers.onKey);
    answers.focusFirst();
  }

  function showReveal(message) {
    timer?.stop();
    bindKeys(null);
    if (!answers) return;
    answers.showResult({ choice: myChoice, answer: message.answer });

    const mine = message.results.find((r) => r.name === myName.trim());
    if (mine) myScore = mine.score;
    const headline = mine?.correct
      ? (mine.points >= 125 ? 'Nailed it!' : 'Correct!')
      : myChoice == null ? "Time's up!" : 'Not quite';

    mount.querySelector('.screen')?.append(
      h('div.feedback',
        { class: mine?.correct ? 'feedback--good' : 'feedback--bad', role: 'status' },
        h('p.feedback__headline', headline),
        !mine?.correct
          && h('p.feedback__answer', 'The answer is ', withFlags(message.answer), '.'),
        h('p.feedback__why', withFlags(message.explanation)),
        message.note && h('p.feedback__note', message.note),
        message.locate && renderWorldLocator(message.locate),
        mine?.correct && h('p.feedback__points',
          `+${mine.points}${mine.streak >= 3 ? ` · ${mine.streak} in a row!` : ''}`),
        h('p.hint', message.last
          ? 'Waiting for the host to show the results…'
          : 'Waiting for the host to move on…'),
      ));
    mount.querySelector('.feedback')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  return { stop: cleanup };
}
