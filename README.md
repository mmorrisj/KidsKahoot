# Kids Quiz Quest

A Kahoot-style quiz game for kids, aimed at roughly ages 8–12. Everyone plays on
one device and passes it around. No accounts, no server, no build step — open it
and play.

**Geography is the only subject so far**, but the name is deliberately not tied
to it: math and history are the intended next ones, and nothing in the engine
is geography-specific. See *Adding a subject* below for where the seam is.

Geography content is split into three curricula so a kid studying Virginia
Studies is not quizzed on the capital of Uzbekistan:

| Curriculum | Topics | Questions |
| --- | --- | --- |
| **Virginia** | the five regions, cities & historic places, rivers & borders | 175 |
| **United States** | state capitals, name-the-state, regions, abbreviations, landforms, landmarks | 338 |
| **World** | capitals, flags, continents, physical geography | 739 |

Virginia is the default, and each curriculum can be switched on independently.

Virginia questions can be answered on **an actual map of Virginia** instead of
four tiles — see below.

## Running it

```sh
npm start           # http://localhost:8080, no dependencies needed
```

ES modules do not load over `file://`, so the page has to be served rather than
double-clicked. It deploys to GitHub Pages as-is.

`npm start` runs `scripts/serve.mjs`, a twenty-line static server whose only
distinguishing feature is that it sends `Cache-Control: no-store`. Browsers
cache ES modules aggressively, and a plain static server lets them: pull a
change, reload, and you can still be looking at the previous version of the app
with nothing to tell you it is stale. **If the app ever seems to be missing a
feature you know landed, that is the first thing to suspect** — a hard reload
(Ctrl/Cmd-Shift-R) clears it.

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

Data rows currently yield **1,202 questions**. Hand-authoring that many is where
a project like this dies, so nothing is hand-authored.

Every generated question carries all of its forms at once — `prompt` + `choices`
for multiple choice, `card` for flash cards, `clue` for Jeopardy. A new game mode
renders a different field of the same object; it does not need new content.

### Wrong answers are chosen, not random

A distractor only teaches something if a kid could believe it. Two rules:

- **Stay in the neighborhood.** Wrong capitals come from the same continent,
  wrong state capitals from the same US region, and wrong Virginia places from
  the same Virginia region. Postal abbreviations compete with same-letter
  abbreviations, because MI/MN/MO/MS/MT is exactly the set kids confuse.
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
    virginia.js        five regions, 39 placed localities, rivers, borders
    virginia-map.js    GENERATED — outline, region shapes, neighbouring states
    world-map.js       GENERATED — continent shapes and a pin per country
    us-states.js       all 50 states: capital, region, abbreviation, traps
    us-map.js          GENERATED — all 50 state shapes, AK/HI in inset boxes
    us-geography.js    US rivers, mountains, Great Lakes, landmarks, parks
    countries.js       140 countries: capital, continent, flag, tier, traps
    world-geography.js world rivers, mountains, deserts, oceans, landmarks
    continents.js
  lib/
    generator.js       templates that turn data rows into questions
    session.js         queue, turn order, scoring, re-queueing (no DOM)
    rng.js             seeded RNG, so a round can be replayed exactly
  modes/
    multiple-choice.js the Kahoot-shaped mode, tiles or map
  ui/
    dom.js
    map.js             the Virginia map as an answer surface
    us-map.js          the US map as question media (one state highlighted)
    world-locator.js   the world map shown in the feedback panel
scripts/
  lib/geo.mjs              shared dissolve / project / simplify helpers
  build-virginia-map.mjs   generates the Virginia region map (run by hand)
  build-us-map.mjs         generates the US state-shapes map (run by hand)
  build-world-map.mjs      generates the world map (run by hand)
  map-preview.html         eyeball the Virginia map while tuning boundaries
  world-preview.html       eyeball the world map and every country pin
test/
  data.test.js         dataset integrity
  generator.test.js    the answer is always present, distractors are plausible
  session.test.js      scoring, streaks, re-queueing, turn rotation
  virginia-map.test.js the generated map matches the regions the quiz asks about
  us-map.test.js       the generated US map covers exactly the fifty states
  world-map.test.js    every country has a pin, and Oceania is not split in two
  ui-smoke.mjs         plays a full two-player round in a real browser
