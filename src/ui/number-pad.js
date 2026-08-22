/**
 * A keypad for typing a numeric answer.
 *
 * Math facts get this instead of four tiles. Four options let a kid reach 56
 * without recalling it — estimate, eliminate, done — which trains the opposite
 * of the thing fact practice is for. Typing the answer needs the fact.
 *
 * It returns the same shape as the tile grid and the map, so the round loop,
 * the timer, scoring, and the feedback panel are untouched.
 */
import { h } from './dom.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const MAX_DIGITS = 4; // nothing in the fact sets goes past four digits

export function renderNumberPad(question, onPick) {
  let typed = '';
  let done = false;

  const display = h('output.pad__display', { 'aria-live': 'polite' });
  const check = h('button.pad__key.pad__key--check', {
    type: 'button',
    'aria-label': 'Check my answer',
    onclick: submit,
  }, '✓');

  function paint() {
    display.textContent = typed || '—';
    display.classList.toggle('pad__display--empty', !typed);
    check.disabled = !typed || done;
  }

  function press(digit) {
    if (done || typed.length >= MAX_DIGITS) return;
    // A leading zero is never the answer to anything here, and letting one in
    // makes "05" look like a different answer from "5".
    if (!typed && digit === '0') return;
    typed += digit;
    paint();
  }

  function back() {
    if (done) return;
    typed = typed.slice(0, -1);
    paint();
  }

  function submit() {
    if (done || !typed) return;
    done = true;
    onPick(typed);
  }

  const key = (label, ariaLabel, onclick, cls = '') =>
    h(`button.pad__key${cls}`, { type: 'button', 'aria-label': ariaLabel, onclick }, label);

  const node = h('div.pad',
    display,
    h('div.pad__keys',
      KEYS.map((d) => key(d, d, () => press(d))),
      key('⌫', 'Delete the last digit', back, '.pad__key--back'),
      key('0', '0', () => press('0')),
      check,
    ),
  );

  paint();

  return {
    node,
    hint: 'Type your answer, then press ✓ — or use the number keys and Enter.',
    focusFirst() {},
    onKey(e) {
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); back(); }
      else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    },
    showResult({ choice, answer }) {
      done = true;
      check.disabled = true;
      for (const button of node.querySelectorAll('.pad__key')) button.disabled = true;
      display.textContent = choice ?? '—';
      display.classList.remove('pad__display--empty');
      display.classList.add(choice === answer ? 'pad__display--right' : 'pad__display--wrong');
    },
  };
}
