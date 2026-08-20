/**
 * Builds src/data/virginia-map.js — the Virginia outline plus the five region
 * shapes, as SVG paths.
 *
 * Run it by hand when the geometry needs to change; the game itself never runs
 * this and has no dependency on it:
 *
 *   npm i && node scripts/build-virginia-map.mjs
 *
 * Why bands rather than counties
 * ------------------------------
 * The obvious approach is to group Virginia's 133 counties and independent
 * cities by region and dissolve them. That is wrong for the Blue Ridge: in
 * northern Virginia the Blue Ridge is a ridge a few miles wide, so no county
 * there sits entirely inside it, and a county-level map would erase the region
 * exactly where kids are asked to point at it.
 *
 * So the state outline is real — the union of actual county polygons, which is
 * what gives the Eastern Shore, the Chesapeake bite, and the southwest tail
 * their correct shapes — and the four internal boundaries are drawn as
 * polylines and used to slice it. That is also how the maps in Virginia Studies
 * materials are drawn, so the result matches what the girls see in class.
 *
 * The boundary polylines below are approximations of physiographic province
 * edges, good to a few miles. They are the one hand-placed thing in this
 * pipeline, and they are the thing to adjust if a shape looks wrong.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// polygon-clipping is CommonJS, so it arrives as a default export.
import pc from 'polygon-clipping';
import { VA_PLACES } from '../src/data/virginia.js';
import {
  boundsOf,
  dissolve,
  pathFromMulti,
  pointInMulti,
} from './lib/geo.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CACHE = path.join(HERE, '.cache');
const SOURCE_URL =
  'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json';
const SOURCE_FILE = path.join(CACHE, 'us-counties.json');
const OUT_FILE = path.join(ROOT, 'src/data/virginia-map.js');

const VA_FIPS = '51';
/** Everything Virginia touches, so "tap the state to the north" has something to tap. */
const NEIGHBOUR_FIPS = {
  24: 'Maryland',
  54: 'West Virginia',
  21: 'Kentucky',
  47: 'Tennessee',
  37: 'North Carolina',
  11: 'Washington, D.C.',
};
const FRAME_PAD = 0.75; // degrees of neighbouring state to keep around Virginia
const OUT_WIDTH = 1000;
const SIMPLIFY_TOLERANCE = 0.9; // in output units; ~1 mile at this scale
const MIN_AREA = 12; // drop slivers smaller than this many square output units

/**
 * Region boundaries, ordered north to south, as [longitude, latitude].
 * Each line is extended straight up and down beyond the state before slicing,
 * so only the middle of each line actually matters.
 */
const BOUNDARIES = {
  // Where rivers drop off the harder Piedmont rock. Runs through Alexandria,
  // Fredericksburg, Richmond, and Petersburg — the four Fall Line cities.
  fallLine: [
    [-77.04, 38.93], [-77.29, 38.63], [-77.46, 38.30], [-77.44, 37.90],
    [-77.43, 37.54], [-77.40, 37.23], [-77.52, 36.85], [-77.62, 36.54],
  ],
  // Eastern foot of the Blue Ridge, where the Piedmont ends.
  blueRidgeEast: [
    [-77.83, 39.16], [-78.10, 38.85], [-78.40, 38.55], [-78.70, 38.20],
    [-78.95, 37.85], [-79.30, 37.45], [-79.70, 37.10], [-80.20, 36.80],
    [-80.62, 36.54],
  ],
  // Western foot of the Blue Ridge, where the Great Valley begins. Narrow in the
  // north — a few miles wide near Front Royal — and then it swings hard west in
  // the far southwest to take in the Mount Rogers highlands, while leaving
  // Marion and Abingdon in the valley just north and west of them.
  blueRidgeWest: [
    [-77.95, 39.16], [-78.25, 38.85], [-78.55, 38.50], [-78.85, 38.15],
    [-79.20, 37.80], [-79.65, 37.45], [-80.15, 37.10], [-80.80, 36.85],
    [-81.45, 36.80], [-81.70, 36.62], [-82.10, 36.54],
  ],
  // Cumberland front: everything northwest of this is the Appalachian Plateau.
  // Must run southeast of Wise, Norton, and Big Stone Gap, which are plateau.
  plateau: [
    [-81.95, 37.30], [-82.25, 37.05], [-82.60, 36.85], [-82.95, 36.68],
    [-83.30, 36.55],
  ],
};

/**
 * The regions of virginia.js, and their short names, are the contract this map
 * has to honour. Every place in VA_PLACES with a region is point-tested against
 * the shapes generated below, and the build fails if one lands in the wrong
 * region — so the map can never disagree with an answer the game gives.
 */
const REGION_IDS = {
  'Coastal Plain': 'coastal-plain',
  Piedmont: 'piedmont',
  'Blue Ridge Mountains': 'blue-ridge',
  'Valley and Ridge': 'valley-and-ridge',
  'Appalachian Plateau': 'appalachian-plateau',
};

