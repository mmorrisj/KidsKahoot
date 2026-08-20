# Geography Quest

A Kahoot-style geography game for kids, aimed at roughly ages 8–12. Everyone
plays on one device and passes it around. No accounts, no server, no build step
— open it and play.

## Running it

```sh
npm start           # serves the folder at http://localhost:8080
```

Any static file server works. ES modules do not load over `file://`, so the page
has to be served rather than double-clicked. It deploys to GitHub Pages as-is.

```sh
npm test            # unit tests, no dependencies needed
npm run test:ui     # browser smoke test, needs `npm install` and a running server
```

## The idea

Questions are **generated from data, not written by hand**. Geography is mostly
relational facts — `France / Paris / Europe / 🇫🇷` — and one such row can be
asked about in half a dozen ways:

| Asked as | Question |
| --- | --- |
| forward | What is the capital of France? |
| reverse | Paris is the capital of which country? |
| flag → name | Which country flies this flag? |
| name → flag | Which flag belongs to France? |
| placement | Which continent is France on? |
| flash card | France 🇫🇷 → Paris |
| Jeopardy clue | *This city is the capital of France* → What is Paris? |

240 rows of data currently yield **845 questions**. Hand-authoring that many is
where a project like this dies, so nothing is hand-authored.

Every generated question carries all of its forms at once — `prompt` + `choices`
for multiple choice, `card` for flash cards, `clue` for Jeopardy. A new game mode
renders a different field of the same object; it does not need new content.

### Wrong answers are chosen, not random

A distractor only teaches something if a kid could believe it. Two rules:

- **Stay in the neighborhood.** Wrong capitals come from the same continent, and
  wrong state capitals from the same region. Capitals never compete with country
  names.
- **Prefer the famous mistake.** Each row lists the cities kids actually guess —
  Sydney for Australia, Istanbul for Turkey, Lagos for Nigeria, Chicago for
  Illinois. The generator offers those first, and the explanation calls out why
  they are wrong.

### Scoring choices that differ from Kahoot

- **Answering fast can only add points, never subtract them,** and only if a
  timer is switched on at all. Kahoot's faster-is-worth-more scoring means the
  slowest reader always loses, which is the kid who most needs to stay in it.
  Timers default to off.
- **Missed questions come back** later in the same round, worth half points.
  Getting something wrong once and never seeing it again teaches nothing.
- **Every wrong answer explains itself**, and rows with something interesting to
  say get an extra line ("South Africa has three capitals!").

## Layout

```
index.html
src/
  app.js               setup and results screens, routing
  styles.css
  data/
    countries.js       140 countries: capital, continent, flag, tier, traps
    us-states.js       all 50 states and capitals, by region
    physical.js        rivers, mountains, deserts, oceans, landmarks
    continents.js
  lib/
    generator.js       templates that turn data rows into questions
    session.js         queue, turn order, scoring, re-queueing (no DOM)
    rng.js             seeded RNG, so a round can be replayed exactly
  modes/
    multiple-choice.js the Kahoot-shaped mode
  ui/dom.js
test/
  data.test.js         dataset integrity
  generator.test.js    the answer is always present, distractors are plausible
  session.test.js      scoring, streaks, re-queueing, turn rotation
  ui-smoke.mjs         plays a full two-player round in a real browser
```

## Adding content

Add a row to `src/data/countries.js` and every template picks it up
automatically — no other file changes. Same for `us-states.js`. One-off facts
that do not fit the country shape (longest river, tallest mountain) go in
`physical.js` with a `pool` that wrong answers are drawn from.

`npm test` checks new rows for missing fields, bad continents, duplicate codes,
and traps that accidentally name the correct answer.

## Adding a game mode

A mode is a function that takes a session and renders it:

```js
runMultipleChoice({ mount, session, onFinish });
```

`src/lib/session.js` already handles the queue, turn rotation, scoring, and
re-queueing, and every question already carries `card` and `clue`. A flash-card
mode reads `question.card`; a Jeopardy board reads `question.clue` and groups by
`question.category`.

## Not built yet

- **Flash-card mode** — `question.card` is already generated for every question.
- **Reverse Jeopardy board** — a 5×6 grid of categories × point values, with
  `question.clue` and `question.tier` mapping onto the tile values. This is the
  best mode for mixed ages: put tier-1 questions in the cheap row and tier-3 in
  the expensive one, and a 7-year-old and an 11-year-old can share a board.
- **Map mode** — click the country on an outline map. Needs SVG map data, which
  is the one thing here that cannot be generated from a text row.
- **Progress that survives a reload** — which questions a given kid keeps
  missing, across sessions rather than within one round.
