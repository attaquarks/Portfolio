// Is the constellation's render loop actually gated?
//
//   node scripts/gatecheck.mjs [url]
//
// The handoff harness spends 25 seconds parked at the top of the page and its
// draw histogram showed `constellation-canvas` issuing ~780 draws a second the
// whole time — during the hero, a full screen before anything of it is visible
// and while its own container is at opacity 0. That is exactly the waste the
// gate exists to prevent, and it contradicted the intent recorded in the
// component, so it needed measuring rather than reasoning about.
//
// R3F's own source rules out half the explanations: with frameloop="never"
// invalidate() early-returns, update() returns zero frames, and loop() cancels
// itself, so a scene under `never` genuinely does not render. Which means the
// only way the constellation can be drawing is if its ScrollTrigger considers
// itself active — and that is a question about scroll position, which this asks
// directly: park at a series of positions and count draws at each.
//
// Positions are chosen around the two candidate boundaries. The hero's own
// bottom edge is at 1800, so a trigger reading `bottom bottom` starts at 900 and
// the constellation shows at 1800. A trigger that had lost its scroller offset
// would start at 0 instead, which would show up as a flat line at the top of
// the table.

import { launchHeadful, sleep } from './chrome.mjs';
import GL_INJECT from './glinject.mjs';

const url = process.argv[2] || 'http://localhost:4174/';

// Sample windows. 700ms is ~40 frames at 60fps — long enough that a scene
// rendering on every second frame cannot hide, short enough that the whole
// table runs in a few seconds.
const SETTLE_MS = 900;
const SAMPLE_MS = 700;

const { evaluate, install, navigate, close, version } = await launchHeadful();
console.log('browser:', version);

await install(GL_INJECT);
await navigate(url);

// The lazy chunk that owns the constellation lands around 3.5s cold. Waiting
// well past it means the gate is being measured on a mounted component rather
// than on its absence.
await sleep(12000);

const geometry = await evaluate(`(() => {
  const hero = document.querySelector('.hero');
  const con = document.querySelector('.constellation');
  return {
    innerHeight: window.innerHeight,
    heroTop: hero?.offsetTop ?? null,
    heroBottom: hero ? hero.offsetTop + hero.offsetHeight : null,
    conTop: con?.offsetTop ?? null,
    docHeight: document.documentElement.scrollHeight,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    canvasMounted: !!document.querySelector('.constellation-canvas canvas'),
  };
})()`);
console.log('\n--- geometry ---');
console.log(JSON.stringify(geometry, null, 2));

const bottom = geometry.heroBottom ?? 1800;

// Park at the top first, and watch it, rather than sampling once.
//
// The failure this is looking for is not a steady state — it was a scroll loop
// that switched itself on and stayed on, at a moment determined by when a
// refresh happened to land relative to layout. It started anywhere between
// three seconds and eighteen seconds into the page's life depending on the run.
// A single sample taken at twelve seconds sees a pass in some runs and a fail
// in others; two seconds of counting across the whole first twenty does not.
const WATCH_S = 20;
const WATCH_WINDOW_MS = 2000;
console.log(`\n--- parked at the top, watching for ${WATCH_S}s ---`);
console.log('   t(s)   fluid    con     draws/s   rendering');

let startedAt = null;
let peakAtTop = 0;
for (let s = 0; s < WATCH_S / 2; s++) {
  const a = await evaluate(`window.__state()`);
  await sleep(WATCH_WINDOW_MS);
  const b = await evaluate(`window.__state()`);
  const perSec = Math.round(((b.conDraws - a.conDraws) * 1000) / WATCH_WINDOW_MS);
  peakAtTop = Math.max(peakAtTop, perSec);
  if (perSec > 0 && startedAt === null) startedAt = (s + 1) * 2;
  console.log(
    `  ${String((s + 1) * 2).padStart(5)}   ${String(a.fluid).padStart(5)}  ${String(a.con).padStart(4)}  ` +
    `${String(perSec).padStart(9)}   ${perSec > 0 ? 'yes' : 'no '}`
  );
}

const positions = [
  0,
  200,
  500,
  Math.round(bottom / 2) - 20,   // 880 — just shy of the warm-up window
  Math.round(bottom / 2) + 20,   // 920 — just inside it
  1200,
  1700,
  1799,                          // last pixel the constellation is still hidden
  1801,                          // first pixel it is not
  2200,
  3200,
];

console.log('\n--- draw rate by scroll position ---');
console.log('     y   fluid    con     draws/s   rendering');

const readings = [];
for (const y of positions) {
  // Stepped rather than teleported, so ScrollTrigger sees a delta it can act on
  // instead of a jump it might treat as a refresh.
  await evaluate(`window.__drive(${y}, 420)`, { awaitPromise: true });
  await sleep(SETTLE_MS);

  const a = await evaluate(`window.__state()`);
  await sleep(SAMPLE_MS);
  const b = await evaluate(`window.__state()`);

  const perSec = Math.round(((b.conDraws - a.conDraws) * 1000) / SAMPLE_MS);
  readings.push({ y, perSec, fluid: b.fluid, con: b.con });
  console.log(
    `  ${String(y).padStart(5)}  ${String(a.fluid).padStart(5)}  ${String(a.con).padStart(4)}  ` +
    `${String(perSec).padStart(9)}   ${perSec > 0 ? 'yes' : 'no '}`
  );
}

// Back to the top, which is the case the whole check is about: a page that has
// been scrolled down and returned to the hero must switch the loop off again,
// or the waste is permanent rather than a cold-start artefact.
await evaluate(`window.__drive(0, 600)`, { awaitPromise: true });
await sleep(SETTLE_MS + 600);
const a = await evaluate(`window.__state()`);
await sleep(SAMPLE_MS);
const b = await evaluate(`window.__state()`);
const backTop = Math.round(((b.conDraws - a.conDraws) * 1000) / SAMPLE_MS);
console.log(`  ${String('0*').padStart(5)}  ${String(a.fluid).padStart(5)}  ${String(a.con).padStart(4)}  ${String(backTop).padStart(9)}   ${backTop > 0 ? 'yes' : 'no '}   (*returned to the top)`);

console.log('\n--- summary ---');
const firstOn = readings.find((r) => r.perSec > 0);
console.log(`  worst draw rate at the top         ${peakAtTop} draws/s${startedAt ? ` (first seen at ~${startedAt}s)` : ''}`);
console.log(`  renders at the top of the page     ${peakAtTop > 0 ? 'YES — gate not holding' : 'no'}`);
console.log(`  first position that renders        ${firstOn ? firstOn.y : '(none — never rendered)'}`);
console.log(`  still rendering after returning     ${backTop > 0 ? 'YES — gate not re-arming' : 'no'}`);
console.log(`  prefers-reduced-motion             ${geometry.reduced ? 'reduce (frameloop=demand)' : 'no-preference'}`);

await close();
