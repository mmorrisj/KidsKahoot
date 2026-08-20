/**
 * Multiple choice mode — the Kahoot-shaped one.
 *
 * Reads questions from a session and renders them; it knows nothing about where
 * the questions came from. Flash cards and the Jeopardy board will plug into
 * the same session the same way.
 *
 * A question is answered either by pressing one of four coloured tiles or by
 * tapping a shape on the Virginia map, depending on whether the generator gave
 * it a `map`. Everything around that — the timer, scoring, hand-off, feedback,
 * re-queueing — is identical either way, so the two share this module rather
 * than forking into two modes.
 */
import { h, render } from '../ui/dom.js';
import { regionLegend, renderMap } from '../ui/map.js';
import { renderUsHighlight, renderUsTapMap } from '../ui/us-map.js';
import { flagNode, withFlags } from '../ui/flag.js';
import { renderWorldLocator } from '../ui/world-locator.js';
import {
  advance,
  current,
  isFinished,
  submitAnswer,
  submitTimeout,
} from '../lib/session.js';

/**
 * Shape as well as colour, so the tiles are still distinguishable to a
 * colour-blind kid and can be called out loud ("the triangle one").
 */
const TILES = [
  { shape: '▲', label: 'triangle', cls: 'tile--a' },
  { shape: '◆', label: 'diamond', cls: 'tile--b' },
  { shape: '●', label: 'circle', cls: 'tile--c' },
  { shape: '■', label: 'square', cls: 'tile--d' },
];

/**
 * The four-tile answer grid.
 *
 * Both answer surfaces return the same shape — a node, a way to focus it, a way
 * to mark the result, and optionally a key handler — so the round loop below
 * does not care which one it is holding.
 */
function renderTiles(question, onPick) {
  const buttons = [];

  const node = h('div.tiles', question.choices.map((choice, i) => {
    const tile = TILES[i % TILES.length];
    const button = h(`button.tile.${tile.cls}`, {
      type: 'button',
      // The choice rides on a data attribute because flag choices render as
      // an <img>, which leaves nothing useful in textContent to compare.
      'data-choice': choice,
      onclick: () => onPick(choice),
      'aria-label': `${tile.label}: ${choice}`,
    },
      h('span.tile__shape', { 'aria-hidden': 'true' }, tile.shape),
      h('span.tile__text', { class: question.choiceStyle === 'emoji' ? 'tile__text--emoji' : '' },
        question.choiceStyle === 'emoji' ? flagNode(choice, 'tile') : choice),
    );
    buttons.push(button);
    return button;
  }));

  return {
    node,
    hint: 'Tip: press 1, 2, 3 or 4 to answer',
    focusFirst() {},
    onKey(e) {
      const n = Number(e.key);
      if (n >= 1 && n <= buttons.length) {
        e.preventDefault();
        buttons[n - 1].click();
      }
    },
    showResult({ choice, answer }) {
      for (const button of buttons) {
        const text = button.dataset.choice;
        button.disabled = true;
        if (text === answer) button.classList.add('tile--correct');
        else if (text === choice) button.classList.add('tile--wrong');
        else button.classList.add('tile--muted');
      }
    },
  };
}

/** Exported for live mode, which renders the same questions on remote devices. */
export function renderAnswers(question, onPick) {
  if (!question.map) return renderTiles(question, onPick);
  const map = question.map.layer === 'us-states'
    ? renderUsTapMap(question, onPick)
    : renderMap(question, onPick);
  return {
    node: h('div.map-wrap', map.node),
    hint: 'Tap the map. Use Tab and Enter if you would rather use the keyboard.',
    focusFirst: map.focusFirst,
    onKey: null,
    showResult: map.showResult,
  };
}

/** The white question card: media (flag or highlighted US map) plus the prompt. */
export function renderPrompt(question) {
  return h('div.prompt',
    question.media && h('div.prompt__media',
      {
        class: question.media.kind === 'flag-large' ? 'prompt__media--large'
          : question.media.kind === 'us-map' ? 'prompt__media--map' : '',
      },
      question.media.kind === 'us-map'
        ? renderUsHighlight(question.media.value)
        : flagNode(question.media.value,
          question.media.kind === 'flag-large' ? 'large' : 'media')),
    h('h2.prompt__text', question.prompt),
  );
}

