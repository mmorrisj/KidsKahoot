/**
 * Screen routing and the setup / results screens.
 *
 * The play screens live in src/modes/. Adding flash cards or a Jeopardy board
 * means writing another module there and pointing `startRound` at it — the
 * setup screen, the session, and the question generator do not change.
 */
import { h, render } from './ui/dom.js';
import { withFlags } from './ui/flag.js';
import { createRng, randomSeed } from './lib/rng.js';
import {
  CURRICULA,
  MAP_USES,
  TIERS,
  countAvailable,
  generateQuestions,
  hasMapQuestions,
  topicsIn,
} from './lib/generator.js';
import { createSession, missedQuestions, standings } from './lib/session.js';
import { runMultipleChoice } from './modes/multiple-choice.js';
import { runHostFlow, runJoinFlow } from './modes/live.js';

const app = document.getElementById('app');
const STORE_KEY = 'geography-quest.settings';
// Bump when the shape of a saved setting changes, so old saves are discarded
// rather than silently selecting topics that no longer exist — or, as with the
// "Name the State" topic, silently omitting ones that now do.
const SETTINGS_VERSION = 4;
const MAX_PLAYERS = 6;
const ROUND_LENGTHS = [10, 15, 20];
const TIMER_OPTIONS = [
  { value: null, label: 'Off' },
  { value: 30, label: '30s' },
  { value: 20, label: '20s' },
  { value: 10, label: '10s' },
];

const defaultSettings = () => ({
  version: SETTINGS_VERSION,
  players: ['Player 1'],
  // Virginia and US geography come first; the world is there when they want it.
  curricula: ['virginia'],
  topics: topicsIn('virginia').map((t) => t.id),
  tiers: [1, 2],
  mapUse: 'both',
  count: 10,
  timerSeconds: null,
});

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!saved || saved.version !== SETTINGS_VERSION) return defaultSettings();
    return { ...defaultSettings(), ...saved };
  } catch {
    return defaultSettings();
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing, or storage is full. Losing the settings is fine.
  }
}

let settings = loadSettings();

// --------------------------------------------------------------- setup screen

