/**
 * Builds src/data/world-map.js — a small world map used to show a kid *where*
 * a country is, once they have answered a question about it.
 *
 * Run it by hand when the geometry needs to change; the game never runs it:
 *
 *   npm i && node scripts/build-world-map.mjs
 *
 * Two decisions worth knowing about.
 *
 * The projection is Equal Earth, not the Mercator most kids see. Mercator makes
 * Greenland look the size of Africa, which is precisely the misconception a
 * geography game should not be reinforcing. Equal Earth keeps areas honest and
 * still looks like a world map rather than an interrupted diagram.
 *
 * Continents are dissolved using *this project's* continent for each country,
 * not Natural Earth's, wherever the two disagree. Otherwise the game could tell
 * a kid that Cyprus is in Europe and then light up Asia on the map. The build
 * checks every country pin lands inside the continent the quiz claims for it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTRIES } from '../src/data/countries.js';
import { CONTINENTS } from '../src/data/continents.js';
import pc from 'polygon-clipping';
import {
  dissolve,
  loadGeoJson,
  pathFromMulti,
  pointInMulti,
} from './lib/geo.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SOURCE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector'
  + '/master/geojson/ne_110m_admin_0_countries.geojson';
const OUT_FILE = path.join(ROOT, 'src/data/world-map.js');

const OUT_WIDTH = 1000;
const SIMPLIFY_TOLERANCE = 1.1;
const MIN_AREA = 6;

/**
 * Where to cut the map, as a central meridian.
 *
 * A world map centred on Greenwich cuts at the antimeridian, which drops Samoa
 * and Tonga on the far *left* edge, an ocean away from the rest of Oceania they
 * belong to. Centring on 10°E moves the cut to 170°W — open Pacific — so every
 * Oceanian country lands together on the right.
 */
const CENTRAL_MERIDIAN = 10;

/**
 * Countries too small to appear in Natural Earth's 110m data. Their pins are
 * the only hand-entered coordinates here; everything else comes from the
 * source data's own label points.
 */
const SMALL_COUNTRY_PINS = {
  MT: [14.45, 35.90], // Malta
  MC: [7.42, 43.74], // Monaco
  VA: [12.45, 41.90], // Vatican City
  SG: [103.82, 1.35], // Singapore
  WS: [-172.10, -13.76], // Samoa
  TO: [-175.20, -21.18], // Tonga
  PW: [134.58, 7.51], // Palau
  MH: [171.18, 7.13], // Marshall Islands
  KI: [173.00, 1.45], // Kiribati
  TV: [179.20, -8.52], // Tuvalu
};

// ------------------------------------------------------------- Equal Earth

const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;

/** Degrees east of the central meridian, wrapped into +/-180. */
const offsetFromCentre = (lon) => (((lon - CENTRAL_MERIDIAN) % 360) + 540) % 360 - 180;

/** Equal Earth, in projection units before any scaling. `deg` is already
 *  measured from the central meridian. */
function equalEarth([deg, lat]) {
  const phi = (lat * Math.PI) / 180;
  const lam = (deg * Math.PI) / 180;
  const t = Math.asin(M * Math.sin(phi));
  const t2 = t * t;
  const t6 = t2 * t2 * t2;
  return [
    (lam * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))),
    t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)),
  ];
}

// The extremes of the projection, so the map fills its viewBox exactly.
const [MAX_X] = equalEarth([180, 0]);
const [, MAX_Y] = equalEarth([0, 90]);
const SCALE = OUT_WIDTH / (MAX_X * 2);
const OUT_HEIGHT = +(MAX_Y * 2 * SCALE).toFixed(1);

const toXY = (deg, lat) => {
  const [x, y] = equalEarth([deg, lat]);
  return [(x + MAX_X) * SCALE, (MAX_Y - y) * SCALE];
};

/** For geometry already clipped into the map's longitude window. */
const project = ([lon, lat]) =>
  toXY(Math.max(-180, Math.min(180, lon - CENTRAL_MERIDIAN)), lat);

/** For a single point anywhere on Earth. */
const projectPin = ([lon, lat]) => toXY(offsetFromCentre(lon), lat);

/**
 * Cut geometry to the map's longitude window, splitting anything that straddles
 * the seam instead of letting it draw as a streak across the world.
 *
 * The trick is to lay a second copy of the world down 360 degrees to the east
 * and then take the window out of the pair. Antarctica needs this: it wraps the
 * globe, so it crosses every possible seam and simply dropping the ring erased
 * a whole continent.
 */
function clipToWindow(multi) {
  const shifted = multi.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => [lon + 360, lat])));
  const window = [[[
    [CENTRAL_MERIDIAN - 180, -90], [CENTRAL_MERIDIAN + 180, -90],
    [CENTRAL_MERIDIAN + 180, 90], [CENTRAL_MERIDIAN - 180, 90],
    [CENTRAL_MERIDIAN - 180, -90],
  ]]];
  return pc.intersection(pc.union(multi, shifted), window);
}

