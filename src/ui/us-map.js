/**
 * Renders the US map as question media: the whole country dim, one state lit.
 *
 * Unlike the Virginia map, this one is scenery, not an answer surface — the
 * question is answered on the four tiles below it. So nothing here is tappable
 * and nothing is labelled: naming any state on the map would hand over the
 * answer or a process of elimination.
 */
import { US_MAP } from '../data/us-map.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

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
  const root = svg('svg', {
    viewBox: US_MAP.viewBox,
    class: 'usmap',
    role: 'img',
    'aria-label': 'A map of the United States with one state highlighted',
  });

  for (const frame of US_MAP.insetFrames) {
    root.append(svg('rect', {
      x: frame.x, y: frame.y, width: frame.width, height: frame.height,
      rx: 6,
      class: 'usmap__frame',
    }));
  }

  let lit = null;
  for (const state of US_MAP.states) {
    const path = svg('path', { d: state.d, class: 'usmap__state' });
    if (state.name === stateName) lit = { state, path };
    else root.append(path);
  }

  if (!lit) throw new Error(`no state named "${stateName}" on the US map`);

  // The lit state goes on top, so its brighter stroke is not overpainted by
  // the neighbours drawn after it.
  lit.path.classList.add('usmap__state--lit');
  root.append(lit.path);

  if (lit.state.area < RING_AREA) {
    const [cx, cy] = lit.state.label;
    root.append(svg('circle', { cx, cy, r: RING_RADIUS, class: 'usmap__ring' }));
  }

  return root;
}
