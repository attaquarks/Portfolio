// Does the About stamp's decode finish on its own?
//
// The claim under test is not "the stamp animates" — a scrubbed timeline
// animates too, and that is exactly what the stamp used to be. It is that the
// decode *completes with no further input*. So this approaches short of the
// release point, waits until the page is genuinely still, crosses the release
// with one nudge, and then samples the live phrase while nothing else touches
// the page. A decode wired to scroll position stalls on the frame it is left at;
// a decode on its own clock walks to the resolved phrase by itself.
//
//   node scripts/decodeprobe.mjs [url] [width] [height] [mode]
//
// Modes, because the act has two paths and the cue differs between them:
//
//   decode (default)  cross the release point inside the pinned act
//   stamp             bring the stamp into view — the entire cue on the static
//                     path, which is the path a short phone takes
//
// The `scrollY` column is the control, and the verdict reads it strictly: the
// phrase must grow *after* the last frame the page moved. If it does not, the run
// proves nothing, because a decode that finished while the page was still moving
// could have been carried by the scroll — which is the behaviour this change
// removed. The `pre` line is the second half of the control: the phrase must be
// unresolved before the nudge, so the growth is the decode and not a leftover.

import { spawn } from 'node:child_process';

const CHROME = 'C:\\Users\\Atta\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.PORT || 9222);
const url = process.argv[2] || 'http://localhost:4174/';
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);
const mode = process.argv[5] || 'decode';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function ready() {
  try {
    return (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok;
  } catch {
    return false;
  }
}
if (!(await ready())) {
  spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
    '--user-data-dir=' + (process.env.TEMP || '/tmp') + `\\shot-profile-${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    'about:blank',
  ], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 60 && !(await ready()); i++) await sleep(250);
}

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res) => ws.addEventListener('open', res, { once: true }));

let id = 0;
const pending = new Map();
const logs = [];

ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    logs.push(`[EXCEPTION] ${d.exception?.description || d.text}`);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setUserAgentOverride', { userAgent: MOBILE_UA });

await send('Page.navigate', { url });
await sleep(7000);

const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  return r.result?.result?.value;
};

// Two scroll positions, both measured in the page rather than guessed here, so
// the same script works on the pinned path and the static one. `before` must sit
// short of the cue and `after` comfortably past it.
const plan = await evalJs(`(() => {
  const act = document.querySelector('.act-about');
  const stamp = document.querySelector('.about-stamp');
  if (!act || !stamp) return null;
  const a = act.getBoundingClientRect();
  const stage = getComputedStyle(document.querySelector('.about-stage')).position;
  if (${JSON.stringify(mode)} === 'stamp') {
    // The static path: the stamp arriving is the cue, so the approach stops while
    // it is still below the 85% line and the nudge is what brings it in.
    const top = stamp.getBoundingClientRect().top + scrollY;
    return {
      before: Math.max(0, Math.round(top - innerHeight * 0.95)),
      after: Math.max(0, Math.round(top - innerHeight * 0.60)),
      actH: Math.round(a.height), stage,
    };
  }
  // DECODE_AT is 0.506 of the act's scroll range: 0.42 is short of it, 0.60 past.
  const range = a.height - innerHeight;
  const actTop = a.top + scrollY;
  return {
    before: Math.max(0, Math.round(actTop + range * 0.42)),
    after: Math.max(0, Math.round(actTop + range * 0.60)),
    actH: Math.round(a.height), stage,
  };
})()`);

if (!plan || !plan.actH) {
  console.log('MISSING: .act-about or .about-stamp not in the DOM.');
  ws.close();
  process.exit(1);
}

const stampState = () =>
  evalJs(`(() => {
    const el = document.querySelector('.about-stamp-live');
    const txt = el ? el.textContent || '' : '';
    return { y: Math.round(scrollY), len: txt.length, txt };
  })()`);

// Wheel events rather than scrollTo: Lenis owns the scroll, and a direct
// scrollTo would be fought by it. The last delta is clamped to the exact distance
// left so the loop cannot overshoot by up to a whole wheel's worth, and the loop
// is capped so a target that never arrives ends the run instead of hanging it.
const wheelTo = async (goal) => {
  let n = 0;
  while (n < 200) {
    const y = await evalJs('Math.round(scrollY)');
    if (y >= goal - 4) break;
    await send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: Math.round(width / 2),
      y: Math.round(height / 2),
      deltaX: 0,
      deltaY: Math.min(Math.round(height * 0.6), goal - y),
      modifiers: 0,
    });
    n++;
    await sleep(80);
  }
  return n;
};

// Lenis eases into its destination, so a fixed pause would start the run inside
// that tail. Three consecutive identical readings is the bar for "put down".
const waitStill = async () => {
  let prev = -1;
  let still = 0;
  for (let i = 0; i < 80 && still < 3; i++) {
    const y = await evalJs('Math.round(scrollY)');
    still = y === prev ? still + 1 : 0;
    prev = y;
    await sleep(120);
  }
};

const wheels = await wheelTo(plan.before);
await waitStill();
const pre = await stampState();

// One nudge, the exact distance remaining. Everything after this is sampled with
// no further input of any kind.
//
// WHEEL_SCALE is measured, not assumed: this emulation divides a dispatched wheel
// delta by deviceScaleFactor, so asking for the 396px remaining moved the page
// 132px and left the run parked short of the release point entirely. The loop is
// the safety net for the constant being wrong again — it converges regardless,
// just in more steps.
const WHEEL_SCALE = 3;
let nudges = 0;
let nudgeY = pre.y;
while (nudges < 24 && nudgeY < plan.after - 4) {
  await send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: Math.round(width / 2),
    y: Math.round(height / 2),
    deltaX: 0,
    deltaY: Math.min(
      Math.round(height * 0.6),
      Math.round((plan.after - nudgeY) * WHEEL_SCALE)
    ),
    modifiers: 0,
  });
  nudges++;
  await sleep(40);
  nudgeY = await evalJs('Math.round(scrollY)');
}

// Sampled straight away rather than after a settle wait: the decode is 2s long
// and the scroll settles in well under 1s, so waiting would only throw away the
// opening of the very thing being measured. The flatFrom calculation below is
// what makes the overlap harmless.
const rows = [];
for (let i = 0; i < 26; i++) {
  rows.push({ ms: i * 150, ...(await stampState()) });
  await sleep(150);
}

// The earliest sample from which the scroll never moves again. Growth after that
// index is growth with the page provably still.
let flatFrom = rows.length - 1;
for (let i = rows.length - 2; i >= 0; i--) {
  if (rows[i].y === rows[flatFrom].y) flatFrom = i;
  else break;
}

const last = rows[rows.length - 1];
const still = rows.slice(flatFrom);
// Movement measured over the still portion only. Measuring it over the whole
// window would fold in the tail of the nudge — which is the scroll arriving, not
// the scroll driving — and fail a run that passed.
const moved = Math.max(...still.map((r) => r.y)) - Math.min(...still.map((r) => r.y));
const grewWhileStill = last.len > rows[flatFrom].len;
const resolved = last.txt === 'TERMINAL ENTHUSIAST';
const startWasQuiet = pre.len <= 2;
const pass = moved <= 1 && grewWhileStill && resolved && startWasQuiet;

console.log(`=== ${url} @ ${width}x${height} (mobile, dpr3) ===`);
console.log(`mode: ${mode}   stage: ${plan.stage}   actH: ${plan.actH}px`);
console.log(`approach stopped at ${pre.y} after ${wheels} wheel events, held still, then ${nudges} nudge(s) to ${nudgeY}\n`);
console.log(`pre-nudge: ${pre.len} chars  ${pre.txt ? `"${pre.txt}"` : '(empty)'}`);
console.log('\n   ms   scrollY  chars  text');
for (const r of rows) {
  console.log(`${String(r.ms).padStart(5)}  ${String(r.y).padStart(7)}  ${String(r.len).padStart(5)}  ${r.txt}`);
}
console.log(`\nconsole: ${logs.length ? logs.join('\n') : '(clean)'}`);
console.log(`unresolved before the nudge:        ${startWasQuiet ? 'yes' : 'NO'}`);
console.log(`scroll held from sample ${flatFrom} (t=${rows[flatFrom].ms}ms) to the end`);
console.log(`scroll moved over that still stretch: ${moved}px`);
console.log(`phrase grew after the scroll stopped: ${grewWhileStill ? `yes — ${rows[flatFrom].len} to ${last.len} chars` : 'NO'}`);
console.log(`landed on the resolved phrase:        ${resolved ? 'yes' : 'NO'}`);
console.log(
  `\nVERDICT: ${pass
    ? 'the decode ran to completion on its own, with the page still.'
    : 'the decode did NOT demonstrably complete on its own — see the columns above.'}`
);

ws.close();
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
