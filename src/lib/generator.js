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
 *
 * Content is grouped into three curricula — Virginia, United States, World — so
 * a kid studying Virginia Studies is not quizzed on the capital of Uzbekistan.
 */
import { COUNTRIES } from '../data/countries.js';
import { US_STATES } from '../data/us-states.js';
import { WORLD_FACTS, WORLD_POOLS } from '../data/world-geography.js';
import { US_FACTS, US_POOLS, US_REGIONS } from '../data/us-geography.js';
import { VA_FACTS, VA_PLACES, VA_POOLS, VA_REGIONS } from '../data/virginia.js';
import { CONTINENTS } from '../data/continents.js';
import { shuffle, sample } from './rng.js';

export const CHOICE_COUNT = 4;

export const CURRICULA = [
  {
    id: 'virginia',
    label: 'Virginia',
    icon: '🏛️',
    blurb: 'Regions, rivers, and places close to home',
  },
  {
    id: 'united-states',
    label: 'United States',
    icon: '🇺🇸',
    blurb: 'States, capitals, landforms, and landmarks',
  },
  {
    id: 'world',
    label: 'World',
    icon: '🌍',
    blurb: 'Countries, flags, and continents',
  },
];

export const TOPICS = [
  // Virginia
  { id: 'va-regions', curriculum: 'virginia', label: 'The Five Regions', icon: '🗺️' },
  { id: 'va-places', curriculum: 'virginia', label: 'Cities & Historic Places', icon: '🏘️' },
  { id: 'va-water', curriculum: 'virginia', label: 'Rivers, Bay & Borders', icon: '🌊' },

  // United States
  { id: 'us-capitals', curriculum: 'united-states', label: 'State Capitals', icon: '⭐' },
  { id: 'us-regions', curriculum: 'united-states', label: 'Regions of the US', icon: '🧭' },
  { id: 'us-abbreviations', curriculum: 'united-states', label: 'State Abbreviations', icon: '✉️' },
  { id: 'us-physical', curriculum: 'united-states', label: 'Rivers, Mountains & Lakes', icon: '🏔️' },
  { id: 'us-landmarks', curriculum: 'united-states', label: 'Landmarks & Parks', icon: '🗽' },

  // World
  { id: 'world-capitals', curriculum: 'world', label: 'World Capitals', icon: '🏛️' },
  { id: 'flags', curriculum: 'world', label: 'Flags', icon: '🚩' },
  { id: 'continents', curriculum: 'world', label: 'Continents', icon: '🌍' },
  { id: 'world-physical', curriculum: 'world', label: 'Rivers, Mountains & Landmarks', icon: '🏔️' },
];

export const TIERS = [
  { id: 1, label: 'Warm-up', blurb: 'The ones that come up first in class' },
  { id: 2, label: 'School level', blurb: 'The ones that show up on tests' },
  { id: 3, label: 'Expert', blurb: 'For when tier 2 got too easy' },
];

export const topicsIn = (curriculumId) => TOPICS.filter((t) => t.curriculum === curriculumId);

/**
 * Order candidates so the ones nearest the answer come first. "Near" means the
 * same continent, US region, or Virginia region — a wrong answer is only worth
 * offering if a kid could plausibly believe it.
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
 * Fact rows (rivers, landmarks, superlatives) all have the same shape, so the
 * three fact datasets share one template body.
 */
function factTemplate({ id, dataset, topic, facts, pools, applies }) {
  return {
    id,
    dataset,
    topic,
    applies,
    entities: () => facts,
    tierOf: (x) => x.tier,
    make: (rng, x) => ({
      category: x.category,
      prompt: x.prompt,
      media: null,
      answer: x.answer,
      choices: buildChoices(rng, {
        answer: x.answer,
        candidates: shuffle(rng, pools[x.pool].filter((v) => v !== x.answer)),
      }),
      explanation: `${x.clue}: ${x.answer}.`,
      card: { front: x.prompt, back: x.answer, hint: null },
      clue: { text: x.clue, response: `What is ${x.answer}?` },
    }),
  };
}