```

## A note on Virginia content

The five regions, the Fall Line, the four rivers feeding the Chesapeake Bay, and
the bordering states follow what Virginia Studies covers.

One deliberate omission: **Richmond, Fredericksburg, Alexandria, and Petersburg
are never asked "which region are you in".** All four grew up *on* the Fall Line,
and classroom materials disagree about which region to put them in, so the game
does not pick a side — the Fall Line gets its own questions instead. Those four
rows carry a `fallLine` flag, and a test asserts the region question skips them.

## Showing where a place is

World questions about a country end with a small world map in the feedback
panel: the country's continent lit up, a pin on the country, and a caption. Ask
*which continent is Tanzania on*, and the answer is not just the word "Africa" —
it is Africa, with Tanzania on it.

It appears **only after the answer is in**, and a test enforces that. Showing it
alongside the question would answer a continent question outright.

The map is Equal Earth rather than the Mercator most classrooms still hang on
the wall. Mercator makes Greenland look the size of Africa, which is exactly the
misconception a geography game should not be reinforcing.

Two details the build handles that are easy to get wrong:

- **The dateline.** Samoa and Tonga sit just east of the antimeridian, so a
  Greenwich-centred map strands them on the far *left* edge, an ocean away from
  the Oceania they belong to. The map is cut at 170°W instead — open Pacific —
  so Oceania stays in one piece.
- **Antarctica wraps the globe**, so it crosses every possible seam. Geometry
  that straddles the cut is split rather than dropped; an earlier build silently
  reduced Antarctica to a 122-character sliver, which a test now catches.

Continents are dissolved using *this project's* continent for each country
rather than the source data's, wherever the two disagree — otherwise the game
could say Cyprus is in Europe and then light up Asia. The build point-tests
every country pin against the continent the quiz claims for it.

## Answering on the map

Virginia questions come in two surfaces, chosen with a setting on the setup
screen: four coloured tiles, or the map. Map questions come in three kinds.

| Kind | Example | What you tap |
| --- | --- | --- |
| Region | *Find the Valley and Ridge region and tap it* | one of the five regions |
| Region of a place | *Which region is Roanoke in? Tap it on the map* | one of the five regions |
| Place | *Tap Richmond on the map* | one of four pins |
| Border state | *Tap Tennessee on the map* | one of the five neighbouring states |

Three things about how they behave are deliberate:

- **Nothing is labelled while the question is live.** Labelling the regions
  would turn "find the Valley and Ridge" into reading, which is the skill the
  map exists to avoid testing. Names and a colour legend appear with the
  feedback, which is also when a kid is most likely to read them.
- **For "which region is Roanoke in", the pin is held back until the answer is
  in.** Showing it up front would reduce the question to "which colour is this
  dot on". Afterwards the pin drops, so a miss still teaches where Roanoke is.
- **Small regions win contested taps.** The Blue Ridge is a few miles wide in
  northern Virginia — about four pixels on a phone. Every region gets an
  invisible fat-stroked copy of itself as a tap target, stacked smallest last,
  so a tap near the Blue Ridge lands on the Blue Ridge rather than on the
  Piedmont, which is five times its size and impossible to miss anyway.

Pins get the same treatment in the generator: a "tap the place" question picks
pins that are at least 90 map units apart, because two pins closer than their
own tap targets overlap and the covered one cannot be pressed at all. Norfolk,
Portsmouth, and Chesapeake are a few miles from each other, and a test keeps
that separation above the pin size used by the renderer.

Region and pin questions crop the map to Virginia; only border questions frame
the neighbouring states, which is worth about a third more map on a phone.

## The Virginia region map

`src/data/virginia-map.js` is generated, not written. It holds the Virginia
outline plus the five region shapes as inline SVG paths, about 9 kB total, with
no runtime dependency on anything.

```sh
npm install                            # polygon-clipping, build-time only
node scripts/build-virginia-map.mjs    # writes src/data/virginia-map.js
node scripts/build-world-map.mjs       # writes src/data/world-map.js
npm start                              # then open /scripts/map-preview.html
```

The state outline is the union of real county polygons from the US Census
cartographic boundary files (public domain), which is what gives the Eastern
Shore, the Chesapeake, and the southwest tail their correct shapes.

The five regions are **not** built by grouping counties. That approach fails for
the Blue Ridge: in northern Virginia it is a ridge a few miles wide, so no county
there sits entirely inside it, and a county map would erase the region exactly
where a kid is asked to point at it. Instead the outline is sliced by four
boundary polylines, which is also how the maps in Virginia Studies materials are
drawn.

Those polylines are the one hand-placed thing in the pipeline, so the build
checks them: **every** place in `virginia.js` that has a region is point-tested
against the sliced shapes, and the build fails if any lands in the wrong one, so
the map and the answers cannot drift apart. That check caught two real errors —
a plateau boundary drawn northwest of Wise and Norton, and a Blue Ridge boundary
that put Mount Rogers in the valley.

## The US state-shapes map

The **Name the State** topic shows the whole country with one state lit up and
asks which one it is. Unlike the Virginia map this one is question *media*, not
an answer surface — the answer goes in on the four tiles, so nothing on it is
tappable and nothing is labelled (naming any state would hand over a process of
elimination).

`src/data/us-map.js` is generated by `scripts/build-us-map.mjs` from the same
census county cache, dissolved into the fifty states — about 35 kB of paths.
The lower 48 use an Albers equal-area projection, the curved classroom-map
shape, because this topic exists for shape recognition and equirectangular
distorts the northern states. Alaska and Hawaii sit in framed inset boxes below,
not to scale, as on classroom maps. Rhode Island, Connecticut, and Delaware are
too small to see when highlighted, so states under a size threshold get a dashed
ring drawn around them. The build fails if the fifty shapes stop matching the
fifty rows in `us-states.js`.

## Adding content

Add a row to `src/data/countries.js` and every template picks it up
automatically — no other file changes. Same for `us-states.js` and the Virginia
places. One-off facts that do not fit a relational shape (longest river, tallest
mountain, which state a landmark is in) go in the matching `*-geography.js` or
`virginia.js` fact list, with a `pool` that wrong answers are drawn from.

`npm test` checks new rows for missing fields, bad continents or regions,
duplicate ids, pools too small to fill four choices, answers missing from their
own pool, and traps that accidentally name the correct answer.

## Adding a subject

Nothing outside `src/data/` knows what geography is. The generator turns data
rows into questions through templates; the session engine counts points; the
modes render whatever a question carries. A times-tables or key-dates subject
would be new data plus new templates, and no change to any of that machinery.

The one piece that would need a decision is the setup screen. Today it has two
levels — **curriculum** (Virginia, United States, World) and **topic** (State
Capitals, Flags, …) — and `TOPICS` carries a `curriculum` field. Subjects want a
third level above curriculum, so `Geography → United States → State Capitals`
sits alongside `Maths → Times Tables → Sevens`. That is a field on `TOPICS`, a
filter in `listQuestionRefs`, and one more row of chips; it is deliberately not
built yet, because guessing at the shape of a subject that does not exist is how
you get an abstraction that fits nothing.

Two things already generalise for free: the tier system (warm-up / school level
/ expert) is subject-agnostic, and so is every question's `card` and `clue`, so
flash cards and a Jeopardy board would work on math the day they exist.

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
- **Rivers on the map** — the four rivers feeding the Chesapeake are taught as
  lines, and tapping them needs river geometry the county data does not carry.
- **Tapping the US map** — the state shapes now exist (`us-map.js`), but only as
  media; "tap Virginia" and "tap the state north of Georgia" would need the US
  map wired up as an answer surface the way the Virginia map is.
- **Progress that survives a reload** — which questions a given kid keeps
  missing, across sessions rather than within one round.
- **A second subject** — math or history, which is what the name leaves room
  for. See *Adding a subject* above.
