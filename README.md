# Kids Quiz Quest

A Kahoot-style quiz game for kids, aimed at roughly ages 8–12. Play on one
device and pass it around, or host a live game that everyone joins from their
own phone or tablet. No accounts, no build step.

Content is organised as **subject → curriculum → topic**, so a kid studying
Virginia Studies is not quizzed on the capital of Uzbekistan, and a times-tables
round is not interrupted by flags:

| Subject | Curriculum | Topics |
| --- | --- | --- |
| **Geography** | Virginia | the five regions, cities & historic places, rivers & borders |
| | United States | state capitals, name-the-state, regions, abbreviations, landforms, landmarks |
| | World | capitals, flags, continents, physical geography |
| **Math** | Number Facts | times tables, division, adding, taking away |
| | Carrying & Borrowing | two-digit adding and subtracting |

Roughly 6,900 questions in total. Virginia is the default, and every level can
be switched on independently.

Virginia questions can be answered on **an actual map of Virginia**, and US
questions on **a map of the whole country**, instead of four tiles — see below.

## Running it

```sh
npm install
npm start           # the game server, at http://localhost:8080
```

Other devices on the same network reach it at `http://<your-ip>:8080`. The
node server (Node 22.5+) does three jobs: static files, the WebSocket hub for
live games, and the all-time leaderboard.

Solo pass-the-device play needs none of that — any static file server works
(ES modules do not load over `file://`), and it deploys to GitHub Pages as-is;
only hosting live games and the leaderboard require the real server.

`server.mjs` serves everything `Cache-Control: no-store`. Browsers cache ES
modules aggressively, and without that header you can pull a change, reload, and
still be looking at the previous version of the app with nothing to say it is
stale. **If a feature you know landed seems to be missing, suspect that first**
— a hard reload (Ctrl/Cmd-Shift-R) clears it. Static hosts will not set it, so
the same caution applies on GitHub Pages.

