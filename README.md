# attaquarks portfolio — starter

A working scrollytelling starter for an AI/ML portfolio, built around a
"living system" metaphor: a generative particle field in the hero,
a terminal-style tech-stack reveal, and a project grid that visibly
settles into place as you scroll.

## Stack (all verified current as of Sep 2026)

- **Vite + React + TypeScript**
- **Tailwind CSS + shadcn/ui conventions** — `components.json`, the
  `cn()` utility, and the CSS-variable color system are all set up and
  mapped to the site's own palette (not shadcn's default zinc theme)
- **GSAP + ScrollTrigger** — 100% free since Webflow's acquisition, including every plugin
- **Lenis** — smooth-scroll, synced to GSAP's ticker
- **Motion** installed but not yet wired in — use it for gesture-driven
  micro-interactions (hover states, the terminal cursor, nav transitions)
- A hand-rolled canvas particle field for the hero (`LivingField.tsx`) —
  no external 3D asset pipeline needed to get something alive on screen
- **A real 3D tilt card** (`components/ui/3d-card.tsx`) — mouse-tracked
  perspective transform, same technique as Aceternity's 3D Card Effect,
  wired into the project cards

## Important: finish the shadcn setup on your machine

This sandbox can't reach `ui.shadcn.com` (network policy), so the
shadcn scaffolding here was hand-built to match what `init` produces.
Once you unzip this locally, run:

```
npx shadcn@latest init
```

It will detect `components.json` already exists and ask before
overwriting — say no, the config here is already correct and tuned to
this palette. From then on, `npx shadcn@latest add <component>` and
`npx shadcn@latest add @aceternity/<component>` will work normally.

## Run it

```
npm install
npm run dev
```

## Where to go next (in Claude Code)

1. **Swap the hero field for a Spline scene.** Design a 3D object in
   Spline (a floating shape, a neural-net-like structure), export as
   React, and drop `<Spline scene="...">` in where `<LivingField />`
   sits now. Keep LivingField as a lightweight fallback/loading state.
2. **Wire Motion into hover/tap states** — the terminal dots, project
   card hover, nav links. Small, gesture-answering motion only (per the
   design brief: motion that responds to an action, not scattered
   ambient effects).
3. **Add a real project detail view.** Right now cards link out to
   GitHub — consider an in-page expand/modal with more detail, a demo
   GIF, or an embedded Loom.
4. **Update `src/data/projects.ts`** whenever your pinned GitHub repos
   change — it's the single source of truth for the projects section.
5. **Typography**: currently Space Grotesk + JetBrains Mono, loaded
   from Google Fonts. If you want something more distinctive, browse
   freefaces.gallery for a display face and swap the `<link>` in
   `index.html` + the `--font-display` variable in `styles.css`.
6. **Deploy**: `npm run build` outputs to `dist/` — push to Vercel or
   Netlify directly from the repo.

## Notes on the design choices

- Palette avoids both common AI-generated tells (cream+terracotta,
  flat near-black+neon): warm charcoal base, bioluminescent
  cyan-green + amber accents.
- One deliberate motion moment (the boot-sequence terminal) rather
  than fade-up animations on every section.
- Off-center hero layout, not the centered-hero default.
