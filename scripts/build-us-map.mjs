/**
 * Builds src/data/us-map.js — all fifty state shapes, as SVG paths.
 *
 * Run it by hand when the geometry needs to change; the game itself never runs
 * this and has no dependency on it:
 *
 *   npm i && node scripts/build-us-map.mjs
 *
 * The states are dissolved from the same US Census county polygons the Virginia
 * map is built from (public domain), so the two maps share a cache and always
 * agree about borders. The lower 48 are drawn with an Albers equal-area conic
 * projection — the curved-top map kids see in class — because this map exists
 * for shape recognition, and equirectangular stretches Montana and squashes
 * Texas enough to matter.
 *
 * Alaska and Hawaii are drawn in framed inset boxes below the lower 48, not to
 * scale, which is also how classroom maps handle them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// polygon-clipping is CommonJS, so it arrives as a default export.
import pc from 'polygon-clipping';
import { US_STATES } from '../src/data/us-states.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CACHE = path.join(HERE, '.cache');
const SOURCE_URL =
  'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json';
const SOURCE_FILE = path.join(CACHE, 'us-counties.json');
const OUT_FILE = path.join(ROOT, 'src/data/us-map.js');

const OUT_WIDTH = 1000;
const SIMPLIFY_TOLERANCE = 1.1; // in output units; states are smaller than the VA regions were
const MIN_AREA = 8; // drop slivers and micro-islands smaller than this many square output units

/** FIPS code -> state name, for the fifty states. DC and the territories are skipped. */
const STATE_FIPS = {
  '01': 'Alabama', '02': 'Alaska', '04': 'Arizona', '05': 'Arkansas',
  '06': 'California', '08': 'Colorado', '09': 'Connecticut', 10: 'Delaware',
  12: 'Florida', 13: 'Georgia', 15: 'Hawaii', 16: 'Idaho',
  17: 'Illinois', 18: 'Indiana', 19: 'Iowa', 20: 'Kansas',
  21: 'Kentucky', 22: 'Louisiana', 23: 'Maine', 24: 'Maryland',
  25: 'Massachusetts', 26: 'Michigan', 27: 'Minnesota', 28: 'Mississippi',
  29: 'Missouri', 30: 'Montana', 31: 'Nebraska', 32: 'Nevada',
  33: 'New Hampshire', 34: 'New Jersey', 35: 'New Mexico', 36: 'New York',
  37: 'North Carolina', 38: 'North Dakota', 39: 'Ohio', 40: 'Oklahoma',
  41: 'Oregon', 42: 'Pennsylvania', 44: 'Rhode Island', 45: 'South Carolina',
  46: 'South Dakota', 47: 'Tennessee', 48: 'Texas', 49: 'Utah',
  50: 'Vermont', 51: 'Virginia', 53: 'Washington', 54: 'West Virginia',
  55: 'Wisconsin', 56: 'Wyoming',
};

/**
 * Honolulu County officially stretches 1,300 miles up the uninhabited
 * Northwestern Hawaiian Islands, which would leave the inset mostly ocean.
 * Clip Hawaii to the eight main islands, which is what every map does.
 */
const HAWAII_FRAME = [[[
  [-161.0, 18.5], [-154.5, 18.5], [-154.5, 22.8], [-161.0, 22.8], [-161.0, 18.5],
]]];

// Inset layout, in output units. The band sits below the lower 48 so nothing
// can collide, and each inset gets a frame drawn around it like a classroom map.
const INSET_PAD = 10; // gap between the lower 48 and the inset band, and between frames
const ALASKA_WIDTH = 250;
const HAWAII_WIDTH = 160;
const FRAME_MARGIN = 8; // breathing room between a shape and its frame

// --------------------------------------------------------------- source data

async function loadCounties() {
  if (!fs.existsSync(SOURCE_FILE)) {
    fs.mkdirSync(CACHE, { recursive: true });
    process.stdout.write(`downloading ${SOURCE_URL}\n`);
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`county data fetch failed: ${res.status}`);
    fs.writeFileSync(SOURCE_FILE, Buffer.from(await res.arrayBuffer()));
  }
  const geo = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
  const byState = new Map();
  for (const feature of geo.features) {
    const fips = String(feature.properties.STATE).padStart(2, '0');
    if (!byState.has(fips)) byState.set(fips, []);
    byState.get(fips).push(feature);
  }
  return byState;
}

/** polygon-clipping wants MultiPolygon-shaped coordinates for everything. */
const asMulti = (geometry) =>
  (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates);

