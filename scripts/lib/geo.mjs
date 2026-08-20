/**
 * Shared geometry helpers for the map build scripts.
 *
 * Build-time only — nothing here ships to the browser. The scripts fetch public
 * -domain boundary data, dissolve it, project it, and write SVG paths into
 * src/data/, which is what the game actually loads.
 */
import fs from 'node:fs';
import path from 'node:path';
import pc from 'polygon-clipping';

/** Fetch a GeoJSON file once and keep it in scripts/.cache for later runs. */
export async function loadGeoJson(url, cacheDir, filename) {
  const file = path.join(cacheDir, filename);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    process.stdout.write(`downloading ${url}\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** polygon-clipping wants MultiPolygon-shaped coordinates for everything. */
export const asMulti = (geometry) =>
  (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates);

/** Union a list of GeoJSON features into one MultiPolygon. */
export function dissolve(features) {
  if (!features.length) throw new Error('nothing to dissolve');
  return features
    .slice(1)
    .reduce((acc, f) => pc.union(acc, asMulti(f.geometry)), asMulti(features[0].geometry));
}

export function boundsOf(multi) {
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

/** Douglas-Peucker. Source outlines carry far more detail than a small map. */
export function simplify(points, tolerance) {
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

/** Shoelace. Used to drop clipping slivers and to place labels. */
export function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return Math.abs(sum / 2);
}

export function centroidOf(ring) {
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

/** MultiPolygon of lon/lat -> one SVG path string, plus area and a label anchor. */
export function pathFromMulti(multi, project, {
  tolerance,
  minArea,
  precision = 1,
  maxSegmentX = Infinity,
} = {}) {
  const rings = [];
  for (const poly of multi) {
    for (const ring of poly) {
      const thin = simplify(ring.map(project), tolerance);
      if (thin.length < 4 || ringArea(thin) < minArea) continue;
      // A ring straddling the map's seam projects with one enormous horizontal
      // jump, which draws as a streak across the whole world. Drop those.
      if (crossesSeam(thin, maxSegmentX)) continue;
      rings.push(thin);
    }
  }
  if (!rings.length) return null;

  const d = rings
    .map((ring) => ring
      .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(precision)} ${y.toFixed(precision)}`)
      .join('') + 'Z')
    .join('');

  const biggest = rings.reduce((a, b) => (ringArea(a) > ringArea(b) ? a : b));
  const [cx, cy] = centroidOf(biggest);
  const area = Math.round(rings.reduce((sum, ring) => sum + ringArea(ring), 0));
  return { d, area, label: [+cx.toFixed(1), +cy.toFixed(1)] };
}

function crossesSeam(ring, maxSegmentX) {
  if (maxSegmentX === Infinity) return false;
  for (let i = 1; i < ring.length; i++) {
    if (Math.abs(ring[i][0] - ring[i - 1][0]) > maxSegmentX) return true;
  }
  return false;
}

/** Ray casting on lon/lat rings, for checking a point lands where it should. */
export function pointInRing([x, y], ring) {
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
export function pointInMulti(point, multi) {
  for (const poly of multi) {
    const [outer, ...holes] = poly;
    if (pointInRing(point, outer) && !holes.some((h) => pointInRing(point, h))) return true;
  }
  return false;
}
