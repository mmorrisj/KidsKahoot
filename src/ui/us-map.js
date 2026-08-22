/**
 * The US map, worn two ways:
 *
 * - `renderUsHighlight` — question media: the whole country dim, one state lit,
 *   answered on the tiles below. Nothing is tappable and nothing is labelled,
 *   since naming any state would hand over the answer.
 * - `renderUsTapMap` — an answer surface, the way src/ui/map.js does Virginia:
 *   every state is a button, and "Find Texas and tap it" is answered on the
 *   country itself.
 */
import { US_MAP } from '../data/us-map.js';
import { hitLayer } from './map.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Width of the invisible tap layer around each state, in viewBox units (the
 * map is 1000 wide). Narrower than Virginia's 22: the Northeast packs nine
 * states into a corner, and fat hit areas there would steal each other's
 * pixels faster than they help. Small states still win contested taps because
 * the hit layer stacks smallest last.
 */
const US_HIT_STROKE = 12;

/**
 * States smaller than this (in map units) vanish when highlighted — Rhode
 * Island is a dozen pixels on a phone — so they get a ring drawn around them.
 */
const RING_AREA = 700;
const RING_RADIUS = 36;

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

/** The full US map with `stateName` highlighted. Purely decorative to a screen reader. */
export function renderUsHighlight(stateName) {
  const { root, paints } = drawStates();
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'A map of the United States with one state highlighted');

  const lit = paints.get(stateName);
  if (!lit) throw new Error(`no state named "${stateName}" on the US map`);

  // Re-appending moves the lit state on top, so its brighter stroke is not
  // overpainted by the neighbours drawn after it.
  lit.classList.add('usmap__state--lit');
  root.append(lit);

  const state = US_MAP.states.find((s) => s.name === stateName);
  if (state.area < RING_AREA) {
    const [cx, cy] = state.label;
    root.append(svg('circle', { cx, cy, r: RING_RADIUS, class: 'usmap__ring' }));
  }

  return root;
}

/** The base drawing shared by both uses: inset frames, then every state. */
function drawStates() {
  const root = svg('svg', { viewBox: US_MAP.viewBox, class: 'usmap' });
  for (const frame of US_MAP.insetFrames) {
    root.append(svg('rect', {
      x: frame.x, y: frame.y, width: frame.width, height: frame.height,
      rx: 6,
      class: 'usmap__frame',
    }));
  }
  const paints = new Map(); // state name -> its visible shape, for result marking
  for (const state of US_MAP.states) {
    const path = svg('path', { d: state.d, class: 'usmap__state' });
    paints.set(state.name, path);
    root.append(path);
  }
  return { root, paints };
}

/**
 * The US map as an answer surface. Same contract as renderMap in map.js:
 * the node, `focusFirst` for keyboard players, `showResult` to mark the answer.
 */
export function renderUsTapMap(question, onPick) {
  const { root, paints } = drawStates();
  root.classList.add('usmap--tap');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Map of the United States');

  const hits = hitLayer(
    US_MAP.states.map((state) => ({ ...state, label: state.name })),
    onPick,
    US_HIT_STROKE,
  );
  root.append(hits);
  const targets = new Map(); // state name -> the pressable element
  for (const hit of hits.children) targets.set(hit.getAttribute('aria-label'), hit);

  const overlay = svg('g', { class: 'usmap__overlay' });
  root.append(overlay);

  return {
    node: root,

    focusFirst() {
      targets.values().next().value?.focus?.({ preventScroll: true });
    },

    showResult({ choice, answer }) {
      for (const [label, element] of targets) {
        element.setAttribute('tabindex', '-1');
        element.classList.add('map__target--done');
        const state = label === answer ? 'correct' : label === choice ? 'wrong' : 'faded';
        element.classList.add(`map__target--${state}`);
        paints.get(label).classList.add(`map__paint--${state}`);
      }

      // Name the answer now that naming it cannot give it away — and circle
      // it too when it is a state small enough to hide behind its own label.
      const named = US_MAP.states.find((s) => s.name === answer);
      const [x, y] = named.label;
      if (named.area < RING_AREA) {
        overlay.append(svg('circle', { cx: x, cy: y, r: RING_RADIUS, class: 'usmap__ring' }));
      }
      const label = svg('text', { x, y: named.area < RING_AREA ? y - RING_RADIUS - 12 : y, class: 'map__answer-label' });
      label.append(answer);
      overlay.append(label);
    },
  };
}