const dissolve = (features) => features
  .slice(1)
  .reduce((acc, f) => pc.union(acc, asMulti(f.geometry)), asMulti(features[0].geometry));

/**
 * The Aleutians cross the antimeridian, so their longitudes arrive positive
 * (Attu is at +172°). Shift them west of -180 so Alaska is one continuous shape.
 */
const unwrapAlaska = (multi) => multi.map((poly) =>
  poly.map((ring) => ring.map(([lon, lat]) => [lon > 0 ? lon - 360 : lon, lat])));

// ---------------------------------------------------------------- projection

/**
 * Albers equal-area conic. Only relative shape matters — each group of states
 * is fitted to its own box afterwards — so no scaling or centring here.
 */
function albers(lon0, phi1, phi2) {
  const rad = Math.PI / 180;
  const n = (Math.sin(phi1 * rad) + Math.sin(phi2 * rad)) / 2;
  const C = Math.cos(phi1 * rad) ** 2 + 2 * n * Math.sin(phi1 * rad);
  return ([lon, lat]) => {
    const rho = Math.sqrt(C - 2 * n * Math.sin(lat * rad)) / n;
    const theta = n * (lon - lon0) * rad;
    // Textbook Albers is y = ρ0 − ρ·cosθ with y growing north; SVG y grows
    // south, so the sign flips and the constant ρ0 washes out in the fitting.
    return [rho * Math.sin(theta), rho * Math.cos(theta)];
  };
}

const PROJECTIONS = {
  lower48: albers(-96, 29.5, 45.5), // the d3.geoAlbersUsa parallels
  alaska: albers(-154, 55, 65),
  hawaii: albers(-157, 8, 18),
};

