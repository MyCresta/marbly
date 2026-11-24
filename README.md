# Marbly

A physics marble run on a cozy desk, rendered in the browser.

Marbles drop from a brass hopper, roll down a banked maple helix, orbit a copper vortex funnel and shoot off a ski jump past a little desk fan. The fan blows harder on light marbles than heavy ones, so every marble lands in a felt bin that matches its density.

## Marbles

| Key | Marble | Density (g/cm³) | Lands in |
| --- | --- | --- | --- |
| 1 | Cat's Eye, soda-lime glass | 2.50 | Medium |
| 2 | Aurora, opaque art glass | 2.60 | Medium |
| 3 | Acrylic, cast PMMA | 1.18 | Light |
| 4 | Oak | 0.75 | Light |
| 5 | Super Ball, rubber | 1.15 | Light |
| 6 | Chrome Steel | 7.85 | Heavy |
| 7 | Brass | 8.50 | Heavy |
| 8 | Copper | 8.96 | Heavy |
| 9 | Tungsten carbide | 19.30 | Heavy |

Every marble is the same 25 mm size, so density alone sets its mass. Mass decides how much the fan and air drag can push it around, and how hard it knocks other marbles. Friction and bounciness also differ per material, so rubber hops and steel slides.

## Controls

* Space or Enter drops the selected marble
* 1 to 9 picks a marble
* A toggles auto drop, C clears the desk, F toggles follow cam
* Drag to orbit, scroll or pinch to zoom, right drag to pan

## Stack

* [three.js](https://threejs.org) r187 for rendering: physical materials with transmission and dispersion for glass, a scene-captured environment map for reflections, soft shadows, a custom depth of field pass and bloom
* [Rapier](https://rapier.rs) 0.21 for rigid-body physics at 240 Hz, with triangle-mesh colliders generated from the same geometry as the visible track
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

`npm run sim` runs the course headlessly in Node and reports where each marble type lands, which is handy after changing the track or physics constants.
