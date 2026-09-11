# attaquarks — portfolio

Personal site for **Atta Ur Rehman**: AI Engineer, Product Designer,
Terminal Enthusiast. One continuous scroll, five movements, no page loads.

> Systems that think, tools that work.

## Running it

```bash
npm install
npm run dev      # vite dev server
npm run build    # -> dist/
npm run preview  # serve dist/ locally
```

## How the page is put together

The whole site is a single scroll timeline. Nothing here uses a scroll
listener of its own — Lenis drives GSAP's ticker (`useSmoothScroll`), and
every scene registers a ScrollTrigger against that one source of truth.

| Act | Section | What scroll does |
| --- | --- | --- |
| — | Hero | Content lifts, blurs and hands off to the next act |
| 001 | Stack | Scroll position is the playhead for a terminal typing itself |
| 002 | Projects | A camera flies a path through an R3F constellation behind the cards |
| 003 | Approach | The three roles, as numbered rows |
| 004 | About | A portrait resolves out of 96 tiles, then the copy lands on it |
| 005 | Contact | Availability, then the addresses |

(The constellation outlives act 002 — see [The background](#the-background-in-three-parts).)

### The act structure

Scroll-pinned sections are **tall wrappers holding `position: sticky`
children**, not GSAP `pin: true`. Sticky needs no pin-spacer, so there is no
injected element whose height has to stay in sync with Lenis' smoothed
scroll — and `prefers-reduced-motion` collapses the entire structure back to
ordinary flow with two CSS rules.

Act height is not a free parameter. A sticky child of height `100svh`
unsticks at `height - 100svh` of scroll, which is exactly where a
`top top` → `bottom bottom` scrub ends. **The act's extra height *is* the
length of its timeline.**

Two consequences worth knowing before editing `styles.css`:

- `body { overflow-x: clip }`, never `hidden`. With `hidden`, the used value
  of `overflow-y` becomes `auto`, `<body>` turns into a scroll container, and
  every `position: sticky` on the page silently breaks.
- Scrubbed timelines use `gsap.fromTo` with explicit end values, not
  `gsap.from`. Cleanup leaves elements at the *from* state, and a `from`
  recreated by StrictMode's second effect pass reads that as its destination
  and animates 0 → 0.
- **The `@media (prefers-reduced-motion: reduce)` block is the last thing in
  `styles.css`, and has to stay there.** A preference override wins on cascade
  order, and sitting near the top it tied on specificity with every rule it
  meant to replace and lost — so four of its seven overrides silently did
  nothing (sticky acts, the pinned constellation, the hidden scroll spine, the
  wallpaper's opacity). Only the About rules applied, and only because they
  happened to be one class more specific, which hid the bug for the rest.
- **Sections below the constellation need `position: relative` and no
  `z-index`.** Relative, because a static block paints underneath a positioned
  one regardless of DOM order. No `z-index`, because that would make each
  section its own stacking context, and the About portrait's
  `mix-blend-mode: screen` would then blend against the inside of its own
  section instead of against the constellation behind it — which is the whole
  reason it reads as glowing rather than pasted on.

### The background, in three parts

The page has one backdrop, and it changes character three times as you
descend. Nothing switches on or off — each part crossfades into the next
while both are on screen, which is what makes the seams invisible.

| Part | Where | What it is |
| --- | --- | --- |
| 1 | Hero | A hand-written WebGL fluid field |
| 2 | Projects → bottom | An R3F constellation the camera flies through |
| 3 | About onward | The same constellation, still moving, behind the portrait |

Parts 2 and 3 are one element. A `position: sticky` box only sticks for as
long as its **parent's** box lasts, so the constellation is a direct child of
`<main>` rather than of `#projects` — declared inside the section, it stopped
dead at that section's edge.

#### Part 1 — `FluidBackground.tsx`

This was [`fluid-bg`](https://www.npmjs.com/package/fluid-bg), mounted as an
iframe. It was replaced with a shader this project owns, because of what the
iframe actually cost. Measured headful on real hardware (Intel HD 630 / ANGLE
D3D11, cold shader cache), same page, embed reachable vs. blocked:

| | embed | blocked |
| --- | --- | --- |
| `load` event | 3796 ms | 795 ms |
| worst frame stall | 3498 ms | 632 ms |
| ever painted a frame | no | — |

Three and a half seconds of frozen tab, three seconds added to load, and after
thirty seconds the embed still had not painted — so the layer sat on its poster
forever. An iframe is also a subresource, so `window.load` waited on it, and
`load` is what the tab spinner tracks. That was the "page never finishes
loading" report.

Owning the renderer fixes all of it. The shader is deliberately small — four
octaves of value noise, two warp passes — because the embed's stall was shader
*compilation*, not shading. The render buffer is capped at **480px on its long
edge** and stretched by CSS: at 1440×900 that's ~3% of the pixels, and the
upscale *is* the blur, done by the compositor for free where `filter: blur()`
at viewport size would cost more than the shader. It also stops entirely when
it is off screen or the tab is hidden.

#### Part 2 — `ProjectConstellation.tsx`

Hand-written R3F rather than an exported scene, because each node brightens in
response to *our* scroll progress, which no exported scene file could know.

Two things are load-bearing:

- **The camera fades nodes over the whole approach, from 1.1 out to 5.5 units.**
  Monotonic "nearer is brighter" means the node the camera is inside becomes a
  flat wash across the viewport. At three units a halo already covers most of
  the screen, so starting the fade there made the largest, brightest state the
  last one drawn — and a disc that size, clipped by the screen edge, reads as a
  light leak rather than a star going past.
- **Fog in `--ink`**, so the far end of the graph dissolves into the page
  background instead of ending on a visible edge.

Under `prefers-reduced-motion` no WebGL context is created at all — parts 1
and 3 fall back to the poster, which is a real frame of the same piece.

## Stack

- **Vite + React 19 + TypeScript**
- **GSAP + ScrollTrigger** — free including plugins since the Webflow acquisition
- **Lenis** — smooth scroll, synced to GSAP's ticker
- **three / R3F / drei** — the project constellation, lazy-loaded because it is
  the heaviest thing on the page and belongs to act two
- **Tailwind + shadcn/ui conventions** — mapped to this site's palette, not
  shadcn's default theme
- A hand-rolled canvas particle field for the hero (`LivingField.tsx`)

## Design notes

- **Palette.** Warm charcoal (`--ink #12110f`), bioluminescent mint
  (`--glow #4fe8c4`), amber (`--amber #f2a65a`). Chosen to avoid both common
  AI-generated tells — cream + terracotta, and flat near-black + neon.
- **Type.** Space Grotesk for display, JetBrains Mono for code, and
  [Departure Mono](https://departuremono.com/) for short caps-and-digit
  strings only — section numbers, the status rail, window chrome, tag pills.
  It is drawn on a coarse pixel grid: superb at label size, tiring at
  paragraph length, so it is opted into per string rather than inherited.
- **Motion.** Every animation respects the `prefers-reduced-motion` block in
  `src/styles.css`. Reduced motion is a complete, settled version of the page,
  not a degraded one.

## Tooling

Five CDP scripts, all reusing one headless Chrome via a fixed debugging port.
They exist because none of these questions can be answered from the source:
Chrome's `--screenshot` flag can't scroll, resize, or wait for a WebGL frame,
and "why is the page blank" is not a question you can reason your way to.

```bash
# Screenshots at a given scroll offset.
node scripts/shot.mjs --url http://localhost:4174/ --out shots/about.png \
  --w 1440 --h 900 --scroll 6529

# One JS expression against the live page, JSON out.
node scripts/probe.mjs "getComputedStyle(document.body).overflowY"
REDUCED=1 node scripts/probe.mjs "..."          # emulates reduced motion

# Console, failed requests and layout metrics.
node scripts/diag.mjs http://localhost:4174/

# Same, but with URL patterns blocked — a hostile network, simulated.
node scripts/blocked.mjs http://localhost:4174/ 3200 "*example.com*"

# Real GPU, headful, throwaway profile: a cold shader cache, plus a rAF
# recorder that reports the worst frame stall.
node scripts/coldgpu.mjs http://localhost:4174/
```

`--scroll` takes `0..1` as a fraction of scrollable height, a raw px value, or
a CSS selector. `--w`/`--h` matter more than they look: half the layout
questions worth asking only go wrong at one breakpoint.

`coldgpu.mjs` is the one that found the loading bug. Headless Chrome uses
SwiftShader, so it never reproduces a driver problem; the stall only appears on
a real GPU with a cold shader cache — which is precisely the first-visit
condition a local check never covers.

## Content

`src/data/projects.ts` is the single source of truth for the projects
section — update it when the pinned repos change.
