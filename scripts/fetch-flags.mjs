/**
 * Downloads one SVG flag per country in countries.js into src/assets/flags/,
 * named by lowercased ISO code (fr.svg, de.svg, …).
 *
 * Run it by hand when countries are added; the images are committed, so the
 * game never fetches anything at runtime:
 *
 *   node scripts/fetch-flags.mjs
 *
 * Why images at all: the dataset's emoji flags only render on devices whose
 * fonts include them. Windows browsers show two-letter codes instead, and
 * plenty of tablets show empty boxes — which turns "which country flies this
 * flag" into no question at all. The SVGs come from flagcdn.com (public
 * domain).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTRIES } from '../src/data/countries.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, '..', 'src/assets/flags');

fs.mkdirSync(OUT_DIR, { recursive: true });

let fetched = 0;
let kept = 0;
for (const { code, name } of COUNTRIES) {
  const file = path.join(OUT_DIR, `${code.toLowerCase()}.svg`);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) {
    kept += 1;
    continue;
  }
  const url = `https://flagcdn.com/${code.toLowerCase()}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: ${url} -> ${res.status}`);
  const svg = await res.text();
  if (!svg.includes('<svg')) throw new Error(`${name}: ${url} did not return an SVG`);
  fs.writeFileSync(file, svg);
  fetched += 1;
  process.stdout.write(`${code.toLowerCase()}.svg  ${name}\n`);
}

const total = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.svg')).length;
const bytes = fs.readdirSync(OUT_DIR)
  .reduce((sum, f) => sum + fs.statSync(path.join(OUT_DIR, f)).size, 0);
process.stdout.write(
  `${fetched} fetched, ${kept} already present — ${total} flags, ${(bytes / 1024).toFixed(0)} kB\n`);
