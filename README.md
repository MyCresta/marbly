# Marbly

A physics marble run on a cozy desk, rendered in the browser.

Pick a course, pick a marble, and watch it roll. Nine marble materials share the same 25 mm size, so density, grip, bounce and rolling resistance decide how each one behaves.

## Courses

| Course | What happens |
| --- | --- |
| Vortex | A banked helix feeds a copper vortex funnel at rim level. A copper elbow drops into a ski jump past a desk fan, which pushes light marbles further, so every marble lands in a felt bin that matches its density. |
| Switchback | Four hairpin rows wind down to the front of the desk and finish on a 30-bar brass xylophone that plays the opening of Ode to Joy. Heavier, easier rolling marbles play it faster. |
| Loop | A 45° drop into a corkscrew loop. From that height every marble has the speed to clear it, as it would on a real track, and the loop runs at a finer physics step so nothing clips through. A trapdoor in the dip catches any marble that stalls there and drops it into the Fell tray. |
| Race | Nine lanes start high on the left and merge into one wide shared track. Two banked hairpins narrow it step by step, so the marbles bump and jostle for the racing line on the way down to the finish arch. A brass gate starts the race and a stopwatch keeps the order. |
| Gadgets | A Plinko peg board scatters each marble into a channel that turns a paddle wheel. Below it, a weighted see-saw flips with every marble, sending them alternately left across a board of red pop bumpers or right down a ramp onto a trampoline. |

Switch courses from the picker under the title, with the left and right arrow keys, or by linking straight to one, for example `#loop`.

## Marbles

| Key | Marble | Density (g/cm³) | Rolling |
| --- | --- | --- | --- |
| 1 | Cat's Eye, soda-lime glass | 2.50 | Smooth |
| 2 | Aurora, opaque art glass | 2.60 | Smooth |
| 3 | Acrylic, cast PMMA | 1.18 | Draggy |
| 4 | Oak | 0.75 | Draggy |
| 5 | Super Ball, rubber | 1.15 | Sticky |
| 6 | Chrome Steel | 7.85 | Easy |
| 7 | Brass | 8.50 | Easy |
| 8 | Copper | 8.96 | Easy |
| 9 | Tungsten carbide | 19.30 | Easy |

Density sets mass, which decides how much the fan and air drag can push a marble around and how hard it knocks others. Rolling resistance is modelled per material, viscous at low speed and capped at speed, which keeps marbles at a calm, realistic pace on gentle track while letting them carry speed down steep drops without sliding. Friction and bounciness also differ, so rubber grips and hops while steel is slick.

## Controls

* Space or Enter drops the selected marble
* Left drag on a marble picks it up. Move it anywhere on the desk and let go to drop it, or flick the mouse as you let go to throw it
* Left drag anywhere else orbits, right drag pans, scroll or pinch zooms
* 1 to 9 picks a marble
* A toggles auto drop, C clears the desk, F toggles follow cam
* Left and right arrows switch course

## Graphics quality

The bars button in the top right cycles between Auto, High, Medium, Low and Minimal, and the choice is remembered. Auto starts at Medium (Low on touch devices) and scales the render resolution smoothly between 60% and 100% to hold close to 60 fps. It only drops a whole level if even 60% resolution is not enough, and never raises itself to High. Hover the button to see the frame rate and current resolution.

| Level | Resolution | Anti-aliasing | Glass | Shadows |
| --- | --- | --- | --- | --- |
| High | up to 1.5x | 4x MSAA | real transmission | lamp 2048 px plus moonlight |
| Medium | up to 1x | FXAA | refraction shader | lamp 1024 px |
| Low | 0.8x | FXAA | refraction shader | lamp 1024 px, every 2nd frame |
| Minimal | 0.6x | FXAA | refraction shader | lamp 512 px, every 3rd frame |

Low and Minimal also turn off clearcoat and sheen on the materials, and Minimal turns off bloom.

## Sound

All sound is synthesised live with the Web Audio API. Each material has its own rolling voice, so metal hisses bright, glass sings a little lower, acrylic is duller, wood rumbles and rubber is a soft low purr. The volume follows how many marbles are rolling and how fast. Collisions ring or knock by material and soften on felt. On the xylophone the marble acts as the mallet: steel and tungsten strike bright and loud, oak gives a soft woody note, rubber a muted thump, and you still hear the marble rolling between the bars.

## Stack

* [three.js](https://threejs.org) r187 for rendering: physical materials with transmission and dispersion for glass, a scene-captured environment map for reflections, soft shadows and a lightweight two-level bloom
* [Rapier](https://rapier.rs) 0.21 for rigid-body physics at 240 Hz (480 Hz on the loop), with triangle-mesh colliders generated from the same geometry as the visible track and revolute joints for the wheel and see-saw
* No build step. Both libraries are vendored in `vendor/` so the site has no runtime CDN dependency.
* All textures (wood, felt, leather, plaster, marble swirls) are generated procedurally at load time.

## Hosting on GitHub Pages

1. Push this repository to GitHub.
2. Open Settings, then Pages.
3. Under Build and deployment, choose Deploy from a branch, select your branch and the `/ (root)` folder, then save.

The site is a single `index.html` with ES modules, so any static file host works too.

## Local development

Browsers block ES modules from `file://`, so serve the folder:

```bash
npm run serve
```

Then open http://localhost:8080.

To refresh the vendored libraries after changing versions in `package.json`:

```bash
npm install
npm run vendor
```

`npm run sim -- course=loop` runs a course headlessly in Node and reports where each marble type ends up and how long it took. Add `reps=3` for jittered repeats or `crowd=18 gap=1` to drop a stream of marbles. It is the quickest way to check a track change before looking at it in the browser.