function toggle(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Turning a curriculum on selects all of its topics; turning it off drops them.
 * Anything else would leave topics selected that the topic list no longer shows.
 */
function toggleCurriculum(id) {
  const ids = topicsIn(id).map((t) => t.id);
  const on = !settings.curricula.includes(id);
  return {
    curricula: toggle(settings.curricula, id),
    topics: on
      ? [...settings.topics, ...ids.filter((t) => !settings.topics.includes(t))]
      : settings.topics.filter((t) => !ids.includes(t)),
  };
}

/** Blank name boxes fall back to "Player 1", "Player 2", and so on. */
function playerNames() {
  return settings.players.map((name, i) => name.trim() || `Player ${i + 1}`);
}

function showSetup() {
  const available = countAvailable({
    topics: settings.topics,
    tiers: settings.tiers,
    mapUse: settings.mapUse,
  });
  const mapPossible = hasMapQuestions(settings.topics);
  const ready = settings.topics.length > 0 && settings.tiers.length > 0;

  const update = (patch) => {
    settings = { ...settings, ...patch };
    saveSettings(settings);
    showSetup();
  };

  const chip = (label, selected, onclick, blurb) =>
    h('button.chip', {
      type: 'button',
      class: selected ? 'chip--on' : '',
      'aria-pressed': String(selected),
      onclick,
    }, h('span.chip__label', label), blurb && h('span.chip__blurb', blurb));

  render(app,
    h('section.screen.screen--setup',
      h('header.hero',
        h('h1.hero__title', '🌍 Geography Quest'),
        h('p.hero__sub', 'Pass the device around and see who knows the world best.'),
        h('div.hero__links',
          h('button.btn.btn--ghost', { type: 'button', onclick: showJoin },
            '📡 Join a game'),
          h('button.btn.btn--ghost', { type: 'button', onclick: showLeaderboard },
            '🏆 Leaderboard'),
        ),
      ),

      h('section.panel',
        h('h2.panel__title', 'Who is playing?'),
        h('div.players', settings.players.map((name, i) =>
          h('div.player-row',
            h('input.player-input', {
              type: 'text',
              value: name,
              maxLength: 14,
              placeholder: `Player ${i + 1}`,
              'aria-label': `Player ${i + 1} name`,
              // Deliberately not re-rendering on every keystroke. Re-rendering
              // here would tear down the button a kid is mid-tap on, and their
              // "Add player" or "Start" tap would be swallowed.
              oninput: (e) => {
                settings.players[i] = e.target.value;
                saveSettings(settings);
              },
            }),
            settings.players.length > 1 && h('button.btn.btn--icon', {
              type: 'button',
              'aria-label': `Remove player ${i + 1}`,
              onclick: () => update({ players: settings.players.filter((_, j) => j !== i) }),
            }, '✕'),
          ))),
        settings.players.length < MAX_PLAYERS && h('button.btn.btn--ghost', {
          type: 'button',
          onclick: () => update({
            players: [...settings.players, `Player ${settings.players.length + 1}`],
          }),
        }, '+ Add player'),
      ),

      h('section.panel',
        h('h2.panel__title', 'Which subject?'),
        h('div.chips', CURRICULA.map((c) =>
          chip(`${c.icon} ${c.label}`, settings.curricula.includes(c.id),
            () => update(toggleCurriculum(c.id)), c.blurb))),
      ),

      settings.curricula.length > 0 && h('section.panel',
        h('h2.panel__title', 'What should we ask about?'),
        CURRICULA.filter((c) => settings.curricula.includes(c.id)).map((c) =>
          h('div.topic-group',
            h('h3.topic-group__title', c.label),
            h('div.chips', topicsIn(c.id).map((t) =>
              chip(`${t.icon} ${t.label}`, settings.topics.includes(t.id),
                () => update({ topics: toggle(settings.topics, t.id) })))),
          )),
      ),

      mapPossible && h('section.panel',
        h('h2.panel__title', 'How do they answer?'),
        h('div.chips', MAP_USES.map((m) =>
          chip(m.label, settings.mapUse === m.id,
            () => update({ mapUse: m.id }), m.blurb))),
        h('p.hint', 'Map questions are answered by tapping Virginia itself.'),
      ),

      h('section.panel',
        h('h2.panel__title', 'How hard?'),
        h('div.chips', TIERS.map((t) =>
          chip(t.label, settings.tiers.includes(t.id),
            () => update({ tiers: toggle(settings.tiers, t.id) }), t.blurb))),
      ),

      h('section.panel.panel--split',
        h('div',
          h('h2.panel__title', 'Round length'),
          h('div.chips', ROUND_LENGTHS.map((n) =>
            chip(`${n}`, settings.count === n, () => update({ count: n })))),
        ),
        h('div',
          h('h2.panel__title', 'Timer'),
          h('div.chips', TIMER_OPTIONS.map((t) =>
            chip(t.label, settings.timerSeconds === t.value,
              () => update({ timerSeconds: t.value })))),
          h('p.hint', 'Timer off is friendlier for younger or slower readers.'),
        ),
      ),

      h('footer.setup-footer',
        h('p.availability',
          ready
            ? `${available} questions to draw from`
            : 'Pick at least one topic and one difficulty'),
        available > 0 && available < settings.count
          && h('p.availability.availability--warn',
            `Only ${available} available, so this round will be ${available} questions.`),
        h('button.btn.btn--primary.btn--xl', {
          type: 'button',
          disabled: !ready || available === 0,
          // Names are read at tap time, not render time, because typing does
          // not trigger a re-render.
          onclick: () => startRound(playerNames()),
        }, 'Start'),
        h('button.btn', {
          type: 'button',
          disabled: !ready || available === 0,
          onclick: hostGame,
        }, '📡 Host for other devices'),
      ),
    ),
  );
}

// ---------------------------------------------------------------- live play

/** Host the configured round for other devices to join. */
function hostGame() {
  const hostName = playerNames()[0];
  runHostFlow({
    mount: app,
    hostName,
    // "Player 1" means nobody typed a name, so don't call it their game.
    gameName: settings.players[0].trim() ? `${hostName}'s game` : 'Geography Quest',
    settings: {
      topics: settings.topics,
      tiers: settings.tiers,
      mapUse: settings.mapUse,
      count: settings.count,
      timerSeconds: settings.timerSeconds,
    },
    onExit: showSetup,
  });
}

function showJoin() {
  runJoinFlow({ mount: app, onExit: showSetup });
}

/** All-time standings across live games, served by the game server. */
async function showLeaderboard() {
  let players = null;
  try {
    const res = await fetch('/api/stats');
    if (res.ok) ({ players } = await res.json());
  } catch {
    // Fall through to the "needs the server" message.
  }

  render(app,
    h('section.screen.screen--leaderboard',
      h('header.hero', h('h1.hero__title', '🏆 Leaderboard')),
      players == null
        ? h('section.panel',
          h('p.hint', 'The leaderboard needs the game server — start the app with npm start.'))
        : players.length === 0
          ? h('section.panel',
            h('p.hint', 'Nobody on the board yet. Finish a hosted game and the players land here.'))
          : h('section.panel',
            h('ol.alltime', players.map((p) =>
              h('li.alltime__row',
                h('span.alltime__name', p.name),
                h('span.alltime__detail',
                  `${p.games} game${p.games === 1 ? '' : 's'} · ${p.wins} win${p.wins === 1 ? '' : 's'}`
                  + ` · ${p.correct} right`),
                h('span.alltime__points', `${p.totalPoints} pts`),
              )))),
      h('div.actions',
        h('button.btn.btn--primary', { type: 'button', onclick: showSetup }, 'Back')),
    ));
}

// --------------------------------------------------------------------- round

function startRound(players) {
  const questions = generateQuestions({
    rng: createRng(randomSeed()),
    topics: settings.topics,
    tiers: settings.tiers,
    mapUse: settings.mapUse,
    count: settings.count,
  });
  playSession(createSession({ questions, players, timerSeconds: settings.timerSeconds }));
}

function playSession(session) {
  runMultipleChoice({ mount: app, session, onFinish: showResults });
}

// ------------------------------------------------------------------- results

function showResults(session) {
  const ranked = standings(session);
  const missed = missedQuestions(session);
  const solo = ranked.length === 1;
  const medals = ['🥇', '🥈', '🥉'];

  render(app,
    h('section.screen.screen--results',
      h('h1.results__title', solo ? 'Round complete!' : `${ranked[0].name} wins!`),

      h('ol.scoreboard', ranked.map((p, i) =>
        h('li.scoreboard__row', { class: i === 0 && !solo ? 'scoreboard__row--top' : '' },
          h('span.scoreboard__rank', solo ? '🌍' : (medals[i] ?? `${i + 1}`)),
          h('span.scoreboard__name', p.name),
          h('span.scoreboard__detail',
            `${p.correct} right · ${p.wrong} wrong${p.bestStreak >= 3 ? ` · best streak ${p.bestStreak}` : ''}`),
          h('span.scoreboard__score', `${p.score}`),
        ))),

      missed.length > 0 && h('section.panel',
        h('h2.panel__title', `Worth another look (${missed.length})`),
        h('ul.review', missed.map((q) =>
          h('li.review__item',
            h('span.review__front', q.card.hint ? [withFlags(q.card.hint), ' '] : '', q.card.front),
            h('span.review__arrow', '→'),
            h('span.review__back', withFlags(q.card.back)),
          ))),
      ),

      h('div.actions',
        missed.length > 0 && h('button.btn.btn--primary', {
          type: 'button',
          onclick: () => playSession(createSession({
            questions: missed,
            players: session.players.map((p) => p.name),
            timerSeconds: session.timerSeconds,
          })),
        }, `Practice these ${missed.length}`),
        h('button.btn', {
          type: 'button',
          onclick: () => startRound(session.players.map((p) => p.name)),
        }, 'Play again'),
        h('button.btn.btn--ghost', { type: 'button', onclick: showSetup }, 'Change settings'),
      ),
    ),
  );
}

showSetup();
