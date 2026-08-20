/**
 * Question generator.
 *
 * Everything the game shows comes from here. Modes never read the datasets
 * directly — they ask for questions and render them. That is what lets one
 * country row feed multiple choice, flash cards, and a Jeopardy board without
 * the content being written three times.
 *
 * A question carries every representation a mode might need:
 *   prompt/choices/answer  multiple choice
 *   card                   flash cards (front, back, hint)
 *   clue                   Jeopardy ("This city is the capital of France" ->
 *                          "What is Paris?")
 */
import { COUNTRIES } from '../data/countries.js';
import { US_STATES } from '../data/us-states.js';
import { PHYSICAL_FACTS, POOLS } from '../data/physical.js';
import { CONTINENTS } from '../data/continents.js';
import { shuffle, sample } from './rng.js';

export const CHOICE_COUNT = 4;

export const TOPICS = [
  { id: 'world-capitals', label: 'World Capitals', icon: '🏛️' },
  { id: 'flags', label: 'Flags', icon: '🚩' },
  { id: 'continents', label: 'Continents', icon: '🌍' },
  { id: 'us-states', label: 'US States & Capitals', icon: '🇺🇸' },
  { id: 'physical', label: 'Rivers, Mountains & Landmarks', icon: '🏔️' },
];

export const TIERS = [
  { id: 1, label: 'Warm-up', blurb: 'Places kids hear about all the time' },
  { id: 2, label: 'School level', blurb: 'The ones that show up on tests' },
  { id: 3, label: 'Expert', blurb: 'For when tier 2 got too easy' },
];

/**
 * Order candidates so the ones nearest the answer come first. "Near" means the
 * same continent or the same US region — a wrong answer is only worth offering
 * if a kid could plausibly believe it.
 */
function neighborsFirst(rng, entity, all, groupKey, valueKey) {
  const near = [];
  const far = [];
  for (const other of all) {
    if (other === entity) continue;
    (other[groupKey] === entity[groupKey] ? near : far).push(other[valueKey]);
  }
  return [...shuffle(rng, near), ...shuffle(rng, far)];
}

/**
 * Build the final answer list: the right answer, up to two traps (famous
 * near-misses like Sydney for Australia), then the closest remaining
 * candidates. Deduped, then shuffled so the answer is not always in one spot.
 */
function buildChoices(rng, { answer, traps = [], candidates }) {
  const chosen = [answer];
  const taken = new Set([answer]);

  const usableTraps = traps.filter((t) => !taken.has(t));
  for (const trap of sample(rng, usableTraps, Math.min(2, CHOICE_COUNT - 1))) {
    chosen.push(trap);
    taken.add(trap);
  }

  for (const candidate of candidates) {
    if (chosen.length >= CHOICE_COUNT) break;
    if (taken.has(candidate)) continue;
    chosen.push(candidate);
    taken.add(candidate);
  }

  return shuffle(rng, chosen);
}

/**
 * The template registry. Each template turns one data row into one question
 * spec; `make` receives the rng so distractor choice is seeded too.
 */
