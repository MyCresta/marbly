import { buildVortex } from './vortex.js';
import { buildSwitchback } from './switchback.js';
import { buildLoop } from './loop.js';
import { buildRace } from './race.js';
import { buildObstacles } from './obstacles.js';
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
    blurb: 'A 45 degree drop into a corkscrew loop, with a trapdoor for stragglers',
    build: () => ({ ...buildLoop(), expect: () => 'looped' }),
  },
  {
    id: 'race',
    name: 'Race',
    blurb: 'Nine lanes merge into one shared track, first to the arch wins',
    build: () => ({ ...buildRace(), expect: () => 'finish' }),
  },
  {
    id: 'gadgets',
    name: 'Gadgets',
    blurb: 'Plinko, a paddle wheel, a flip-flop see-saw, bumpers and a trampoline',
    build: () => ({ ...buildObstacles(), expect: null }),
  },
];
