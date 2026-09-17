// What does a main-thread stall do to a smooth scroll that is already moving?
//
// This is the one question `mobilediag.mjs` cannot answer. That script reports
// frame gaps, and a frame gap tells you the stall happened — not what the scroll
// did about it. The failure this exists to catch is silent in gap statistics:
// the stall ends, and instead of resuming, the scroll *completes*, teleporting
// to its destination. Same gap, completely different feeling.
//
// So this drives a known distance, blocks the main thread mid-flight for a known
// duration, and reports the largest single-frame scroll delta. The two outcomes
// are orders of magnitude apart, not percentages:
//
//   scroll resumes     → the biggest step is a normal frame's worth, tens of px
//   scroll completed   → the biggest step is most of the remaining distance
//
//   node scripts/stallprobe.mjs [url] [stallMs] [driveMs]
//
// Default stall is 900ms, deliberately past GSAP's 500ms lag threshold, so the
// clamp is actually exercised. Pass 300 to confirm a sub-threshold stall is
// untouched — the two numbers should look the same in the fixed build.

import { spawn } from 'node:child_process';

const CHROME = 'C:\\Users\\Atta\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;
const url = process.argv[2] || 'http://localhost:4174/';
const stallMs = Number(process.argv[3] || 900);
const driveMs = Number(process.argv[4] || 700);
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
    '--user-data-dir=' + (process.env.TEMP || '/tmp') + '\\shot-profile',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', 'about:blank',
  ], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 60 && !(await ready()); i++) await sleep(250);
}

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
  width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
});
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setUserAgentOverride', { userAgent: MOBILE_UA });
await send('Page.navigate', { url });

// Long enough that mount effects have run and Lenis is attached. A wheel event
// delivered before that is a native scroll, which has no smoothing to test.
await sleep(3500);

// Sample scroll position every frame, from before the gesture to after it.
await send('Runtime.evaluate', {
  expression: `
    window.__s = [];
    window.__stall = 0;
    (() => {
      const step = () => {
        window.__s.push([Math.round(performance.now()), Math.round(window.scrollY)]);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    })();
  `,
});

// One gesture, so the scroll in flight is Lenis' own smooth animation rather
// than a native jump.
await send('Input.dispatchMouseEvent', {
  type: 'mouseWheel', x: 195, y: 422, deltaX: 0, deltaY: driveMs, modifiers: 0,
});

// Mid-flight, not before it starts and not after it lands.
await sleep(120);
await send('Runtime.evaluate', {
  expression: `
    (() => {
      window.__pre = { y: scrollY, t: Math.round(performance.now()) };
      const t0 = performance.now();
      while (performance.now() - t0 < ${stallMs}) {}
      window.__post = { y: scrollY, t: Math.round(performance.now()) };
    })();
  `,
});
await sleep(2600);

const r = await send('Runtime.evaluate', {
  expression: `
    (() => {
      const s = window.__s;
      const pre = window.__pre, post = window.__post;
      // The first frame drawn after the block ended. This is the frame that
      // decides everything: it is where a completed scroll and a resumed one
      // look nothing alike.
      const after = s.find((p) => p[0] > post.t);
      const stepAfterStall = after ? Math.abs(after[1] - pre.y) : null;
      const finalY = Math.round(scrollY);
      const remainingAtStall = finalY - pre.y;
      return {
        stallMeasuredMs: post.t - pre.t,
        yAtStall: pre.y,
        yRightAfterStall: post.y,
        finalScrollY: finalY,
        remainingAtStall: Math.round(remainingAtStall),
        stepOnFirstFrameAfterStall: stepAfterStall,
        // ~0.1-0.3 is a resumed scroll: one clamped frame's share of what was
        // left. ~1.0 is a completed one: the stall ate the whole remainder.
        shareOfRemainderEatenByStallFrame:
          remainingAtStall > 4 ? +(stepAfterStall / remainingAtStall).toFixed(3) : null,
        trace: s
          .filter((p) => p[0] > pre.t - 220 && p[0] < post.t + 700)
          .map((p) => [p[0] - pre.t, p[1]]),
      };
    })()
  `,
  returnByValue: true,
});

console.log(`=== stall probe: ${url} ===`);
console.log(`blocked main thread for ${stallMs}ms, 120ms into a ${driveMs}px smooth scroll\n`);
console.log(JSON.stringify(r.result?.result?.value ?? r.result, null, 2));

ws.close();
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
