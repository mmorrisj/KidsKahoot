/**
 * Virginia geography, following what Virginia Studies actually covers: the five
 * regions, the Fall Line, the rivers that feed the Chesapeake Bay, the states
 * on each border, and the places worth knowing by name.
 *
 * A note on the Fall Line cities. Richmond, Fredericksburg, Alexandria, and
 * Petersburg all grew up *on* the Fall Line, and different classroom materials
 * put them in different regions. Rather than teach an answer a teacher might
 * mark wrong, those four are flagged `fallLine` and never asked "which region",
 * and the Fall Line itself gets its own questions instead.
 */

export const VA_REGIONS = [
  {
    name: 'Coastal Plain (Tidewater)',
    short: 'Coastal Plain',
    order: 1,
    clue: 'flat land east of the Fall Line, next to the Chesapeake Bay and the Atlantic Ocean',
    tier: 1,
  },
  {
    name: 'Piedmont',
    short: 'Piedmont',
    order: 2,
    clue: 'rolling hills between the Fall Line and the mountains',
    tier: 1,
  },
  {
    name: 'Blue Ridge Mountains',
    short: 'Blue Ridge Mountains',
    order: 3,
    clue: 'old, rounded mountains where many of Virginia’s rivers begin',
    tier: 1,
  },
  {
    name: 'Valley and Ridge',
    short: 'Valley and Ridge',
    order: 4,
    clue: 'a long valley with ridges beside it, west of the Blue Ridge',
    tier: 2,
  },
  {
    name: 'Appalachian Plateau',
    short: 'Appalachian Plateau',
    order: 5,
    clue: 'the far southwest corner of Virginia, where coal is mined',
    tier: 2,
  },
];

const p = (name, region, tier, note = null, fallLine = false) =>
  ({ name, region, tier, note, fallLine });

export const VA_PLACES = [
  // Coastal Plain (Tidewater)
  p('Virginia Beach', 'Coastal Plain', 1, 'Virginia Beach is the largest city in Virginia.'),
  p('Norfolk', 'Coastal Plain', 1, 'Norfolk has the largest naval base in the world.'),
  p('Chesapeake', 'Coastal Plain', 2),
  p('Newport News', 'Coastal Plain', 2),
  p('Hampton', 'Coastal Plain', 2),
  p('Portsmouth', 'Coastal Plain', 3),
  p('Suffolk', 'Coastal Plain', 3),
  p('Williamsburg', 'Coastal Plain', 1,
    'Williamsburg was Virginia’s capital during colonial times, before Richmond.'),
  p('Jamestown', 'Coastal Plain', 1,
    'Jamestown, founded in 1607, was the first permanent English settlement in North America.'),
  p('Yorktown', 'Coastal Plain', 1,
    'The last big battle of the Revolutionary War was fought at Yorktown in 1781.'),
  p('Mount Vernon', 'Coastal Plain', 2,
    'Mount Vernon was George Washington’s home, on the Potomac River.'),
  p('the Great Dismal Swamp', 'Coastal Plain', 3),
  p('the Eastern Shore', 'Coastal Plain', 2,
    'The Eastern Shore is across the Chesapeake Bay from the rest of Virginia.'),
  p('Chincoteague', 'Coastal Plain', 3, 'Chincoteague is famous for its wild ponies.'),

  // Piedmont
  p('Charlottesville', 'Piedmont', 1,
    'Charlottesville is home to Monticello and the University of Virginia.'),
  p('Lynchburg', 'Piedmont', 2),
  p('Danville', 'Piedmont', 3),
  p('Monticello', 'Piedmont', 2, 'Monticello was Thomas Jefferson’s home.'),
  p('Appomattox Court House', 'Piedmont', 2,
    'The Civil War ended at Appomattox Court House in 1865.'),
  p('Manassas', 'Piedmont', 3, 'Two big Civil War battles were fought at Manassas.'),

  // Blue Ridge Mountains
  p('Shenandoah National Park', 'Blue Ridge Mountains', 1),
  p('Skyline Drive', 'Blue Ridge Mountains', 2,
    'Skyline Drive runs 105 miles along the top of the Blue Ridge.'),
  p('the Blue Ridge Parkway', 'Blue Ridge Mountains', 2),
  p('Mount Rogers', 'Blue Ridge Mountains', 2,
    'Mount Rogers, at 5,729 feet, is the highest point in Virginia.'),

  // Valley and Ridge
  p('Roanoke', 'Valley and Ridge', 1, 'Roanoke is the largest city in western Virginia.'),
  p('Winchester', 'Valley and Ridge', 2),
  p('Staunton', 'Valley and Ridge', 3),
  p('Harrisonburg', 'Valley and Ridge', 2),
  p('Lexington', 'Valley and Ridge', 3),
  p('Luray Caverns', 'Valley and Ridge', 2, 'Luray Caverns is a huge system of underground caves.'),
  p('Natural Bridge', 'Valley and Ridge', 2,
    'Natural Bridge is a 215-foot stone arch carved out by a creek.'),
  p('the Shenandoah Valley', 'Valley and Ridge', 1,
    'The Shenandoah Valley is also called the Great Valley of Virginia.'),

  // Appalachian Plateau
  p('Big Stone Gap', 'Appalachian Plateau', 3),
  p('Norton', 'Appalachian Plateau', 3),
  p('Wise', 'Appalachian Plateau', 3),

  // Fall Line cities — never asked "which region" (see the note at the top).
  p('Richmond', null, 1, 'Richmond has been Virginia’s capital since 1780.', true),
  p('Fredericksburg', null, 2, null, true),
  p('Alexandria', null, 2, null, true),
  p('Petersburg', null, 3, null, true),
];