const REGIONS = [
  { id: 'coastal-plain', short: 'Coastal Plain' },
  { id: 'piedmont', short: 'Piedmont' },
  { id: 'blue-ridge', short: 'Blue Ridge Mountains' },
  { id: 'valley-and-ridge', short: 'Valley and Ridge' },
  { id: 'appalachian-plateau', short: 'Appalachian Plateau' },
];

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
    const fips = String(feature.properties.STATE);
    if (!byState.has(fips)) byState.set(fips, []);
    byState.get(fips).push(feature);
  }
  const va = byState.get(VA_FIPS) ?? [];
  if (va.length < 100) throw new Error(`expected ~134 Virginia features, got ${va.length}`);
  return { va, byState };
}

// ------------------------------------------------------------------- slicing

const LAT_TOP = 41;
const LAT_BOTTOM = 35;
const LON_FAR_EAST = -70;
const LON_FAR_WEST = -86;

/** The line, extended vertically past the state at both ends. */
function extended(line) {
  const [firstLon] = line[0];
  const [lastLon] = line[line.length - 1];
  return [[firstLon, LAT_TOP], ...line, [lastLon, LAT_BOTTOM]];
}

/** A polygon covering everything east (or west) of a boundary line. */
function halfPlane(line, side) {
  const spine = extended(line);
  const edge = side === 'east' ? LON_FAR_EAST : LON_FAR_WEST;
  return [[[
    ...spine,
    [edge, LAT_BOTTOM],
    [edge, LAT_TOP],
    spine[0],
  ]]];
}

// ---------------------------------------------------------------- checking

function checkPlaces(sliced) {
  const failures = [];
  let checked = 0;

  for (const place of VA_PLACES) {
    if (!place.coords) throw new Error(`${place.name} has no coordinates`);
    const landedIn = Object.keys(sliced).filter((id) => pointInMulti(place.coords, sliced[id]));

    // Fall Line cities have no region in the data, but they still have to land
    // somewhere on the map rather than in the ocean.
    if (place.fallLine) {
      if (!landedIn.length) failures.push(`  ${place.name}: fell outside Virginia entirely`);
      continue;
    }

    checked += 1;
    const expected = REGION_IDS[place.region];
    if (landedIn.length !== 1 || landedIn[0] !== expected) {
      failures.push(`  ${place.name}: virginia.js says ${place.region}, the map says `
        + `${landedIn.join(' + ') || 'nothing'}`);
    }
  }

  if (failures.length) {
    throw new Error(`the map disagrees with virginia.js:\n${failures.join('\n')}`);
  }
  process.stdout.write(`all ${checked} placed localities landed in the right region\n`);
}

// ---------------------------------------------------------------- projection

/**
 * Equirectangular, with longitude squeezed by cos(latitude) so the state is not
 * stretched sideways. Good enough for one state.
 */
function makeProjector(bounds) {
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const squeeze = Math.cos((midLat * Math.PI) / 180);
  const spanX = (bounds.maxLon - bounds.minLon) * squeeze;
  const spanY = bounds.maxLat - bounds.minLat;
  const scale = OUT_WIDTH / spanX;
  return {
    height: +(spanY * scale).toFixed(1),
    // Shipped with the map so the game can place a pin on any [lon, lat]
    // without re-deriving the projection.
    params: {
      minLon: +bounds.minLon.toFixed(6),
      maxLat: +bounds.maxLat.toFixed(6),
      squeeze: +squeeze.toFixed(6),
      scale: +scale.toFixed(4),
    },
    project: ([lon, lat]) => [
      (lon - bounds.minLon) * squeeze * scale,
      (bounds.maxLat - lat) * scale, // SVG y grows downward
    ],
  };
}

// -------------------------------------------------------- simplify and emit

// ---------------------------------------------------------------------- main

const { va: counties, byState } = await loadCounties();

const state = dissolve(counties);
process.stdout.write(`unioned ${counties.length} Virginia localities\n`);

const eastOf = (name) => halfPlane(BOUNDARIES[name], 'east');
const westOf = (name) => halfPlane(BOUNDARIES[name], 'west');

const sliced = {
  'coastal-plain': pc.intersection(state, eastOf('fallLine')),
  piedmont: pc.intersection(state, westOf('fallLine'), eastOf('blueRidgeEast')),
  'blue-ridge': pc.intersection(state, westOf('blueRidgeEast'), eastOf('blueRidgeWest')),
  'appalachian-plateau': pc.intersection(state, westOf('plateau')),
};
// Whatever is left over is the Valley and Ridge, so the five always tile the
// state exactly with no gaps or overlaps.
sliced['valley-and-ridge'] = pc.difference(
  state,
  sliced['coastal-plain'],
  sliced.piedmont,
  sliced['blue-ridge'],
  sliced['appalachian-plateau'],
);

checkPlaces(sliced);