export function runMultipleChoice({ mount, session, onFinish }) {
  let stopTimer = null;
  let keyHandler = null;

  function teardown() {
    stopTimer?.();
    stopTimer = null;
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }

  function bindKeys(handler) {
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = handler;
    if (handler) document.addEventListener('keydown', handler);
  }

  function step() {
    teardown();
    if (isFinished(session)) {
      onFinish(session);
      return;
    }
    const turn = current(session);
    // With more than one player the device gets passed around, so the next kid
    // must not see the question over the previous kid's shoulder.
    if (session.players.length > 1) showHandoff(turn);
    else showQuestion(turn);
  }

  function showHandoff(turn) {
    const go = h('button.btn.btn--primary.btn--xl', { onclick: () => showQuestion(turn) },
      "I'm ready");
    render(mount,
      h('section.screen.screen--handoff',
        h('p.handoff__pass', 'Pass the device to'),
        h('h2.handoff__name', turn.player.name),
        h('p.handoff__score', `${turn.player.score} points so far`),
        go,
      ),
    );
    bindKeys((e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go.click(); }
    });
    go.focus();
  }

  function showQuestion(turn) {
    const { question, player, attempt, position, total } = turn;

    const timerFill = h('div.timer__fill');
    const timerLabel = h('span.timer__label');

    let answered = false;
    const answers = renderAnswers(question, (choice) => {
      if (answered) return;
      answered = true;
      const secondsLeft = stopTimer ? stopTimer() : null;
      showFeedback(submitAnswer(session, { choice, secondsLeft }), answers, question);
    });

    render(mount,
      h('section.screen.screen--question',
        h('header.qbar',
          h('span.qbar__player', player.name),
          h('span.qbar__progress', `${position} of ${total}`),
          h('span.qbar__score', `${player.score} pts`),
        ),
        attempt > 1 && h('p.retry-flag', '↻ Seen this one before — worth half points'),
        renderPrompt(question),
        session.timerSeconds
          ? h('div.timer', h('div.timer__track', timerFill), timerLabel)
          : h('p.hint', 'No timer — take your time.'),
        answers.node,
        h('p.hint.hint--keys', answers.hint),
      ),
    );

    if (session.timerSeconds) startTimer(timerFill, timerLabel);
    bindKeys(answers.onKey);
    answers.focusFirst();

    function onExpire() {
      if (answered) return;
      answered = true;
      showFeedback(submitTimeout(session), answers, question);
    }

    function startTimer(fill, label) {
      const totalMs = session.timerSeconds * 1000;
      const deadline = performance.now() + totalMs;
      fill.style.width = '100%';
      const tick = () => {
        const remaining = Math.max(0, deadline - performance.now());
        fill.style.width = `${(remaining / totalMs) * 100}%`;
        label.textContent = `${Math.ceil(remaining / 1000)}s`;
        fill.classList.toggle('timer__fill--low', remaining < totalMs * 0.25);
        if (remaining <= 0) { stopTimer?.(); onExpire(); }
      };
      const id = setInterval(tick, 100);
      tick();
      stopTimer = () => {
        clearInterval(id);
        stopTimer = null;
        return Math.max(0, (deadline - performance.now()) / 1000);
      };
    }
  }

  function showFeedback(result, answers, question) {
    bindKeys(null);
    answers.showResult({ choice: result.choice, answer: question.answer });

    const next = h('button.btn.btn--primary', { onclick: () => { advance(session); step(); } },
      session.index + 1 >= session.queue.length ? 'See results' : 'Next question');

    const headline = result.correct
      ? (result.points >= 125 ? 'Nailed it!' : 'Correct!')
      : result.choice == null ? "Time's up!" : 'Not quite';

    mount.querySelector('.screen').append(
      h('div.feedback',
        { class: result.correct ? 'feedback--good' : 'feedback--bad', role: 'status' },
        h('p.feedback__headline', headline),
        !result.correct
          && h('p.feedback__answer', 'The answer is ', ...withFlags(question.answer), '.'),
        h('p.feedback__why', ...withFlags(result.explanation)),
        result.note && h('p.feedback__note', result.note),
        // Naming the regions is safe now that the answer is in, and it is the
        // moment a kid is most likely to actually read them.
        question.map?.layer === 'regions' && regionLegend(),
        // Same idea for the world: the answer is in, so show where the place
        // actually is rather than leaving it as a word they just matched.
        question.locate && renderWorldLocator(question.locate),
        result.correct && h('p.feedback__points',
          `+${result.points}${result.streak >= 3 ? ` · ${result.streak} in a row!` : ''}`),
        !result.correct && !result.isRetry
          && h('p.feedback__requeue', "We'll come back to this one."),
        next,
      ),
    );

    bindKeys((e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next.click(); }
    });
    // On a phone the feedback lands below the answers, off screen.
    next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    next.focus({ preventScroll: true });
  }

  step();
  return { stop: teardown };
}