/**
 * A phrase that completes "Which Virginia place ___?", for places famous for
 * something in particular. Kept separate from `note` because a note is read
 * *after* answering and may name the answer, while a claim *is* the question.
 * Places already covered by a VA_FACTS row are deliberately left out.
 */
const CLAIMS = {
  Norfolk: 'has the largest naval base in the world',
  Roanoke: 'is the largest city in western Virginia',
  Charlottesville: 'is home to the University of Virginia',
  'Mount Vernon': 'was George Washington’s home',
  Monticello: 'was Thomas Jefferson’s home',
  'Appomattox Court House': 'is where the Civil War ended in 1865',
  Manassas: 'is where two big Civil War battles were fought',
  'Skyline Drive': 'runs 105 miles along the top of the Blue Ridge',
  'Shenandoah National Park': 'is Virginia’s national park, up in the Blue Ridge',
  'Luray Caverns': 'is a huge system of underground caves',
  'Natural Bridge': 'is a 215-foot stone arch carved out by a creek',
  Chincoteague: 'is famous for its wild ponies',
};

for (const place of VA_PLACES) {
  place.claim = CLAIMS[place.name] ?? null;
}

export const VA_POOLS = {
  regions: VA_REGIONS.map((r) => r.short),
  rivers: ['James River', 'Potomac River', 'Rappahannock River', 'York River',
    'Shenandoah River', 'New River', 'Roanoke River', 'Clinch River'],
  waters: ['Atlantic Ocean', 'Chesapeake Bay', 'the Great Dismal Swamp', 'the James River',
    'the Potomac River', 'Pacific Ocean'],
  features: ['the Fall Line', 'the Chesapeake Bay', 'the Blue Ridge Mountains',
    'the Shenandoah Valley', 'the Eastern Shore', 'Mount Rogers', 'Natural Bridge'],
  cities: ['Richmond', 'Virginia Beach', 'Norfolk', 'Roanoke', 'Alexandria', 'Williamsburg',
    'Charlottesville', 'Jamestown', 'Yorktown', 'Fredericksburg', 'Lynchburg', 'Winchester'],
  states: ['Maryland', 'West Virginia', 'Kentucky', 'Tennessee', 'North Carolina',
    'Delaware', 'Pennsylvania', 'Ohio', 'South Carolina', 'Georgia'],
  usRegions: ['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West'],
};

const f = (id, category, pool, tier, prompt, answer, clue, note = null) =>
  ({ id, category, pool, tier, prompt, answer, clue, note });

