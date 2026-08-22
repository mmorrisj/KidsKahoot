/**
 * Math fact sets.
 *
 * Unlike the geography data, none of this is typed out — the rows are computed.
 * That is deliberate rather than lazy. The times tables from 2 to 12 are exactly
 * 121 facts, a finite set, so enumerating them keeps everything the engine gives
 * us for free: no repeats inside a round, an honest question count before you
 * start, a seeded round that replays identically, and the missed-question
 * requeue. Generating random problems on the fly would break all four.
 *
 * The other half of this file is the wrong answers, and they matter more than
 * the questions. Offering random numbers teaches nothing — a kid rules them out
 * by estimating. Every wrong answer here is a mistake children actually make,
 * and carries the explanation of *which* mistake it is, so typing 35 for 52 - 27
 * gets told about the borrow rather than just "no".
 */

const ones = (n) => n % 10;
const tens = (n) => Math.floor(n / 10);

/** How many wrong answers every question needs, to fill a four-tile round. */
const MIN_DISTRACTORS = 3;

/** Near-misses used only when a fact has too few real mistakes to make. */
const NEAR_OFFSETS = [1, -1, 2, -2, 10, -10, 5, -5, 3, -3];

/**
 * Wrong answers, most likely first, with impossible and duplicate ones dropped.
 *
 * A few dozen of the smallest facts — 2 x 2, 21 - 16 — do not have three
 * distinct mistakes available, so the list is topped up with near-misses. Those
 * carry no explanation, because inventing a reason a kid might have picked a
 * number we chose arbitrarily would be teaching them something untrue.
 */
const usable = (answer, traps) => {
  const seen = new Set([answer]);
  const out = [];

  for (const trap of traps) {
    const { value } = trap;
    if (!Number.isInteger(value) || value <= 0 || seen.has(value)) continue;
    seen.add(value);
    out.push(trap);
  }

  for (const offset of NEAR_OFFSETS) {
    if (out.length >= MIN_DISTRACTORS) break;
    const value = answer + offset;
    if (value <= 0 || seen.has(value)) continue;
    seen.add(value);
    out.push({ value, why: null });
  }

  return out;
};

// ------------------------------------------------------- multiplication

/**
 * x2, x5, x10 and x11 have patterns kids latch onto early. x3, x4 and x9 have
 * usable tricks. The 6-7-8-12 corner has none, which is why it is where fact
 * practice actually earns its keep.
 */
function timesTier(a, b) {
  const easy = (n) => [2, 5, 10, 11].includes(n);
  const middling = (n) => [3, 4, 9].includes(n);
  if (easy(a) || easy(b)) return 1;
  if (middling(a) || middling(b)) return 2;
  return 3;
}

export const TIMES_FACTS = [];
for (let a = 2; a <= 12; a++) {
  for (let b = 2; b <= 12; b++) {
    TIMES_FACTS.push({ id: `${a}x${b}`, a, b, tier: timesTier(a, b) });
  }
}

export function timesTraps({ a, b }) {
  const answer = a * b;
  return usable(answer, [
    { value: a * (b - 1), why: `${a} × ${b - 1} = ${a * (b - 1)}. That is one row too early.` },
    { value: a * (b + 1), why: `${a} × ${b + 1} = ${a * (b + 1)}. That is one row too far.` },
    { value: (a + 1) * b, why: `${a + 1} × ${b} = ${(a + 1) * b}.` },
    { value: answer - a, why: `That is one group of ${a} short.` },
    { value: a + b, why: `${a} + ${b} = ${a + b}. This one is a times question.` },
  ]);
}

export function divisionTraps({ a, b }) {
  const product = a * b;
  return usable(a, [
    { value: a + 1, why: `${b} × ${a + 1} = ${b * (a + 1)}, not ${product}.` },
    { value: a - 1, why: `${b} × ${a - 1} = ${b * (a - 1)}, not ${product}.` },
    { value: product - b, why: `That is ${product} − ${b}. This one is a divide.` },
    { value: b, why: `${b} is the number being divided by, not the answer.` },
  ]);
}

// ------------------------------------------------------------- addition

const addTier = (sum) => (sum <= 10 ? 1 : sum <= 15 ? 2 : 3);

export const ADDITION_FACTS = [];
for (let a = 2; a <= 10; a++) {
  for (let b = 2; b <= 10; b++) {
    ADDITION_FACTS.push({ id: `${a}+${b}`, a, b, tier: addTier(a + b) });
  }
}

export function additionTraps({ a, b }) {
  const answer = a + b;
  return usable(answer, [
    { value: answer + 1, why: 'One too many — an easy slip when counting on.' },
    { value: answer - 1, why: 'One short — an easy slip when counting on.' },
    { value: a * b, why: `${a} × ${b} = ${a * b}. This one is a plus question.` },
    { value: Math.abs(a - b), why: `${Math.max(a, b)} − ${Math.min(a, b)} = ${Math.abs(a - b)}. This one is a plus question.` },
  ]);
}

export function subtractionTraps({ a, b }) {
  const sum = a + b;
  return usable(a, [
    { value: a + 1, why: 'One too many.' },
    { value: a - 1, why: 'One short.' },
    { value: sum + b, why: `That is ${sum} + ${b}. This one is a take-away.` },
    { value: b, why: `${b} is the number being taken away, not what is left.` },
  ]);
}

// --------------------------------------------- two-digit, with regrouping

/** Only pairs that actually need a carry; the rest are not what this drills. */
export const CARRY_FACTS = [];
for (let a = 11; a <= 99; a++) {
  for (let b = 11; b <= 99; b++) {
    if (ones(a) + ones(b) < 10) continue;
    const sum = a + b;
    CARRY_FACTS.push({
      id: `${a}+${b}`,
      a,
      b,
      tier: sum >= 100 ? 3 : (a < 50 && b < 50) ? 1 : 2,
    });
  }
}

export function carryTraps({ a, b }) {
  const answer = a + b;
  const columnOnes = ones(a) + ones(b);
  return usable(answer, [
    {
      value: answer - 10,
      why: 'The ten from the ones column did not get carried over.',
    },
    {
      // 27 + 15 written as "312": the column sums placed side by side.
      value: (tens(a) + tens(b)) * 100 + columnOnes,
      why: `That is the two column answers written side by side, ${tens(a) + tens(b)} and `
        + `${columnOnes}, instead of carrying.`,
    },
    { value: answer + 10, why: 'That carries ten too many.' },
    { value: answer - 1, why: 'One short.' },
  ]);
}

/** Only pairs that actually need a borrow. */
export const BORROW_FACTS = [];
for (let a = 21; a <= 99; a++) {
  for (let b = 11; b < a; b++) {
    if (ones(b) <= ones(a)) continue;
    BORROW_FACTS.push({
      id: `${a}-${b}`,
      a,
      b,
      tier: a < 50 ? 1 : a < 80 ? 2 : 3,
    });
  }
}

export function borrowTraps({ a, b }) {
  const answer = a - b;
  return usable(answer, [
    {
      // The single most common subtraction error in elementary school: taking
      // the smaller digit from the larger in each column and skipping the borrow.
      value: Math.abs(tens(a) - tens(b)) * 10 + Math.abs(ones(a) - ones(b)),
      why: 'That takes the smaller digit from the larger in each column. '
        + `The ones column needs a borrow: ${ones(a)} is smaller than ${ones(b)}.`,
    },
    { value: answer + 10, why: 'The ten was borrowed but never taken off the tens column.' },
    { value: answer - 10, why: 'That takes off ten too many.' },
    { value: a + b, why: `That is ${a} + ${b}. This one is a take-away.` },
  ]);
}