/**
 * The template registry. Each template turns one data row into one question;
 * `make` receives the rng so distractor choice is seeded too.
 *
 * `dataset` namespaces the de-duplication key. It has to: Virginia's postal
 * abbreviation and Vatican City's ISO code are both "VA".
 */
const TEMPLATES = [
  // ------------------------------------------------------------- Virginia
  {
    id: 'va-region-of-place',
    dataset: 'va-places',
    topic: 'va-regions',
    entities: () => VA_PLACES,
    // Fall Line cities are taught as being *on* the line rather than in a
    // region, so they are never asked this way.
    applies: (x) => !x.fallLine,
    tierOf: (x) => x.tier,
    make: (rng, x) => ({
      category: 'Virginia Regions',
      prompt: `Which region of Virginia is ${x.name} in?`,
      media: null,
      answer: x.region,
      choices: buildChoices(rng, {
        answer: x.region,
        candidates: shuffle(rng, VA_POOLS.regions.filter((r) => r !== x.region)),
      }),
      explanation: `${x.name} is in the ${x.region} region.`,
      card: { front: `Which region is ${x.name} in?`, back: x.region, hint: null },
      clue: { text: `${x.name} is in this region of Virginia`, response: `What is the ${x.region}?` },
    }),
  },
  {
    id: 'va-place-from-claim',
    dataset: 'va-places',
    topic: 'va-places',
    entities: () => VA_PLACES,
    applies: (x) => Boolean(x.claim),
    tierOf: (x) => x.tier,
    make: (rng, x) => ({
      category: 'Virginia Places',
      prompt: `Which Virginia place ${x.claim}?`,
      media: null,
      answer: x.name,
      choices: buildChoices(rng, {
        answer: x.name,
        candidates: neighborsFirst(rng, x, VA_PLACES, 'region', 'name'),
      }),
      explanation: `${x.name} ${x.claim}.`,
      card: { front: `Which Virginia place ${x.claim}?`, back: x.name, hint: null },
      clue: { text: `This Virginia place ${x.claim}`, response: `What is ${x.name}?` },
    }),
  },
  {
    id: 'va-region-from-clue',
    dataset: 'va-regions',
    topic: 'va-regions',
    entities: () => VA_REGIONS,
    tierOf: (x) => x.tier,
    make: (rng, x) => ({
      category: 'Virginia Regions',
      prompt: `Which region of Virginia is ${x.clue}?`,
      media: null,
      answer: x.short,
      choices: buildChoices(rng, {
        answer: x.short,
        candidates: shuffle(rng, VA_POOLS.regions.filter((r) => r !== x.short)),
      }),
      explanation: `The ${x.short} region is ${x.clue}.`,
      card: { front: `Which region is ${x.clue}?`, back: x.short, hint: null },
      clue: { text: `This Virginia region is ${x.clue}`, response: `What is the ${x.short}?` },
    }),
  },
  {
    id: 'va-place-in-region',
    dataset: 'va-regions-reverse',
    topic: 'va-regions',
    entities: () => VA_REGIONS,
    tierOf: (x) => Math.min(3, x.tier + 1),
    make: (rng, x) => {
      const inRegion = VA_PLACES.filter((p) => p.region === x.short);
      const elsewhere = VA_PLACES.filter((p) => !p.fallLine && p.region !== x.short);
      const answer = sample(rng, inRegion, 1)[0].name;
      return {
        category: 'Virginia Regions',
        prompt: `Which of these places is in the ${x.short} region?`,
        media: null,
        answer,
        choices: buildChoices(rng, {
          answer,
          candidates: shuffle(rng, elsewhere.map((p) => p.name)),
        }),
        explanation: `${answer} is in the ${x.short} region.`,
        card: { front: `Name a place in the ${x.short} region`, back: answer, hint: null },
        clue: { text: `This place is in Virginia’s ${x.short} region`, response: `What is ${answer}?` },
      };
    },
  },
  factTemplate({
    id: 'va-fact',
    dataset: 'va-facts',
    facts: VA_FACTS,
    pools: VA_POOLS,
    topic: (x) => (x.category === 'Virginia Cities' ? 'va-places'
      : x.category === 'Virginia Regions' ? 'va-regions'
        : 'va-water'),
  }),

  // -------------------------------------------------------- United States
  {
    id: 'capital-of-state',
    dataset: 'us-states',
    topic: 'us-capitals',
    entities: () => US_STATES,
    tierOf: (x) => x.tier,
    make: (rng, x) => ({
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
    dataset: 'us-states',
    topic: 'us-capitals',
    entities: () => US_STATES,
    tierOf: (x) => x.tier,
    make: (rng, x) => ({
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
    id: 'region-of-state',
    dataset: 'us-states-region',
    topic: 'us-regions',
    entities: () => US_STATES,
    // Placing a state in a region is easier than naming its capital.
    tierOf: (x) => Math.max(1, x.tier - 1),
    make: (rng, x) => ({
      category: 'US Regions',
      prompt: `Which region of the United States is ${x.name} in?`,
      media: null,
      answer: x.region,
      choices: buildChoices(rng, {
        answer: x.region,
        candidates: shuffle(rng, US_REGIONS.filter((r) => r !== x.region)),
      }),
      explanation: `${x.name} is in the ${x.region}.`,
      card: { front: `Which region is ${x.name} in?`, back: x.region, hint: null },
      clue: { text: `${x.name} is in this region`, response: `What is the ${x.region}?` },
    }),
  },
  {
    id: 'abbreviation-of-state',
    dataset: 'us-states-abbr',
    topic: 'us-abbreviations',
    entities: () => US_STATES,
    tierOf: (x) => x.tier,
    make: (rng, x) => ({
      category: 'Abbreviations',
      prompt: `What is the postal abbreviation for ${x.name}?`,
      media: null,
      answer: x.abbr,
      choices: buildChoices(rng, {
        answer: x.abbr,
        // Same first letter first: MI, MN, MO, MS, MT are the ones kids mix up.
        candidates: neighborsFirst(rng, x, US_STATES, 'firstLetter', 'abbr'),
      }),
      explanation: `${x.abbr} is the postal abbreviation for ${x.name}.`,
      card: { front: `Abbreviation for ${x.name}`, back: x.abbr, hint: null },
      clue: { text: `${x.name} is abbreviated this way`, response: `What is ${x.abbr}?` },
    }),
  },
  {
    id: 'state-of-abbreviation',
    dataset: 'us-states-abbr-reverse',
    topic: 'us-abbreviations',
    entities: () => US_STATES,
    tierOf: (x) => x.tier,
    make: (rng, x) => ({
      category: 'Abbreviations',
      prompt: `Which state is abbreviated ${x.abbr}?`,
      media: null,
      answer: x.name,
      choices: buildChoices(rng, {
        answer: x.name,
        candidates: neighborsFirst(rng, x, US_STATES, 'firstLetter', 'name'),
      }),
      explanation: `${x.abbr} is the postal abbreviation for ${x.name}.`,
      card: { front: x.abbr, back: x.name, hint: null },
      clue: { text: `This state is abbreviated ${x.abbr}`, response: `What is ${x.name}?` },
    }),
  },
  factTemplate({
    id: 'us-physical-fact',
    dataset: 'us-facts',
    topic: 'us-physical',
    facts: US_FACTS,
    pools: US_POOLS,
    applies: (x) => x.category !== 'Landmarks',
  }),
  factTemplate({
    id: 'us-landmark-fact',
    dataset: 'us-facts',
    topic: 'us-landmarks',
    facts: US_FACTS,
    pools: US_POOLS,
    applies: (x) => x.category === 'Landmarks',
  }),

  // ------------------------------------------------------------------ World
  {
    id: 'capital-of-country',
    dataset: 'countries',
    topic: 'world-capitals',
    entities: () => COUNTRIES,
    // Singapore, Monaco, and Vatican City share a name with their capital,
    // which makes the question answer itself.
    applies: (x) => x.capital !== x.name,
    tierOf: (x) => x.tier,
    make: (rng, x) => ({
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
      clue: { text: `This city is the capital of ${x.name}`, response: `What is ${x.capital}?` },
    }),
  },
  {
    id: 'country-of-capital',
    dataset: 'countries',
    topic: 'world-capitals',
    entities: () => COUNTRIES,
    applies: (x) => x.capital !== x.name,
    tierOf: (x) => x.tier,
    make: (rng, x) => ({
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
      clue: { text: `The capital of this country is ${x.capital}`, response: `What is ${x.name}?` },
    }),
  },
  {
    id: 'flag-to-country',
    dataset: 'countries-flags',
    topic: 'flags',
    entities: () => COUNTRIES,
    tierOf: (x) => x.tier,
    make: (rng, x) => ({
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
    dataset: 'countries-flags',
    topic: 'flags',
    entities: () => COUNTRIES,
    tierOf: (x) => x.tier,
    make: (rng, x) => ({
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
    dataset: 'countries-continents',
    topic: 'continents',
    entities: () => COUNTRIES,
    // Placing a country on a continent is easier than naming its capital.
    tierOf: (x) => Math.max(1, x.tier - 1),
    make: (rng, x) => ({
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
  factTemplate({
    id: 'world-fact',
    dataset: 'world-facts',
    topic: 'world-physical',
    facts: WORLD_FACTS,
    pools: WORLD_POOLS,
  }),
];

const ALL_TOPIC_IDS = TOPICS.map((t) => t.id);

function entityKey(entity) {
  return entity.code ?? entity.abbr ?? entity.id ?? entity.name ?? entity.short;
}

const topicOf = (template, entity) =>
  (typeof template.topic === 'function' ? template.topic(entity) : template.topic);

/**
 * Every question the selected topics and tiers can produce, as lightweight
 * references. Cheap to compute, so the UI can show an honest question count
 * before a round starts.
 */
export function listQuestionRefs({ topics = ALL_TOPIC_IDS, tiers = [1, 2, 3] } = {}) {
  const topicSet = new Set(topics);
  const tierSet = new Set(tiers);
  const refs = [];

  for (const template of TEMPLATES) {
    for (const entity of template.entities()) {
      if (template.applies && !template.applies(entity)) continue;
      if (!topicSet.has(topicOf(template, entity))) continue;
      const tier = template.tierOf(entity);
      if (!tierSet.has(tier)) continue;
      refs.push({ template, entity, tier });
    }
  }
  return refs;
}

function materialize(rng, { template, entity, tier }) {
  return {
    id: `${template.id}:${entityKey(entity)}`,
    template: template.id,
    topic: topicOf(template, entity),
    curriculum: TOPICS.find((t) => t.id === topicOf(template, entity))?.curriculum,
    tier,
    choiceStyle: 'text',
    note: entity.note ?? null,
    ...template.make(rng, entity),
  };
}

/**
 * Draw a round's worth of questions.
 *
 * Two templates over the same row can produce near-duplicate questions in one
 * round (the capital of France, then which country Paris is the capital of), so
 * each row is used at most once per round unless the pool is too small to fill
 * the round otherwise.
 */
export function generateQuestions({ rng, topics, tiers, count = 10 } = {}) {
  const refs = shuffle(rng, listQuestionRefs({ topics, tiers }));

  const usedRows = new Set();
  const primary = [];
  const leftovers = [];

  for (const ref of refs) {
    const key = `${ref.template.dataset}:${entityKey(ref.entity)}`;
    if (usedRows.has(key)) {
      leftovers.push(ref);
      continue;
    }
    usedRows.add(key);
    primary.push(ref);
  }

  return [...primary, ...leftovers]
    .slice(0, count)
    .map((ref) => materialize(rng, ref));
}

export function countAvailable(options) {
  return listQuestionRefs(options).length;
}