export const VA_FACTS = [
  // Cities and history
  f('va-capital', 'Virginia Cities', 'cities', 1,
    'What is the capital of Virginia?', 'Richmond',
    'This city is the capital of Virginia',
    'Virginia’s capital moved from Jamestown to Williamsburg, and then to Richmond in 1780.'),
  f('va-largest-city', 'Virginia Cities', 'cities', 1,
    'What is the largest city in Virginia?', 'Virginia Beach',
    'This is the largest city in Virginia'),
  f('va-colonial-capital', 'Virginia Cities', 'cities', 2,
    'Which city was Virginia’s capital during colonial times, before Richmond?', 'Williamsburg',
    'This city was Virginia’s capital before Richmond'),
  f('va-jamestown', 'Virginia Cities', 'cities', 1,
    'What was the first permanent English settlement in North America?', 'Jamestown',
    'Founded in 1607, this was the first permanent English settlement in North America'),
  f('va-yorktown', 'Virginia Cities', 'cities', 2,
    'Where was the last big battle of the Revolutionary War fought?', 'Yorktown',
    'The last big battle of the Revolutionary War was fought here in 1781'),

  // Location and borders
  f('va-us-region', 'Virginia Borders', 'usRegions', 1,
    'Which region of the United States is Virginia in?', 'Southeast',
    'Virginia sits in this region of the United States'),
  f('va-east', 'Virginia Borders', 'waters', 1,
    'What lies along Virginia’s eastern edge?', 'Atlantic Ocean',
    'This lies along the eastern edge of Virginia'),
  f('va-north-state', 'Virginia Borders', 'states', 1,
    'Which state borders Virginia to the north?', 'Maryland',
    'This state borders Virginia to the north',
    'Washington, D.C. sits on Virginia’s northern border too.'),
  f('va-south-state', 'Virginia Borders', 'states', 1,
    'Which state borders Virginia to the south?', 'North Carolina',
    'This state borders Virginia along most of its southern edge'),
  f('va-southwest-state', 'Virginia Borders', 'states', 2,
    'Along with North Carolina, which state is on Virginia’s southern border?', 'Tennessee',
    'This state shares Virginia’s southwestern border'),
  f('va-west-state', 'Virginia Borders', 'states', 1,
    'Which state was once part of Virginia and now borders it to the west?', 'West Virginia',
    'This state broke away from Virginia during the Civil War and now borders it to the west'),
  f('va-far-west-state', 'Virginia Borders', 'states', 3,
    'Along with West Virginia, which state borders Virginia to the west?', 'Kentucky',
    'This state touches Virginia’s far western tip'),

  // Water
  f('va-bay', 'Virginia Waterways', 'features', 1,
    'What is the large bay on Virginia’s eastern side?', 'the Chesapeake Bay',
    'This is the largest estuary in the United States, on Virginia’s eastern side'),
  f('va-river-potomac', 'Virginia Waterways', 'rivers', 1,
    'Which river forms Virginia’s northern border with Maryland?', 'Potomac River',
    'This river forms Virginia’s northern border with Maryland'),
  f('va-river-james', 'Virginia Waterways', 'rivers', 1,
    'Which river flows past Richmond and Jamestown?', 'James River',
    'This river flows past Richmond and Jamestown'),
  f('va-river-longest', 'Virginia Waterways', 'rivers', 2,
    'What is the longest river entirely inside Virginia?', 'James River',
    'This is the longest river that stays entirely inside Virginia'),
  f('va-river-rappahannock', 'Virginia Waterways', 'rivers', 2,
    'Which river flows past Fredericksburg?', 'Rappahannock River',
    'This river flows past Fredericksburg'),
  f('va-river-york', 'Virginia Waterways', 'rivers', 2,
    'Which river flows past Yorktown?', 'York River',
    'This river flows past Yorktown'),
  f('va-river-shenandoah', 'Virginia Waterways', 'rivers', 2,
    'Which river flows north through the Shenandoah Valley?', 'Shenandoah River',
    'This river flows north through the Shenandoah Valley into the Potomac'),
  f('va-river-new', 'Virginia Waterways', 'rivers', 3,
    'Which Virginia river is one of the oldest rivers in the world and flows north?', 'New River',
    'Despite its name, this is one of the oldest rivers in the world, and it flows north'),

  // Regions and the Fall Line
  f('va-fall-line', 'Virginia Regions', 'features', 1,
    'Richmond, Fredericksburg, Alexandria, and Petersburg all grew up along which natural feature?',
    'the Fall Line',
    'These four cities grew up along this natural feature',
    'The Fall Line is where rivers drop from the harder rock of the Piedmont to the softer rock of the Coastal Plain. Boats could not go any farther upriver, so towns grew there.'),
  f('va-fall-line-divides', 'Virginia Regions', 'regions', 2,
    'The Fall Line is the boundary between the Piedmont and which region?', 'Coastal Plain',
    'The Fall Line separates the Piedmont from this region'),
  f('va-farthest-east', 'Virginia Regions', 'regions', 1,
    'Which Virginia region is farthest east?', 'Coastal Plain',
    'This is the region farthest east in Virginia'),
  f('va-farthest-west', 'Virginia Regions', 'regions', 2,
    'Which Virginia region is farthest west?', 'Appalachian Plateau',
    'This is the region farthest west in Virginia'),
  f('va-rivers-begin', 'Virginia Regions', 'regions', 2,
    'In which Virginia region do many of the state’s rivers begin?', 'Blue Ridge Mountains',
    'Many of Virginia’s rivers begin in this region'),
  f('va-coal', 'Virginia Regions', 'regions', 2,
    'Which Virginia region is known for coal mining?', 'Appalachian Plateau',
    'Coal is mined in this region'),
  f('va-highest-point', 'Virginia Regions', 'features', 2,
    'What is the highest point in Virginia?', 'Mount Rogers',
    'At 5,729 feet, this is the highest point in Virginia'),
  f('va-eastern-shore', 'Virginia Regions', 'features', 2,
    'What is the part of Virginia across the Chesapeake Bay from the rest of the state called?',
    'the Eastern Shore',
    'This part of Virginia sits across the Chesapeake Bay from the rest of the state'),
  f('va-great-valley', 'Virginia Regions', 'features', 2,
    'The Great Valley of Virginia is better known by what name?', 'the Shenandoah Valley',
    'The Great Valley of Virginia goes by this name'),
];