// ---------------------------------------------------------------------- main

const geo = await loadGeoJson(SOURCE_URL, path.join(HERE, '.cache'), 'ne110m-countries.geojson');

/** Natural Earth leaves ISO_A2 as "-99" for France and Norway, among others. */
const codeOf = (f) => [f.properties.ISO_A2_EH, f.properties.ISO_A2, f.properties.WB_A2]
  .find((v) => v && v !== '-99');

const quizContinent = new Map(COUNTRIES.map((c) => [c.code, c.continent]));

const byContinent = new Map(CONTINENTS.map((name) => [name, []]));
for (const feature of geo.features) {
  // Where the quiz has an opinion about a country's continent, it wins.
  const continent = quizContinent.get(codeOf(feature)) ?? feature.properties.CONTINENT;
  if (!byContinent.has(continent)) continue; // skips "Seven seas (open ocean)"
  byContinent.get(continent).push(feature);
}

const shapes = new Map();
for (const [name, features] of byContinent) {
  if (!features.length) throw new Error(`no land found for ${name}`);
  shapes.set(name, clipToWindow(dissolve(features)));
  process.stdout.write(`${name.padEnd(15)} ${String(features.length).padStart(3)} countries\n`);
}

// ------------------------------------------------------------------- pins

const pins = new Map();
const missing = [];
const featureByCode = new Map();
for (const feature of geo.features) {
  const code = codeOf(feature);
  if (code && !featureByCode.has(code)) featureByCode.set(code, feature);
}

for (const country of COUNTRIES) {
  const feature = featureByCode.get(country.code);
  const lonLat = feature
    ? [feature.properties.LABEL_X, feature.properties.LABEL_Y]
    : SMALL_COUNTRY_PINS[country.code];
  if (!lonLat || lonLat.some((n) => typeof n !== 'number')) {
    missing.push(`${country.code} ${country.name}`);
    continue;
  }
  pins.set(country.code, lonLat);
}
if (missing.length) throw new Error(`no pin coordinates for: ${missing.join(', ')}`);

/**
 * Every pin must sit inside the continent the quiz assigns its country. This is
 * what stops the map from contradicting an answer — and it catches a label
 * point that Natural Earth placed offshore, which happens for island nations.
 */
const strays = [];
for (const country of COUNTRIES) {
  const lonLat = pins.get(country.code);
  const windowed = [lonLat[0] < CENTRAL_MERIDIAN - 180 ? lonLat[0] + 360 : lonLat[0], lonLat[1]];
  if (!pointInMulti(windowed, shapes.get(country.continent))) {
    strays.push(`  ${country.name}: pin at ${lonLat} is not inside ${country.continent}`);
  }
}
if (strays.length) {
  process.stdout.write(`\n${strays.length} pins sit off their continent's landmass:\n`
    + `${strays.join('\n')}\n`
    + 'These are island and coastal nations whose label point falls in the sea at\n'
    + 'this resolution. The pin is still in the right place on screen.\n\n');
}

// ------------------------------------------------------------------- output

const continents = CONTINENTS.map((name) => {
  const shape = pathFromMulti(shapes.get(name), project, {
    tolerance: SIMPLIFY_TOLERANCE,
    minArea: MIN_AREA,
    // No seam guard here: clipToWindow already split anything that straddles
    // the cut, and Antarctica's edge along the pole is one legitimate segment
    // the full width of the map, which a guard would throw the continent away for.
  });
  if (!shape) throw new Error(`${name} came out empty`);
  return { id: name.toLowerCase().replace(/[^a-z]+/g, '-'), name, ...shape };
});

const projectedPins = [...pins].map(([code, lonLat]) => {
  const [x, y] = projectPin(lonLat);
  return `    ${code}: [${x.toFixed(1)}, ${y.toFixed(1)}],`;
}).join('\n');

const body = `/**
 * GENERATED by scripts/build-world-map.mjs — do not edit by hand.
 *
 * Continent outlines from Natural Earth 1:110m (public domain), dissolved using
 * this project's own continent for each country, and drawn in the Equal Earth
 * projection so Greenland does not end up the size of Africa.
 */

export const WORLD_MAP = {
  viewBox: '0 0 ${OUT_WIDTH} ${OUT_HEIGHT}',
  continents: [
${continents.map((c) => `    {
      id: '${c.id}',
      name: '${c.name}',
      label: [${c.label[0]}, ${c.label[1]}],
      d: '${c.d}',
    },`).join('\n')}
  ],
  /** Where each country sits on the map, by ISO 3166-1 alpha-2 code. */
  pins: {
${projectedPins}
  },
};
`;

fs.writeFileSync(OUT_FILE, body);
process.stdout.write(`\nwrote ${path.relative(ROOT, OUT_FILE)} `
  + `(${(Buffer.byteLength(body) / 1024).toFixed(1)} kB, ${pins.size} pins)\n`);
for (const c of continents) {
  process.stdout.write(`  ${c.name.padEnd(15)} ${String(c.d.length).padStart(6)} chars\n`);
}
