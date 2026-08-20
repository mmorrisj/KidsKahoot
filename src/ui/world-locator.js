/**
 * The little world map that appears in the feedback panel after a world
 * question is answered, showing *where* the country actually is.
 *
 * This is a teaching aid, not an input. It only ever renders after the answer
 * is in, so it can label things freely — the whole point is to attach a place
 * to a name a kid has just been quizzed on.
 */
import { WORLD_MAP } from '../data/world-map.js';
import { h } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    node.setAttribute(key, String(value));
  }
  return node;
}

/**
 * @param {{code: string, name: string, continent: string, flag?: string}} place
 */
export function renderWorldLocator(place) {
  const pin = WORLD_MAP.pins[place.code];
  if (!pin) return null; // a country with no pin simply gets no map

  const map = svg('svg', {
    viewBox: WORLD_MAP.viewBox,
    class: 'locator__map',
    role: 'img',
    'aria-label': `World map showing ${place.name} in ${place.continent}`,
  });

  for (const continent of WORLD_MAP.continents) {
    const isHome = continent.name === place.continent;
    map.append(svg('path', {
      d: continent.d,
      class: `locator__land${isHome ? ' locator__land--home' : ''}`,
    }));
  }

  // Name the continent on the map itself, so the shape and the word land
  // together rather than a kid having to match them up from a caption.
  const home = WORLD_MAP.continents.find((c) => c.name === place.continent);
  if (home) {
    const [x, y] = home.label;
    const text = svg('text', { x, y, class: 'locator__continent' });
    text.append(place.continent);
    map.append(text);
  }

  const [px, py] = pin;
  map.append(svg('circle', { cx: px, cy: py, r: 26, class: 'locator__halo' }));
  map.append(svg('circle', { cx: px, cy: py, r: 9, class: 'locator__pin' }));

  return h('figure.locator',
    map,
    h('figcaption.locator__caption',
      place.flag ? `${place.flag} ` : '',
      h('strong', place.name),
      ` is in ${place.continent}`),
  );
}
