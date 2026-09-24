# genome-viz-core

Shared three.js scenes, render setup and build guards for interactive genome
explainers. Extracted from
[`Features-of-Carcinogenesis`](https://github.com/eauwith/Features-of-Carcinogenesis),
with history preserved.

## Why this exists

`Genome-Under-A-Fast` and `Features-of-Carcinogenesis` carried **1,074 lines of
byte-identical code** between them — five complete 3D scene modules plus the
theme, sway, zoom-gate and build-guard helpers:

| Module | Lines | Status across the two projects |
| --- | --- | --- |
| `scene-nucleus.js` | 275 | identical |
| `scene-enhancer.js` | 243 | identical |
| `scene-helix.js` | 208 | identical |
| `scene-meth-contexts.js` | 182 | identical |
| `scene-chromatin.js` | 166 | identical |
| `scripts/check-build.mjs` | 86 | identical |
| `sway.js` | 32 | identical |
| `zoom-gate.js` | 17 | identical |
| `theme.js` | 9 | identical |
| `render-quality.js` | 101 / 117 | diverged |
| `build-artifact.mjs` | 33 | diverged by 2 lines |

The divergence in the last two is the argument for extracting: the copies had
already started drifting, so a fix in one would not reach the other.

`render-quality.js` here is the **newer 117-line version** from
`Features-of-Carcinogenesis`; anything consuming the 101-line variant should be
checked against it.

## Contents

- **Scenes** — `createNucleusScene`, `createHelixScene`, `createChromatinScene`,
  `createEnhancerScene`, `createMethContextScene`. Each takes a container element
  and returns a mounted scene.
- **Render quality** — `configureRenderer`, `environmentFor`, `fitCameraToRadius`,
  `fitCameraToBox`, `organicGeometry`, `membraneMaterial`, `tissueMaterial`.
- **Interaction** — `attachSway` (idle turntable), `gateZoomBehindModifier`
  (ctrl/⌘-gated wheel zoom so the page still scrolls).
- **Theme** — `getPalette`, reading CSS custom properties into JS colours.
- **Build guards** — `check-build.mjs` asserts the standalone artifact makes no
  external network calls, every `getElementById` target exists, and every scene
  module is actually mounted. `build-artifact.mjs` inlines to one self-contained page.

## Peer dependencies

`three` and `gsap` are peer dependencies — consumers pin their own versions.

## Not yet done

Neither consumer has been repointed at this package. Doing so needs a build run
and a visual check of all six WebGL scenes per project, which is the obvious
next step but is not a mechanical change.