```sh
npm test            # unit tests, no browser needed
npm run test:ui     # browser smoke test, needs `npm install` and `npm start` running
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

Data rows currently yield **1,352 questions**. Hand-authoring that many is where
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
server.mjs             static files + WebSocket hub + leaderboard API
server/
  live.js              rooms, joining, and the live question loop (transport-free)
  stats.js             all-time player tracking, SQLite via node:sqlite
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
    math.js            computed fact sets, and the mistakes kids make on them
  lib/
    generator.js       templates that turn data rows into questions
    session.js         queue, turn order, scoring, re-queueing (no DOM)
    rng.js             seeded RNG, so a round can be replayed exactly
    net.js             WebSocket client for live games
  modes/
    multiple-choice.js the Kahoot-shaped mode, tiles or map
    live.js            host and join flows for games across devices
  ui/
    dom.js
    map.js             the Virginia map as an answer surface
    number-pad.js      typing a numeric answer, for math
    us-map.js          the US map as question media (one state highlighted)
    flag.js            flags as images — emoji flags don't render everywhere
    world-locator.js   the world map shown in the feedback panel
  assets/
    flags/             one SVG per country (fetched once, committed)
scripts/
  lib/geo.mjs              shared dissolve / project / simplify helpers
  build-virginia-map.mjs   generates the Virginia region map (run by hand)
  build-us-map.mjs         generates the US state-shapes map (run by hand)
  build-world-map.mjs      generates the world map (run by hand)
  fetch-flags.mjs          downloads flag SVGs for countries.js (run by hand)
  map-preview.html         eyeball the Virginia map while tuning boundaries
  world-preview.html       eyeball the world map and every country pin
test/
  data.test.js         dataset integrity
  generator.test.js    the answer is always present, distractors are plausible
  session.test.js      scoring, streaks, re-queueing, turn rotation
  virginia-map.test.js the generated map matches the regions the quiz asks about
  us-map.test.js       the generated US map covers exactly the fifty states
  world-map.test.js    every country has a pin, and Oceania is not split in two
  math.test.js         answers re-derived independently, slips offered and named
  live.test.js         whole live games against the hub, plus the leaderboard
  ui-smoke.mjs         full rounds in a real browser, incl. a three-device live game
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

## Math

Math breaks an assumption the geography content never tested, and the fix is
worth understanding before adding to it.

**The facts are computed, not typed.** Geography is a finite set you write out —
140 countries, 50 states. Arithmetic looks like the opposite, an infinite space
where 7 × 8 is worked out rather than looked up. But the times tables from 2 to
12 are exactly 121 facts, so `src/data/math.js` *enumerates* them. That keeps
everything the engine gives geography for free: no repeats inside a round, an
honest question count before you start, a round that replays identically from
its seed, and the missed-question requeue. Generating problems on the fly would
break all four.

**Wrong answers are the mistakes kids actually make.** This matters more here
than in geography, because a kid can rule out a random number by estimating.
Every distractor is a real slip and carries the explanation of *which* slip, so
a wrong answer is met with what went wrong rather than just "no":

| Question | Offered | Because |
| --- | --- | --- |
| 7 × 8 | 49, 63 | the rows either side of it in the table |
| 27 + 15 | 32 | the ten never got carried |
| 27 + 15 | 312 | the two column answers written side by side |
| 52 − 27 | 35 | the smaller digit taken from the larger in each column |

That last one is the single most common subtraction error in elementary school.
A kid who types it is told about the borrow.

About forty of the smallest facts — 2 × 2, 21 − 16 — have fewer than three
distinct mistakes available, so the list is topped up with near-misses. Those
carry no explanation on purpose: inventing a reason for a number we picked
arbitrarily would be teaching something untrue.

**Answers are typed, not chosen.** Math questions put up a number pad instead of
four tiles. Four options let a kid reach 56 by elimination, which trains the
opposite of what fact practice is for. The choices are still generated, because
they are what the tiles use if a round mixes subjects — and because a typed
answer that matches one of them can be met with that mistake's explanation.

**Tiers fall out of the facts.** ×2, ×5, ×10 and ×11 have patterns kids latch
onto; ×3, ×4 and ×9 have tricks; the 6-7-8-12 corner has none. That splits the
121 times facts into 72 / 33 / 16 with no hand-authoring, which makes "drill
only the hard corner" a real mode rather than a setting.

**Rounds are drawn topic by topic, not question by question.** Two-digit
addition enumerates 3,645 facts against the times tables' 121. An unweighted
shuffle returns a round of nothing but carrying, so `generateQuestions` takes
one question from each selected topic in turn. Geography hid this problem
because its topics were within about 6× of each other; math is 45×. The change
evens out world rounds too, which used to be mostly flags and capitals.

## Answering on the map

Virginia and US questions come in two surfaces, chosen with a setting on the
setup screen: four coloured tiles, or the map itself.

| Kind | Example | What you tap |
| --- | --- | --- |
| Region | *Find the Valley and Ridge region and tap it* | one of the five Virginia regions |
| Region of a place | *Which region is Roanoke in? Tap it on the map* | one of the five Virginia regions |
| Place | *Tap Richmond on the map* | one of four pins |
| Border state | *Tap Tennessee on the map* | one of the five neighbouring states |
| State | *Find Texas and tap it* | any of the fifty states |
| State of a capital | *Tap the state whose capital is Austin* | any of the fifty states |

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
  Piedmont, which is five times its size and impossible to miss anyway. The US
  map leans on the same trick for Rhode Island against its neighbours, and
  circles a tiny answer state at the reveal so it can be seen at all.

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

## Playing across devices

One device hosts, the others join — the Kahoot shape:

- **Hosting.** Build the round on the setup screen as usual, then press **Host
  for other devices** instead of Start. The lobby shows who has joined; the
  host paces the whole game and does not play.
- **Joining.** Every open lobby on the network shows up under **Join a game** —
  pick a name, tap a game. Up to 12 players.
- **Playing.** Everyone answers every question at the same time on their own
  device, tiles and map questions alike. The reveal waits for the last answer
  (or the timer), shows each player what everyone did, and stays up until the
  host presses Next — a parent reading the explanation aloud is the point of
  playing together.

The server is the referee. It generates the questions, keeps the answers to
itself until the reveal (`server/live.js` strips them from the wire), enforces
the deadline, and scores with the same rules as pass-the-device play: speed
only ever *adds* points, so the slowest reader still scores for being right.
There are no retries in a live round — everyone faces each question exactly
once — so the requeue mechanic stays in pass-the-device mode.

The hub is transport-free (connections are anything with a `send()`, time is
injected), so `test/live.test.js` plays entire games — scoring, streaks,
disconnects, forced reveals, deadline timeouts — with plain arrays and a
hand-cranked clock. The browser smoke test then plays a real three-device game
over actual WebSockets.

Dropped connections are handled the way a living room needs: a player who
vanishes mid-game keeps their score on the board and stops being waited for;
if the host vanishes, the game ends and everyone is told.

## Players and scores over time

Every finished live game is recorded — SQLite via `node:sqlite`, built into
Node, no dependency — as one `games` row plus a `results` row per player, in
`data/kids-quiz-quest.db` (gitignored). Keeping per-game history rather than
running totals means future features ("which questions does Maya keep
missing?") are new queries, not a storage rewrite.

Players are keyed by lowercased name: this is a family game on a home network,
so "the same kid types the same name" is the identity model. The 🏆
**Leaderboard** on the home screen (and the end of every live game) shows the
all-time table — games, wins, points, right answers. Solo games count for
points but not wins; beating nobody is not a win.

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
automatically; run `node scripts/fetch-flags.mjs` once to pull the new
country's flag image (a test fails until you do). Same for `us-states.js` and
the Virginia places, with no extra step. One-off facts that do not fit a relational shape (longest river, tallest
mountain, which state a landmark is in) go in the matching `*-geography.js` or
`virginia.js` fact list, with a `pool` that wrong answers are drawn from.

`npm test` checks new rows for missing fields, bad continents or regions,
duplicate ids, pools too small to fill four choices, answers missing from their
own pool, and traps that accidentally name the correct answer.

## Adding a subject

Nothing outside `src/data/` knows what geography or math *is*. The generator
turns data rows into questions through templates; the session engine counts
points; the modes render whatever a question carries. A history subject is new
data plus new templates, and no change to any of that machinery.

The three levels are plain arrays in `src/lib/generator.js`: `SUBJECTS`, then
`CURRICULA` with a `subject` field, then `TOPICS` with a `curriculum` field. The
setup screen reads them and cascades — turning a subject on selects its
curricula and their topics, and turning it off drops them.

Two things generalise for free: the tier system (warm-up / school level /
expert) is subject-agnostic, and so is every question's `card` and `clue`, so
flash cards and a Jeopardy board will work on math and history the day they
exist.

If a new subject wants a new way of answering, that is a module in `src/ui/`
returning `{ node, hint, focusFirst, onKey, showResult }` — the same contract the
tiles, the Virginia map, and the number pad all satisfy. The round loop, timer,
scoring and feedback do not change.

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

New game modes (the content is already generated for them):

- **Flash-card mode** — `question.card` is already on every question.
- **Reverse Jeopardy board** — a 5×6 grid of categories × point values, with
  `question.clue` and `question.tier` mapping onto the tile values. This is the
  best mode for mixed ages: put tier-1 questions in the cheap row and tier-3 in
  the expensive one, and a 7-year-old and an 11-year-old can share a board.

More map:

- **Tapping the world map** — the US map is now an answer surface; the world
  map could get the same treatment ("tap Brazil").
- **Direction questions** — "tap the state north of Georgia" needs state
  adjacency data the map does not carry yet; the tap surface is ready for it.
- **Rivers on the map** — the four rivers feeding the Chesapeake are taught as
  lines, and tapping them needs river geometry the county data does not carry.
- **History** — the third subject the name leaves room for. See *Adding a
  subject* above.
- **Fractions and decimals** — where grade 4–5 math actually gets hard. Needs
  more template variety than the fact sets, and the mistakes are subtler.


Live games (the shape is there; these are the rough edges):

- **Rejoining mid-game** — a player who reloads or drops keeps their score on
  the board but cannot get back in; rejoining by name should reclaim the seat.
- **Rematch** — the room is torn down when a game ends, so "play again with the
  same players" means everyone re-joins a fresh lobby. One button should do it.
- **A playing host** — the host only referees. On a two-kid evening the host
  device should be able to deal itself in.
- **Sounds** — half of what makes Kahoot feel like an event is the lobby music
  and the answer stings.

Tracking (the SQLite schema was chosen with these in mind):

- **Per-question history** — the store keeps per-game totals, but not which
  questions each player missed, so "practice what Maya keeps getting wrong"
  is not yet a query anyone can run. Recording `results` per question is the
  missing half.
- **Pass-the-device games on the leaderboard** — only hosted live games are
  recorded today; solo and shared-device rounds vanish when the tab closes.