const TEMPLATES = [
  {
    id: 'capital-of-country',
    topic: 'world-capitals',
    entities: () => COUNTRIES,
    // Singapore, Monaco, and Vatican City share a name with their capital,
    // which makes the question answer itself.
    applies: (x) => x.capital !== x.name,
    make: (rng, x) => ({
      tier: x.tier,
      category: 'World Capitals',
      prompt: `What is the capital of ${x.name}?`,
      media: { kind: 'flag', value: x.flag },
      answer: x.capital,
      choices: buildChoices(rng, {
        answer: x.capital,
        traps: x.traps,
        candidates: neighborsFirst(rng, x, COUNTRIES, 'continent', 'capital'),
      }),
      explanation: `${x.capital} is the capital of ${x.name}.`,
      card: { front: `Capital of ${x.name}`, back: x.capital, hint: x.flag },
      clue: {
        text: `This city is the capital of ${x.name}`,
        response: `What is ${x.capital}?`,
      },
    }),
  },
  {
    id: 'country-of-capital',
    topic: 'world-capitals',
    entities: () => COUNTRIES,
    applies: (x) => x.capital !== x.name,
    make: (rng, x) => ({
      tier: x.tier,
      category: 'World Capitals',
      prompt: `${x.capital} is the capital of which country?`,
      media: null,
      answer: x.name,
      choices: buildChoices(rng, {
        answer: x.name,
        candidates: neighborsFirst(rng, x, COUNTRIES, 'continent', 'name'),
      }),
      explanation: `${x.capital} ${x.flag} is the capital of ${x.name}.`,
      card: { front: x.capital, back: x.name, hint: null },
      clue: {
        text: `The capital of this country is ${x.capital}`,
        response: `What is ${x.name}?`,
      },
    }),
  },
  {
    id: 'flag-to-country',
    topic: 'flags',
    entities: () => COUNTRIES,
    make: (rng, x) => ({
      tier: x.tier,
      category: 'Flags',
      prompt: 'Which country flies this flag?',
      media: { kind: 'flag-large', value: x.flag },
      answer: x.name,
      choices: buildChoices(rng, {
        answer: x.name,
        candidates: neighborsFirst(rng, x, COUNTRIES, 'continent', 'name'),
      }),
      explanation: `${x.flag} is the flag of ${x.name}.`,
      card: { front: x.flag, back: x.name, hint: null },
      clue: { text: `This country flies the flag ${x.flag}`, response: `What is ${x.name}?` },
    }),
  },
  {
    id: 'country-to-flag',
    topic: 'flags',
    entities: () => COUNTRIES,
    make: (rng, x) => ({
      tier: x.tier,
      category: 'Flags',
      prompt: `Which flag belongs to ${x.name}?`,
      media: null,
      choiceStyle: 'emoji',
      answer: x.flag,
      choices: buildChoices(rng, {
        answer: x.flag,
        candidates: neighborsFirst(rng, x, COUNTRIES, 'continent', 'flag'),
      }),
      explanation: `${x.flag} is the flag of ${x.name}.`,
      card: { front: `Flag of ${x.name}`, back: x.flag, hint: null },
      clue: { text: `This is the flag of ${x.name}`, response: `What is ${x.flag}?` },
    }),
  },
  {
    id: 'continent-of-country',
    topic: 'continents',
    entities: () => COUNTRIES,
    make: (rng, x) => ({
      // Placing a country on a continent is easier than naming its capital, so
      // the whole template sits one tier below the country's own difficulty.
      tier: Math.max(1, x.tier - 1),
      category: 'Continents',
      prompt: `Which continent is ${x.name} on?`,
      media: { kind: 'flag', value: x.flag },
      answer: x.continent,
      choices: buildChoices(rng, {
        answer: x.continent,
        candidates: shuffle(rng, CONTINENTS.filter((k) => k !== x.continent)),
      }),
      explanation: `${x.name} ${x.flag} is in ${x.continent}.`,
      card: { front: `What continent is ${x.name} on?`, back: x.continent, hint: x.flag },
      clue: { text: `${x.name} is on this continent`, response: `What is ${x.continent}?` },
    }),
  },
  {
    id: 'capital-of-state',
    topic: 'us-states',
    entities: () => US_STATES,
    make: (rng, x) => ({
      tier: x.tier,
      category: 'State Capitals',
      prompt: `What is the capital of ${x.name}?`,
      media: null,
      answer: x.capital,
      choices: buildChoices(rng, {
        answer: x.capital,
        traps: x.traps,
        candidates: neighborsFirst(rng, x, US_STATES, 'region', 'capital'),
      }),
      explanation: `${x.capital} is the capital of ${x.name}.`,
      card: { front: `Capital of ${x.name}`, back: x.capital, hint: null },
      clue: { text: `This city is the capital of ${x.name}`, response: `What is ${x.capital}?` },
    }),
  },
  {
    id: 'state-of-capital',
    topic: 'us-states',
    entities: () => US_STATES,
    make: (rng, x) => ({
      tier: x.tier,
      category: 'State Capitals',
      prompt: `${x.capital} is the capital of which state?`,
      media: null,
      answer: x.name,
      choices: buildChoices(rng, {
        answer: x.name,
        candidates: neighborsFirst(rng, x, US_STATES, 'region', 'name'),
      }),
      explanation: `${x.capital} is the capital of ${x.name}.`,
      card: { front: x.capital, back: x.name, hint: null },
      clue: { text: `${x.capital} is the capital of this state`, response: `What is ${x.name}?` },
    }),
  },
  {
    id: 'physical-fact',
    topic: 'physical',
    entities: () => PHYSICAL_FACTS,
    make: (rng, x) => ({
      tier: x.tier,
      category: x.category,
      prompt: x.prompt,
      media: null,
      answer: x.answer,
      choices: buildChoices(rng, {
        answer: x.answer,
        candidates: shuffle(rng, POOLS[x.pool].filter((v) => v !== x.answer)),
      }),
      explanation: `${x.clue}: ${x.answer}.`,
      card: { front: x.prompt, back: x.answer, hint: null },
      clue: { text: x.clue, response: `What is ${x.answer}?` },
    }),
  },
];

function entityKey(entity) {
  return entity.code ?? entity.abbr ?? entity.id;
}

/**
 * Every question the selected topics and tiers can produce, as lightweight
 * references. Cheap to compute, so the UI can show an honest question count
 * before a round starts.
 */
export function listQuestionRefs({ topics = TOPICS.map((t) => t.id), tiers = [1, 2, 3] } = {}) {
  const topicSet = new Set(topics);
  const tierSet = new Set(tiers);
  const refs = [];

  for (const template of TEMPLATES) {
    if (!topicSet.has(template.topic)) continue;
    for (const entity of template.entities()) {
      if (template.applies && !template.applies(entity)) continue;
      // continent-of-country shifts tier down, so ask the template where it lands.
      const tier = template.id === 'continent-of-country'
        ? Math.max(1, entity.tier - 1)
        : entity.tier;
      if (!tierSet.has(tier)) continue;
      refs.push({ template, entity, tier });
    }
  }
  return refs;
}

function materialize(rng, { template, entity }) {
  const spec = template.make(rng, entity);
  return {
    id: `${template.id}:${entityKey(entity)}`,
    template: template.id,
    topic: template.topic,
    choiceStyle: 'text',
    note: entity.note ?? null,
    ...spec,
  };
}

/**
 * Draw a round's worth of questions.
 *
 * Two entities can produce near-duplicate questions in one round (asking for
 * the capital of France and then which country Paris is the capital of, back to
 * back), so each entity is used at most once per round unless the pool is too
 * small to fill the round otherwise.
 */
export function generateQuestions({
  rng,
  topics,
  tiers,
  count = 12,
} = {}) {
  const refs = shuffle(rng, listQuestionRefs({ topics, tiers }));

  const usedEntities = new Set();
  const primary = [];
  const leftovers = [];

  for (const ref of refs) {
    const key = `${ref.template.topic}:${entityKey(ref.entity)}`;
    if (usedEntities.has(key)) {
      leftovers.push(ref);
      continue;
    }
    usedEntities.add(key);
    primary.push(ref);
  }

  return [...primary, ...leftovers]
    .slice(0, count)
    .map((ref) => materialize(rng, ref));
}

export function countAvailable(options) {
  return listQuestionRefs(options).length;
}
