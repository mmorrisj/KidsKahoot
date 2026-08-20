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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CACHE = path.join(HERE, '.cache');
const SOURCE_URL =
  'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json';
const SOURCE_FILE = path.join(CACHE, 'us-counties.json');
const OUT_FILE = path.join(ROOT, 'src/data/virginia-map.js');

const VA_FIPS = '51';
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
 * Places whose region the game already asserts in src/data/virginia.js, with
 * coordinates, used to check the boundary lines above. If a line drifts, the
 * build fails here rather than shipping a map that disagrees with the answers.
 *
 * This is how the plateau line was caught sitting northwest of Wise and Norton.
 */
const ANCHORS = [
  ['Virginia Beach', -75.98, 36.85, 'coastal-plain'],
  ['Norfolk', -76.29, 36.85, 'coastal-plain'],
  ['Newport News', -76.43, 37.09, 'coastal-plain'],
  ['Williamsburg', -76.71, 37.27, 'coastal-plain'],
  ['Jamestown', -76.78, 37.21, 'coastal-plain'],
  ['Charlottesville', -78.48, 38.03, 'piedmont'],
  ['Monticello', -78.45, 38.01, 'piedmont'],
  ['Lynchburg', -79.14, 37.41, 'piedmont'],
  ['Danville', -79.40, 36.59, 'piedmont'],
  ['Appomattox Court House', -78.80, 37.38, 'piedmont'],
  ['Manassas', -77.48, 38.75, 'piedmont'],
  ['Mount Rogers', -81.54, 36.66, 'blue-ridge'],
  ['Big Meadows (Skyline Drive)', -78.44, 38.52, 'blue-ridge'],
  ['Roanoke', -79.94, 37.27, 'valley-and-ridge'],
  ['Winchester', -78.16, 39.19, 'valley-and-ridge'],
  ['Harrisonburg', -78.87, 38.45, 'valley-and-ridge'],
  ['Staunton', -79.07, 38.15, 'valley-and-ridge'],
  ['Lexington', -79.44, 37.78, 'valley-and-ridge'],
  ['Luray Caverns', -78.46, 38.67, 'valley-and-ridge'],
  ['Natural Bridge', -79.54, 37.63, 'valley-and-ridge'],
  ['Marion', -81.51, 36.83, 'valley-and-ridge'],
  ['Abingdon', -81.98, 36.71, 'valley-and-ridge'],
  ['Galax', -80.92, 36.66, 'blue-ridge'],
  ['Wise', -82.58, 36.98, 'appalachian-plateau'],
  ['Norton', -82.63, 36.93, 'appalachian-plateau'],
  ['Big Stone Gap', -82.78, 36.87, 'appalachian-plateau'],
];

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
  const va = geo.features.filter((f) => String(f.properties.STATE) === VA_FIPS);
  if (va.length < 100) throw new Error(`expected ~134 Virginia features, got ${va.length}`);
  return va;
}

/** polygon-clipping wants MultiPolygon-shaped coordinates for everything. */
const asMulti = (geometry) =>
  (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates);

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

/** Ray casting, on the unsimplified lon/lat geometry. */
function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** A point is in a MultiPolygon if it is in an outer ring and no hole. */
function pointInMulti(point, multi) {
  for (const poly of multi) {
    const [outer, ...holes] = poly;
    if (pointInRing(point, outer) && !holes.some((h) => pointInRing(point, h))) return true;
  }
  return false;
}

function checkAnchors(sliced) {
  const failures = [];
  for (const [name, lon, lat, expected] of ANCHORS) {
    const landedIn = Object.keys(sliced).filter((id) => pointInMulti([lon, lat], sliced[id]));
    if (landedIn.length !== 1 || landedIn[0] !== expected) {
      failures.push(`  ${name}: expected ${expected}, got ${landedIn.join(' + ') || 'nothing'}`);
    }
  }
  if (failures.length) {
    throw new Error(`region boundaries disagree with the quiz data:\n${failures.join('\n')}`);
  }
  process.stdout.write(`all ${ANCHORS.length} anchor places landed in the right region\n`);
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
    project: ([lon, lat]) => [
      (lon - bounds.minLon) * squeeze * scale,
      (bounds.maxLat - lat) * scale, // SVG y grows downward
    ],
  };
}

function boundsOf(multi) {
  let minLon = Infinity; let maxLon = -Infinity;
  let minLat = Infinity; let maxLat = -Infinity;
  for (const poly of multi) {
    for (const ring of poly) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return { minLon, maxLon, minLat, maxLat };
}

// -------------------------------------------------------- simplify and emit

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

/** Shoelace. Used to drop clipping slivers and to place region labels. */
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
  return { d, label: [+cx.toFixed(1), +cy.toFixed(1)] };
}

// ---------------------------------------------------------------------- main

const counties = await loadCounties();

let state = asMulti(counties[0].geometry);
for (const feature of counties.slice(1)) {
  state = pc.union(state, asMulti(feature.geometry));
}
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

checkAnchors(sliced);

const { height, project } = makeProjector(boundsOf(state));

const outline = toPath(state, project);
const regions = REGIONS.map((region) => {
  const shape = toPath(sliced[region.id], project);
  if (!shape) throw new Error(`${region.id} came out empty — check its boundary lines`);
  return { ...region, ...shape };
});

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
  outline: '${outline.d}',
  regions: [
${regions.map((r) => `    {
      id: '${r.id}',
      short: '${r.short}',
      label: [${r.label[0]}, ${r.label[1]}],
      d: '${r.d}',
    },`).join('\n')}
  ],
};
`;

fs.writeFileSync(OUT_FILE, body);
const kb = (Buffer.byteLength(body) / 1024).toFixed(1);
process.stdout.write(`wrote ${path.relative(ROOT, OUT_FILE)} (${kb} kB)\n`);
for (const r of regions) {
  process.stdout.write(`  ${r.short.padEnd(22)} ${String(r.d.length).padStart(6)} chars\n`);
}
