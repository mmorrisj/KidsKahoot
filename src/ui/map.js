/**
 * Renders the Virginia map as an answer surface.
 *
 * The map is not a picture next to the question — it *is* the answer input. A
 * question names a layer ('regions', 'neighbours', or 'pins') and the shapes in
 * that layer become the buttons.
 *
 * Nothing is labelled while the question is live. Labelling the regions would
 * turn "find the Valley and Ridge" into reading, which is the skill the map is
 * there to avoid testing. Labels appear with the feedback instead.
 */
import { VA_MAP, projectToMap } from '../data/virginia-map.js';
import { h } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// In viewBox units, where the map is 1000 wide. A pin has to stay tappable on a
// phone, where the whole map is about 360px across — so roughly a third of
// these numbers in real pixels.
const PIN_RADIUS = 19;
const PIN_HIT_RADIUS = 34;

/**
 * Extra width given to a shape's invisible tap layer. The Blue Ridge is a few
 * miles wide in northern Virginia, which is about four pixels on a phone — with
 * only its fill to press, it would be the one region a kid could never tap.
 */
const HIT_STROKE = 22;

export function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    node.setAttribute(key, value === true ? '' : String(value));
  }
  return node;
}

/** Wire up press and keyboard handling on a shape or pin. */
export function makeTappable(node, { label, onPick }) {
  node.setAttribute('role', 'button');
  node.setAttribute('tabindex', '0');
  node.setAttribute('aria-label', label);
  node.classList.add('map__target');
  node.addEventListener('click', () => onPick(label));
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick(label);
    }
  });
  return node;
}

/**
 * Invisible fat-stroked copies of the shapes, stacked smallest last so the
 * smallest target wins any pixel two shapes both claim. Without this, tapping
 * near the Blue Ridge would land on the Piedmont or the Valley and Ridge, which
 * are hundreds of times larger and impossible to miss on their own. The US map
 * leans on the same trick for Rhode Island against its neighbours.
 */
export function hitLayer(shapes, onPick, stroke = HIT_STROKE) {
  const group = svg('g', { class: 'map__hits' });
  for (const shape of [...shapes].sort((a, b) => b.area - a.area)) {
    const path = svg('path', { d: shape.d, class: 'map__hit', 'stroke-width': stroke });
    group.append(makeTappable(path, { label: shape.label, onPick }));
  }
  return group;
}

/**
 * Build the map for one question.
 *
 * Returns the element plus the two things the mode needs to drive it:
 * `focusFirst` for keyboard players, and `showResult` to mark the answer.
 */
export function renderMap(question, onPick) {
  const { layer, pins = [], reveal = null } = question.map;
  const root = svg('svg', {
    // Only a "tap the neighbouring state" question needs them in shot.
    viewBox: layer === 'neighbours' ? VA_MAP.viewBox : VA_MAP.focusBox,
    class: 'map',
    role: 'group',
    'aria-label': 'Map of Virginia',
  });

  const paints = new Map(); // label -> the coloured shape, for the feedback
  const overlay = svg('g', { class: 'map__overlay' });

  // Neighbouring states sit underneath, dim, unless they are the answer layer.
  for (const neighbour of VA_MAP.neighbours) {
    const live = layer === 'neighbours' && question.choices.includes(neighbour.name);
    const path = svg('path', {
      d: neighbour.d,
      class: `map__neighbour${live ? ' map__neighbour--live' : ''}`,
    });
    if (live) paints.set(neighbour.name, path);
    root.append(path);
  }

  for (const region of VA_MAP.regions) {
    const path = svg('path', {
      d: region.d,
      // Regions stay colour-coded even when they are only scenery, so the map
      // reads the same from question to question.
      class: `map__region map__region--${region.id}${layer === 'neighbours' ? ' map__region--muted' : ''}`,
    });
    if (layer === 'regions') paints.set(region.short, path);
    root.append(path);
  }

  root.append(svg('path', { d: VA_MAP.outline, class: 'map__outline' }));

  const targets = new Map(); // label -> the pressable element
  if (layer === 'regions' || layer === 'neighbours') {
    const shapes = layer === 'regions'
      ? VA_MAP.regions.map((r) => ({ ...r, label: r.short }))
      : VA_MAP.neighbours
        .filter((n) => question.choices.includes(n.name))
        .map((n) => ({ ...n, label: n.name }));
    const hits = hitLayer(shapes, onPick);
    root.append(hits);
    for (const hit of hits.children) targets.set(hit.getAttribute('aria-label'), hit);
  }

  if (layer === 'neighbours') {
    // Name Virginia itself, so the kid has something to orient from.
    const [x, y] = VA_MAP.regions.find((r) => r.id === 'piedmont').label;
    const here = svg('text', { x, y, class: 'map__here' });
    here.append('Virginia');
    root.append(here);
  }

  for (const pin of pins) {
    const [x, y] = projectToMap(pin.coords);
    const group = svg('g', { class: 'map__pin' });
    group.append(svg('circle', { cx: x, cy: y, r: PIN_HIT_RADIUS, class: 'map__pin-hit' }));
    group.append(svg('circle', { cx: x, cy: y, r: PIN_RADIUS, class: 'map__pin-dot' }));
    targets.set(pin.name, makeTappable(group, { label: pin.name, onPick }));
    root.append(group);
  }

  root.append(overlay);

  /** Drop a labelled marker on the map, used to show where a place actually is. */
  function markSpot(coords, text, { dot = true } = {}) {
    const [x, y] = projectToMap(coords);
    if (dot) overlay.append(svg('circle', { cx: x, cy: y, r: 12, class: 'map__reveal-dot' }));
    const label = svg('text', { x, y: y - 30, class: 'map__reveal-label' });
    label.append(text);
    overlay.append(label);
  }

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
        // Mark the coloured shape rather than the invisible hit path, so the
        // outline traces the region a kid can actually see. Pins have no
        // separate paint layer, so the marking lands on the pin itself.
        (paints.get(label) ?? element).classList.add(`map__paint--${state}`);
      }

      // Name the answer now that naming it cannot give it away — unless a
      // place pin is about to be dropped in the same spot, since a region's
      // label anchor and the pin inside it land on top of each other.
      const named = reveal ? null
        : VA_MAP.regions.find((r) => r.short === answer)
          ?? VA_MAP.neighbours.find((n) => n.name === answer);
      if (named) {
        const [x, y] = named.label;
        const label = svg('text', { x, y, class: 'map__answer-label' });
        label.append(answer);
        overlay.append(label);
      }

      // A correct pin is already ringed in green, so it only needs its name.
      const answeredPin = pins.find((p) => p.name === answer);
      if (answeredPin) markSpot(answeredPin.coords, answer, { dot: false });
      if (reveal) markSpot(reveal.coords, reveal.label);
    },
  };
}

/** A legend for the five regions, shown with the feedback rather than before. */
export function regionLegend() {
  return h('ul.legend', VA_MAP.regions.map((region) =>
    h('li.legend__item',
      h('span.legend__swatch', { class: `legend__swatch--${region.id}` }),
      region.short)));
}
