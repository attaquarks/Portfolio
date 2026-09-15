// The handoff, on real hardware, at the scroll position it happens on.
//
//   node scripts/handoff.mjs [url]
//
// coldgpu.mjs answers "does the page load and keep painting", but it never
// scrolls, and everything new in this pass happens 1800px down. This is the same
// harness shape — headful Chrome, throwaway profile, real GPU, cold shader cache
// — with the scroll driven through the boundary at a human rate and three
// questions asked at once:
//
//   1. did the constellation's canvas actually draw before the wallpaper cut?
//      A WebGL scene compiles every shader it will ever use on its first frame.
//      If that first frame lands on the handoff, the cut is the first thing
//      anyone sees of it and it is the wrong thing. Answered from a draw-call
//      histogram rather than inferred, because "it looked fine" is not available
//      here.
//   2. are the two backdrops ever up at the same time? The handoff is a cut, and
//      a cut that overlaps is a dissolve at the wrong intensity.
//   3. did the crossing stall the frame loop?
//
// The frame recorder and the WebGL hook are installed with
// Page.addScriptToEvaluateOnNewDocument, so they are in place before any of the
// page's own script runs and the first frame of the fluid canvas is measured
// too, not just the ones after load.
//
// Two things this harness needs that a headless one does not. First, a real
// viewport: a headful window at --window-size=1440,900 has ~200px of browser
// chrome in it, so svh units resolve against 700 and every boundary in the page
// lands 22% short of where the probe says it is. The device metrics override
// pins it at 1440x900 so these numbers and the probe's are the same numbers.
// Second, --disable-features=CalculateNativeWinOcclusion: a window that opens
// behind another window is *occluded*, and Chrome stops compositing it. An
// earlier run of this lost 1.8 seconds of fluid draws and four shader links
// arrived in a burst when the window came back — the page had been frozen, and
// the whole measurement was of the harness rather than of the site.

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import GL_INJECT from './glinject.mjs';