function boundsOfProjected(multis, project) {
  let minX = Infinity; let maxX = -Infinity;
  let minY = Infinity; let maxY = -Infinity;
  for (const multi of multis) {
    for (const poly of multi) {
      for (const ring of poly) {
        for (const point of ring) {
          const [x, y] = project(point);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

/** A projector fitted so the group's bounds land in a box at (dx, dy). */
function fitted(project, bounds, width, dx, dy) {
  const scale = width / (bounds.maxX - bounds.minX);
  return {
    height: (bounds.maxY - bounds.minY) * scale,
    project: (point) => {
      const [x, y] = project(point);
      return [(x - bounds.minX) * scale + dx, (y - bounds.minY) * scale + dy];
    },
  };
}

// -------------------------------------------------------- simplify and emit
// Same machinery as scripts/build-virginia-map.mjs.

/** Douglas-Peucker. County outlines carry far more detail than a 1000px map. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const [start] = points;
  const end = points[points.length - 1];

  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], start, end);
    if (d > worst) { worst = d; index = i; }
  }
  if (worst <= tolerance) return [start, end];

  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

function perpendicularDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Shoelace. Used to drop slivers, rank rings, and place labels. */
function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return Math.abs(sum / 2);
}

function centroidOf(ring) {
  let x = 0; let y = 0; let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
    a += cross;
    x += (ring[j][0] + ring[i][0]) * cross;
    y += (ring[j][1] + ring[i][1]) * cross;
  }
  a *= 0.5;
  if (a === 0) return ring[0];
  return [x / (6 * a), y / (6 * a)];
}

/** MultiPolygon of lon/lat -> one SVG path string, plus a label anchor. */
function toPath(multi, project) {
  const rings = [];
  for (const poly of multi) {
    for (const ring of poly) {
      const projected = ring.map(project);
      const thin = simplify(projected, SIMPLIFY_TOLERANCE);
      if (thin.length < 4 || ringArea(thin) < MIN_AREA) continue;
      rings.push(thin);
    }
  }
  if (!rings.length) return null;

  const d = rings
    .map((ring) => ring
      .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join('') + 'Z')
    .join('');

  const biggest = rings.reduce((a, b) => (ringArea(a) > ringArea(b) ? a : b));
  const [cx, cy] = centroidOf(biggest);
  // Area is shipped so the game can decide which states are too small to see
  // when highlighted (Rhode Island) and need a ring drawn around them.
  const area = Math.round(rings.reduce((sum, ring) => sum + ringArea(ring), 0));
  return { d, area, label: [+cx.toFixed(1), +cy.toFixed(1)] };
}

// ---------------------------------------------------------------------- main

const byState = await loadCounties();

const shapes = new Map(); // name -> MultiPolygon in lon/lat
for (const [fips, name] of Object.entries(STATE_FIPS)) {
  const features = byState.get(fips);
  if (!features?.length) throw new Error(`no county data for FIPS ${fips} (${name})`);
  let geom = dissolve(features);
  if (name === 'Alaska') geom = unwrapAlaska(geom);
  if (name === 'Hawaii') geom = pc.intersection(geom, HAWAII_FRAME);
  shapes.set(name, geom);
  process.stdout.write(`dissolved ${String(features.length).padStart(3)} counties -> ${name}\n`);
}

// The fifty names are the contract: the quiz asks about US_STATES rows, so the
// map must cover exactly that set or an answer could have no shape to light up.
const quizNames = US_STATES.map((s) => s.name).sort();
const mapNames = [...shapes.keys()].sort();
if (JSON.stringify(quizNames) !== JSON.stringify(mapNames)) {
  throw new Error(`the map and us-states.js disagree:\n  quiz: ${quizNames.join(', ')}\n  map: ${mapNames.join(', ')}`);
}

// Fit the lower 48 to the full width, then hang the inset band underneath.
const lower48 = [...shapes.entries()].filter(([name]) => name !== 'Alaska' && name !== 'Hawaii');
const mainFit = fitted(
  PROJECTIONS.lower48,
  boundsOfProjected(lower48.map(([, geom]) => geom), PROJECTIONS.lower48),
  OUT_WIDTH, 0, 0,
);

const bandTop = mainFit.height + INSET_PAD;
const alaskaFit = fitted(
  PROJECTIONS.alaska,
  boundsOfProjected([shapes.get('Alaska')], PROJECTIONS.alaska),
  ALASKA_WIDTH, INSET_PAD + FRAME_MARGIN, bandTop + FRAME_MARGIN,
);
const hawaiiFit = fitted(
  PROJECTIONS.hawaii,
  boundsOfProjected([shapes.get('Hawaii')], PROJECTIONS.hawaii),
  HAWAII_WIDTH, INSET_PAD + ALASKA_WIDTH + 3 * FRAME_MARGIN + INSET_PAD, bandTop + FRAME_MARGIN,
);

const bandHeight = Math.max(alaskaFit.height, hawaiiFit.height) + 2 * FRAME_MARGIN;
const totalHeight = +(bandTop + bandHeight).toFixed(1);

const frames = [
  {
    x: INSET_PAD,
    y: +bandTop.toFixed(1),
    width: ALASKA_WIDTH + 2 * FRAME_MARGIN,
    height: +bandHeight.toFixed(1),
  },
  {
    x: INSET_PAD + ALASKA_WIDTH + 2 * FRAME_MARGIN + INSET_PAD,
    y: +bandTop.toFixed(1),
    width: HAWAII_WIDTH + 2 * FRAME_MARGIN,
    height: +bandHeight.toFixed(1),
  },
];

const projectorFor = (name) =>
  (name === 'Alaska' ? alaskaFit : name === 'Hawaii' ? hawaiiFit : mainFit).project;

const states = US_STATES.map(({ name, abbr }) => {
  const shape = toPath(shapes.get(name), projectorFor(name));
  if (!shape) throw new Error(`${name} came out empty — check the pipeline`);
  return { id: name.toLowerCase().replace(/[^a-z]+/g, '-'), name, abbr, ...shape };
});

const banner = `/**
 * GENERATED by scripts/build-us-map.mjs — do not edit by hand.
 *
 * All fifty states, dissolved from US Census county polygons (public domain).
 * The lower 48 use an Albers equal-area projection — the classroom-map shape —
 * and Alaska and Hawaii sit in framed inset boxes below, not to scale.
 */`;

const body = `${banner}

export const US_MAP = {
  viewBox: '0 0 ${OUT_WIDTH} ${totalHeight}',
  // The inset boxes holding Alaska and Hawaii, for drawing their frames.
  insetFrames: ${JSON.stringify(frames)},
  states: [
${states.map((s) => `    {
      id: '${s.id}',
      name: '${s.name}',
      abbr: '${s.abbr}',
      area: ${s.area},
      label: [${s.label[0]}, ${s.label[1]}],
      d: '${s.d}',
    },`).join('\n')}
  ],
};
`;

fs.writeFileSync(OUT_FILE, body);
const kb = (Buffer.byteLength(body) / 1024).toFixed(1);
process.stdout.write(`wrote ${path.relative(ROOT, OUT_FILE)} (${kb} kB)\n`);
const biggest = [...states].sort((a, b) => b.d.length - a.d.length).slice(0, 5);
for (const s of biggest) {
  process.stdout.write(`  ${s.name.padEnd(16)} ${String(s.d.length).padStart(6)} chars\n`);
}
