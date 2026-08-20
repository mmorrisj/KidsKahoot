/**
 * Small seeded random number generator.
 *
 * Seeding matters for two reasons: a round can be replayed exactly (useful when
 * two kids want the same quiz), and the generator's tests can assert on real
 * output instead of just shapes.
 */

/** mulberry32 — tiny, fast, good enough for shuffling quiz questions. */
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed derived from the clock, for "just start a game" cases. */
export function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

export function randomInt(rng, maxExclusive) {
  return Math.floor(rng() * maxExclusive);
}

/** Fisher-Yates. Returns a new array; never mutates the input. */
export function shuffle(rng, items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pick(rng, items) {
  return items[randomInt(rng, items.length)];
}

/** First n of a shuffle, capped at the list length. */
export function sample(rng, items, n) {
  return shuffle(rng, items).slice(0, n);
}