const CHROME = 'C:\\Users\\Atta\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const url = process.argv[2] || 'http://localhost:4174/';
const PROFILE = (process.env.TEMP || '/tmp') + '\\handoff-' + Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
  `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--mute-audio',
  '--window-size=1440,900', '--window-position=0,0',
  '--disable-features=CalculateNativeWinOcclusion',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  'about:blank',
], { detached: true, stdio: 'ignore' });
child.unref();

async function ready() {
  try { return (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok; } catch { return false; }
}
for (let i = 0; i < 80 && !(await ready()); i++) await sleep(250);

const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
console.log('browser:', ver.Browser);

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res) => ws.addEventListener('open', res, { once: true }));

let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) =>
  new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Emulation.setScrollbarsHidden', { hidden: true });

await send('Page.addScriptToEvaluateOnNewDocument', { source: GL_INJECT });

await send('Page.navigate', { url });
await sleep(25000);

const loadFacts = await send('Runtime.evaluate', {
  expression: `(() => {
    const f = window.__frames || [];
    let worst = 0;
    for (let i = 1; i < f.length; i++) if (f[i] - f[i-1] > worst) worst = f[i] - f[i-1];
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      boundary: (() => {
        const hero = document.querySelector('.hero');
        return hero ? hero.offsetTop + hero.offsetHeight : null;
      })(),
      loadEventAt: window.__loadAt,
      firstFrameAt: f[0],
      worstGapBeforeScroll: worst,
      fluidLive: document.querySelector('.fluid-layer')?.dataset.live ?? 'not-live',
      glFirstDrawAt: window.__gl.firstDrawAt,
      glFirstDrawByCanvas: window.__gl.first,
      programsLinked: window.__gl.programs.length,
      programsBefore: window.__gl.programs.filter((t) => t < (window.__loadAt || 1e9)).length,
    };
  })()`,
  returnByValue: true,
});
const facts = loadFacts.result?.result?.value ?? loadFacts.result;
console.log('\n--- cold load ---');
console.log(JSON.stringify(facts, null, 2));

// Past the boundary at a brisk 1400px/s — fast enough that a hitch has nowhere
// to hide, slow enough that the 96px cut spans several frames and is actually
// sampled rather than stepped over.
const boundary = facts.boundary || 1800;
const scrollTo = Math.round(boundary + 600);
const duration = Math.round(scrollTo / 1.4);
const drive = await send('Runtime.evaluate', {
  expression: `window.__drive(${scrollTo}, ${duration})`,
  awaitPromise: true,
  returnByValue: true,
});
const trace = drive.result?.result?.value ?? [];
console.log(`\n--- scroll trace (${trace.length} frames, 0 -> ${scrollTo} over ${duration}ms) ---`);
console.log('  t(ms)  scrollY   fluid    con  conDraws');

const crossing = trace.find((r) => r[1] >= boundary);
const crossingAt = crossing ? crossing[0] : null;
// The handoff is a cut, so the only thing to check either side of it is that
// the two backdrops are never both up: the fluid must be at 0 on every frame
// the constellation is above 0, and vice versa.
const overlaps = trace.filter((r) => +r[2] > 0.02 && +r[3] > 0.02);
// Only the frames around the crossing, so the table stays readable.
const near = trace.filter((r) => crossingAt !== null && Math.abs(r[0] - crossingAt) < 420);
for (const r of near) {
  console.log(
    `  ${String(r[0]).padStart(5)}  ${String(r[1]).padStart(6)}  ` +
    `${String(r[2]).padStart(6)}  ${String(r[3]).padStart(4)}  ${String(r[4]).padStart(8)}`
  );
}
console.log(`  frames with both backdrops up at once: ${overlaps.length}`);
if (overlaps.length) console.log('   ', JSON.stringify(overlaps.slice(0, 8)));

// Frame gaps during the drive, measured against the trace's own clock so the
// window is exactly the crossing's neighbourhood. This is the number the whole
// harness exists for: a stall on the handoff is visible here and nowhere else,
// because nothing else in the page is doing work at that scroll position.
//
// The top few rather than only the worst, with the scroll position they landed
// on, because "100ms somewhere in the drive" is not actionable and "63ms at
// scrollY 1795" is.
const gaps = [];
for (let i = 1; i < trace.length; i++) {
  gaps.push({ t: trace[i][0], gap: trace[i][0] - trace[i - 1][0], y: trace[i][1] });
}
const worstInCrossing = Math.max(
  0,
  ...gaps.filter((g) => crossingAt !== null && Math.abs(g.t - crossingAt) < 400).map((g) => g.gap)
);
const worstInDrive = gaps.reduce((a, g) => (g.gap > a.gap ? g : a), { gap: 0 });

const after = await send('Runtime.evaluate', {
  expression: `(() => {
    const f = window.__frames || [];
    let worstAll = 0, worstAllAt = 0;
    for (let i = 1; i < f.length; i++) {
      const g = f[i] - f[i-1];
      if (g > worstAll) { worstAll = g; worstAllAt = f[i-1]; }
    }
    const gapsAfter = [];
    for (let i = 1; i < f.length; i++) if (f[i] - f[i-1] > 120) gapsAfter.push((f[i]-f[i-1]) + 'ms @' + (f[i-1] - f[0]));
    return {
      frameCount: f.length,
      worstGapWholeRun: worstAll,
      worstGapAt: worstAllAt - f[0],
      gapsOver120ms: gapsAfter,
      glFirst: window.__gl.first,
      glLast: window.__gl.last,
      glCount: window.__gl.count,
      glBuckets: window.__gl.buckets,
      programsLinkedTotal: window.__gl.programs.length,
      programLinksRelative: window.__gl.programs.map((t) => t - f[0]),
      state: window.__state(),
    };
  })()`,
  returnByValue: true,
});
console.log('\n--- frames and GL ---');
const gl = after.result?.result?.value ?? {};
console.log(JSON.stringify(gl, null, 2));

console.log('\n--- summary ---');
const keyOf = (fragment) => Object.keys(gl.glFirst || {}).find((k) => k.includes(fragment));
const conKey = keyOf('constellation');
console.log(`  crossing at               ${crossingAt} ms into the drive`);
console.log(`  constellation surface     ${conKey ?? '(never drew under a named key)'}`);
if (conKey) {
  console.log(`  constellation 1st draw    +${gl.glFirst[conKey]} ms page-time (${gl.glCount[conKey]} draws)`);
  console.log(`  constellation last draw   +${gl.glLast[conKey]} ms page-time`);
}
console.log(`  fluid surface             ${keyOf('fluid') ?? '(never drew)'} — last draw +${gl.glLast?.[keyOf('fluid')] ?? '?'} ms`);
console.log(`  worst frame gap, crossing ${worstInCrossing} ms`);
console.log(`  worst frame gap, drive    ${worstInDrive.gap} ms at t=${worstInDrive.t} (scrollY ${worstInDrive.y})`);
console.log(`  worst frame gap, whole run ${gl.worstGapWholeRun} ms at +${gl.worstGapAt} ms`);
console.log(`  document load event       +${facts.loadEventAt} ms`);
console.log(`  slowest frames in the crossing window:`);
for (const g of gaps.filter((x) => crossingAt !== null && Math.abs(x.t - crossingAt) < 400)
  .sort((a, b) => b.gap - a.gap).slice(0, 6)) {
  console.log(`    ${String(g.gap).padStart(4)} ms at t=${g.t} (scrollY ${g.y})`);
}

// One line per second, per surface: a burst and a trickle have the same total
// and only the histogram tells them apart.
const buckets = gl.glBuckets || {};
const seconds = [...new Set(Object.keys(buckets).map((k) => k.split('@')[1]))].map(Number).sort((a, b) => a - b);
if (seconds.length) {
  console.log('\n  draws per second (sec: surfaces)');
  for (const s of seconds) {
    const row = Object.keys(buckets)
      .filter((k) => k.endsWith('@' + s))
      .map((k) => k.split('@')[0] + '=' + buckets[k]);
    console.log(`    ${String(s).padStart(3)}s  ${row.join('  ')}`);
  }
}

// One pass is not a measurement.
//
// The same build, driven through the same boundary the same way, has produced a
// worst crossing gap of 23ms in one run and 98ms in another — a spread four
// times the size of anything being tested, which makes a single cold pass
// useless for saying whether the handoff got better or worse. So the crossing is
// driven three more times and reported pass by pass. The first pass is the cold
// one and is kept separate for that reason; if the later passes are clean then
// the number worth acting on is the first, and if they are not then the stall
// is in the page rather than in the cold cache.
console.log('\n--- repeat crossings (warm) ---');
console.log('  pass   worst gap   gap at crossing   both up');

const worstAt = (gapsOf, at) =>
  Math.max(0, ...gapsOf.filter((g) => Math.abs(g.t - at) < 400).map((g) => g.gap));

for (let pass = 1; pass <= 3; pass++) {
  // Down to the top first, stepped rather than teleported so ScrollTrigger sees
  // a direction and the loop switches off the way it would for a reader.
  await send('Runtime.evaluate', {
    expression: 'window.__drive(0, 500)',
    awaitPromise: true,
    returnByValue: true,
  });
  await sleep(1200);

  const r = await send('Runtime.evaluate', {
    expression: `window.__drive(${scrollTo}, ${duration})`,
    awaitPromise: true,
    returnByValue: true,
  });
  const t = r.result?.result?.value ?? [];
  const g = [];
  for (let i = 1; i < t.length; i++) g.push({ t: t[i][0], gap: t[i][0] - t[i - 1][0] });
  const at = (t.find((row) => row[1] >= boundary) || [null])[0];
  const worst = g.reduce((a, x) => (x.gap > a.gap ? x : a), { gap: 0, t: 0 });
  const both = t.filter((row) => +row[2] > 0.02 && +row[3] > 0.02).length;
  console.log(
    `  ${String(pass).padStart(4)}   ${String(worst.gap).padStart(8)}   ` +
    `${String(at === null ? 'n/a' : worstAt(g, at)).padStart(14)}   ${String(both).padStart(7)}`
  );
}

ws.close();
try { child.kill(); } catch {}
await sleep(1500);
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
