/**
 * The 50 US states and their capitals.
 *
 * `region` groups states so wrong answers stay in the neighborhood — offering
 * Boise as a wrong answer for Florida teaches nothing, but offering Miami does.
 * `traps` are the big cities kids name instead of the capital.
 */

const s = (name, capital, abbr, region, tier, traps = [], note = null) =>
  ({ name, capital, abbr, region, tier, traps, note });

export const US_STATES = [
  // Northeast
  s('Maine', 'Augusta', 'ME', 'Northeast', 3, ['Portland']),
  s('New Hampshire', 'Concord', 'NH', 'Northeast', 3, ['Manchester']),
  s('Vermont', 'Montpelier', 'VT', 'Northeast', 3, ['Burlington'],
    'Montpelier is the smallest state capital in the country.'),
  s('Massachusetts', 'Boston', 'MA', 'Northeast', 1, []),
  s('Rhode Island', 'Providence', 'RI', 'Northeast', 2, [],
    'Rhode Island is the smallest state.'),
  s('Connecticut', 'Hartford', 'CT', 'Northeast', 2, ['New Haven']),
  s('New York', 'Albany', 'NY', 'Northeast', 1, ['New York City', 'Buffalo'],
    'New York City is the biggest city in the country, but Albany is the state capital.'),
  s('New Jersey', 'Trenton', 'NJ', 'Northeast', 2, ['Newark', 'Atlantic City']),
  s('Pennsylvania', 'Harrisburg', 'PA', 'Northeast', 2, ['Philadelphia', 'Pittsburgh']),

  // Southeast
  s('Delaware', 'Dover', 'DE', 'Southeast', 3, ['Wilmington'],
    'Delaware was the first state to join the United States.'),
  s('Maryland', 'Annapolis', 'MD', 'Southeast', 2, ['Baltimore']),
  s('Virginia', 'Richmond', 'VA', 'Southeast', 2, ['Virginia Beach', 'Arlington']),
  s('West Virginia', 'Charleston', 'WV', 'Southeast', 3, []),
  s('North Carolina', 'Raleigh', 'NC', 'Southeast', 2, ['Charlotte']),
  s('South Carolina', 'Columbia', 'SC', 'Southeast', 3, ['Charleston']),
  s('Georgia', 'Atlanta', 'GA', 'Southeast', 1, ['Savannah']),
  s('Florida', 'Tallahassee', 'FL', 'Southeast', 1, ['Miami', 'Orlando', 'Jacksonville'],
    'Miami and Orlando are far more famous, but Tallahassee up in the panhandle is the capital.'),
  s('Alabama', 'Montgomery', 'AL', 'Southeast', 2, ['Birmingham', 'Mobile']),
  s('Mississippi', 'Jackson', 'MS', 'Southeast', 3, []),
  s('Tennessee', 'Nashville', 'TN', 'Southeast', 2, ['Memphis']),
  s('Kentucky', 'Frankfort', 'KY', 'Southeast', 3, ['Louisville', 'Lexington']),
  s('Arkansas', 'Little Rock', 'AR', 'Southeast', 3, []),
  s('Louisiana', 'Baton Rouge', 'LA', 'Southeast', 2, ['New Orleans'],
    'New Orleans is the famous one, but Baton Rouge is the capital.'),

  // Midwest
  s('Ohio', 'Columbus', 'OH', 'Midwest', 2, ['Cleveland', 'Cincinnati']),
  s('Michigan', 'Lansing', 'MI', 'Midwest', 2, ['Detroit', 'Grand Rapids']),
  s('Indiana', 'Indianapolis', 'IN', 'Midwest', 2, []),
  s('Illinois', 'Springfield', 'IL', 'Midwest', 2, ['Chicago'],
    'Chicago is one of the biggest cities in the country, but Springfield is the capital.'),
  s('Wisconsin', 'Madison', 'WI', 'Midwest', 3, ['Milwaukee']),
  s('Minnesota', 'Saint Paul', 'MN', 'Midwest', 2, ['Minneapolis'],
    'Minneapolis and Saint Paul sit right next to each other and are called the Twin Cities, but only Saint Paul is the capital.'),
  s('Iowa', 'Des Moines', 'IA', 'Midwest', 3, []),
  s('Missouri', 'Jefferson City', 'MO', 'Midwest', 3, ['St. Louis', 'Kansas City']),
  s('North Dakota', 'Bismarck', 'ND', 'Midwest', 3, ['Fargo']),
  s('South Dakota', 'Pierre', 'SD', 'Midwest', 3, ['Sioux Falls'],
    'Mount Rushmore is in South Dakota.'),
  s('Nebraska', 'Lincoln', 'NE', 'Midwest', 3, ['Omaha']),
  s('Kansas', 'Topeka', 'KS', 'Midwest', 3, ['Wichita']),

  // Southwest
  s('Texas', 'Austin', 'TX', 'Southwest', 1, ['Houston', 'Dallas', 'San Antonio'],
    'Texas has three cities bigger than Austin, but Austin is still the capital.'),
  s('Oklahoma', 'Oklahoma City', 'OK', 'Southwest', 2, ['Tulsa']),
  s('New Mexico', 'Santa Fe', 'NM', 'Southwest', 2, ['Albuquerque']),
  s('Arizona', 'Phoenix', 'AZ', 'Southwest', 1, ['Tucson'],
    'The Grand Canyon is in Arizona.'),

  // West
  s('Colorado', 'Denver', 'CO', 'West', 1, ['Colorado Springs'],
    'Denver is called the Mile High City because it sits exactly one mile above sea level.'),
  s('Wyoming', 'Cheyenne', 'WY', 'West', 3, ['Jackson'],
    'Yellowstone, the first national park in the world, is mostly in Wyoming.'),
  s('Montana', 'Helena', 'MT', 'West', 3, ['Billings']),
  s('Idaho', 'Boise', 'ID', 'West', 3, []),
  s('Utah', 'Salt Lake City', 'UT', 'West', 2, []),
  s('Nevada', 'Carson City', 'NV', 'West', 2, ['Las Vegas', 'Reno'],
    'Las Vegas is way bigger, but tiny Carson City is the capital.'),
  s('California', 'Sacramento', 'CA', 'West', 1, ['Los Angeles', 'San Francisco', 'San Diego'],
    'California has more people than any other state, and none of its three most famous cities is the capital.'),
  s('Oregon', 'Salem', 'OR', 'West', 2, ['Portland']),
  s('Washington', 'Olympia', 'WA', 'West', 2, ['Seattle', 'Spokane'],
    'Do not mix up Washington the state with Washington, D.C. — they are on opposite sides of the country.'),
  s('Alaska', 'Juneau', 'AK', 'West', 2, ['Anchorage', 'Fairbanks'],
    'Alaska is the biggest state, and you cannot drive to Juneau — you have to fly or take a boat.'),
  s('Hawaii', 'Honolulu', 'HI', 'West', 2, [],
    'Hawaii is the only state made entirely of islands.'),
];

// Grouping abbreviations by first letter puts the confusable ones together:
// MI, MN, MO, MS, and MT are exactly the set kids mix up.
for (const state of US_STATES) {
  state.firstLetter = state.name[0];
}
