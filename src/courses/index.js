import { buildVortex } from './vortex.js';
import { buildSwitchback } from './switchback.js';
import { buildLoop } from './loop.js';
import { buildRace } from './race.js';
import { densityClass } from '../marbles.js';

export const COURSES = [
  {
    id: 'vortex',
    name: 'Vortex',
    blurb: 'Helix, copper funnel and a fan that sorts by density',
    build: () => ({ ...buildVortex(), dropGap: 1.1, expect: (t) => densityClass(t.density) }),
  },
  {
    id: 'switchback',
    name: 'Switchback',
    blurb: 'Four hairpin rows down into a brass xylophone',
    build: () => ({ ...buildSwitchback(), expect: () => 'finish' }),
  },
  {
    id: 'loop',
    name: 'Loop',
    blurb: 'A long drop into a loop, right at the edge of making it',
    build: () => ({ ...buildLoop(), expect: null }),
  },
  {
    id: 'race',
    name: 'Race',
    blurb: 'Nine lanes, one of each marble, a gate and a stopwatch',
    build: () => ({ ...buildRace(), expect: () => 'finish' }),
  },
];