// Neighbouring states, trimmed to a frame around Virginia so the file stays
// small and the map stays centred on Virginia.
const vaBounds = boundsOf(state);
const frame = [[[
  [vaBounds.minLon - FRAME_PAD, vaBounds.minLat - FRAME_PAD],
  [vaBounds.maxLon + FRAME_PAD, vaBounds.minLat - FRAME_PAD],
  [vaBounds.maxLon + FRAME_PAD, vaBounds.maxLat + FRAME_PAD],
  [vaBounds.minLon - FRAME_PAD, vaBounds.maxLat + FRAME_PAD],
  [vaBounds.minLon - FRAME_PAD, vaBounds.minLat - FRAME_PAD],
]]];

const neighbourShapes = Object.entries(NEIGHBOUR_FIPS).map(([fips, name]) => {
  const features = byState.get(fips);
  if (!features) throw new Error(`no county data for FIPS ${fips} (${name})`);
  return { fips, name, geom: pc.intersection(dissolve(features), frame) };
}).filter((n) => n.geom.length);

// The frame, not Virginia, sets the viewBox, so neighbours are not cut off.
const { height, project, params } = makeProjector(boundsOf(frame));

const outline = pathFromMulti(state, project, { tolerance: SIMPLIFY_TOLERANCE, minArea: MIN_AREA });
const regions = REGIONS.map((region) => {
  const shape = pathFromMulti(sliced[region.id], project, { tolerance: SIMPLIFY_TOLERANCE, minArea: MIN_AREA });
  if (!shape) throw new Error(`${region.id} came out empty — check its boundary lines`);
  return { ...region, ...shape };
});

const neighbours = neighbourShapes.map(({ name, geom }) => {
  const shape = pathFromMulti(geom, project, { tolerance: SIMPLIFY_TOLERANCE, minArea: MIN_AREA });
  if (!shape) throw new Error(`${name} came out empty after clipping to the frame`);
  return { id: name.toLowerCase().replace(/[^a-z]+/g, '-'), name, ...shape };
});

// Region and pin questions do not need the neighbouring states in shot, and on
// a phone that framing shrinks Virginia by about a third. Ship a tighter box to
// crop to when the neighbours are only scenery.
const outlineNumbers = outline.d.match(/-?\d+(\.\d+)?/g).map(Number);
const outlineXs = outlineNumbers.filter((_, i) => i % 2 === 0);
const outlineYs = outlineNumbers.filter((_, i) => i % 2 === 1);
const CROP_MARGIN = 14;
const focusBox = [
  Math.max(0, Math.min(...outlineXs) - CROP_MARGIN),
  Math.max(0, Math.min(...outlineYs) - CROP_MARGIN),
  Math.min(OUT_WIDTH, Math.max(...outlineXs) + CROP_MARGIN) - Math.max(0, Math.min(...outlineXs) - CROP_MARGIN),
  Math.min(height, Math.max(...outlineYs) + CROP_MARGIN) - Math.max(0, Math.min(...outlineYs) - CROP_MARGIN),
].map((n) => +n.toFixed(1));

const banner = `/**
 * GENERATED by scripts/build-virginia-map.mjs — do not edit by hand.
 *
 * Virginia's outline is the union of real county polygons (US Census
 * cartographic boundaries, public domain). The five regions are that outline
 * sliced by approximate physiographic boundary lines, which is how classroom
 * maps draw them; see the build script for why not by county.
 */`;

const body = `${banner}

export const VA_MAP = {
  viewBox: '0 0 ${OUT_WIDTH} ${height}',
  // Cropped to Virginia alone, for questions where the neighbours are scenery.
  focusBox: '${focusBox.join(' ')}',
  // Turn any [longitude, latitude] into map coordinates, for dropping pins.
  projection: ${JSON.stringify(params)},
  outline: '${outline.d}',
  regions: [
${regions.map((r) => `    {
      id: '${r.id}',
      short: '${r.short}',
      area: ${r.area},
      label: [${r.label[0]}, ${r.label[1]}],
      d: '${r.d}',
    },`).join('\n')}
  ],
  neighbours: [
${neighbours.map((n) => `    {
      id: '${n.id}',
      name: '${n.name}',
      area: ${n.area},
      label: [${n.label[0]}, ${n.label[1]}],
      d: '${n.d}',
    },`).join('\n')}
  ],
};

/** [longitude, latitude] -> [x, y] in the map's viewBox. */
export function projectToMap([lon, lat]) {
  const { minLon, maxLat, squeeze, scale } = VA_MAP.projection;
  return [(lon - minLon) * squeeze * scale, (maxLat - lat) * scale];
}
`;

fs.writeFileSync(OUT_FILE, body);
const kb = (Buffer.byteLength(body) / 1024).toFixed(1);
process.stdout.write(`wrote ${path.relative(ROOT, OUT_FILE)} (${kb} kB)\n`);
for (const r of [...regions, ...neighbours]) {
  const name = r.short ?? r.name;
  process.stdout.write(`  ${name.padEnd(22)} ${String(r.d.length).padStart(6)} chars\n`);
}
