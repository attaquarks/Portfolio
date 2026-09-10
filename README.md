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

### The background

The wallpaper is [`fluid-bg`](https://www.npmjs.com/package/fluid-bg),
mounted once at the root and running behind every act. Two non-obvious
decisions are baked into `FluidBackground.tsx`:

- **Not `fixed` mode.** The package's `fixed` option mounts at `z-index: -1`,
  and this site paints `--ink` on both `html` and `body` — the layer renders
  perfectly and is covered by an opaque page. It mounts non-fixed into a host
  we own at `z-index: 0`, with `main` lifted to `1`.
- **`mode: 'iframe'`, not native.** Native mode blocks the renderer main
  thread for ~11.5s on a cold shader cache (measured on Intel HD 630 /
  ANGLE D3D11; 53ms warm). iframe mode mounts in 4ms because the shader
  compile happens in the embed's own renderer process. A poster generated
  from a real frame of the live render paints first, and the embed crossfades
  over it on load.

Under `prefers-reduced-motion`, no engine is mounted at all — the layer falls
back to that poster, which is a genuine still of the same piece.

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

`scripts/shot.mjs` drives headless Chrome over CDP to take deterministic
screenshots at a given scroll offset — Chrome's `--screenshot` flag can't
scroll, resize, or wait for a WebGL frame.

```bash
node scripts/shot.mjs --url http://localhost:4174/ --out shots/about.png \
  --w 1440 --h 900 --scroll 6529
```

`--scroll` takes `0..1` as a fraction of scrollable height, a raw px value,
or a CSS selector. Chrome is reused across runs via a fixed debugging port.

## Content

`src/data/projects.ts` is the single source of truth for the projects
section — update it when the pinned repos change.
