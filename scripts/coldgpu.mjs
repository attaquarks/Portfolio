// Reproduce a first-time visitor on real hardware: headful Chrome (real GPU,
// not SwiftShader) with a throwaway profile, so the shader cache is cold the
// way it is for someone opening the link for the first time.
//
//   node scripts/coldgpu.mjs <url>
//
// Reports when the document reaches `complete` and, more importantly, whether
// the page keeps painting frames throughout — a stalled GPU process shows up as
// a rAF gap, not as an error in the console.

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const CHROME = 'C:\\Users\\Atta\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const url = process.argv[2] || 'http://localhost:4174/';
const PROFILE = (process.env.TEMP || '/tmp') + '\\coldgpu-' + Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
  `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--mute-audio',
  '--window-size=1440,900', '--window-position=0,0',
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
await send('Network.enable');
const block = (process.argv[3] || '').split(',').filter(Boolean);
if (block.length) await send('Network.setBlockedURLs', { urls: block });

// Install the frame recorder before navigating, via a script that survives the
// navigation, so the very first frames are measured too.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__frames = [];
    window.__loadAt = null;
    addEventListener('load', () => { window.__loadAt = Math.round(performance.now()); });
    (function tick() {
      window.__frames.push(Math.round(performance.now()));
      requestAnimationFrame(tick);
    })();
  `,
});

await send('Page.navigate', { url });
await sleep(30000);

const expr = `(() => {
  const f = window.__frames || [];
  let worst = 0, worstAt = 0;
  for (let i = 1; i < f.length; i++) {
    const gap = f[i] - f[i - 1];
    if (gap > worst) { worst = gap; worstAt = f[i - 1]; }
  }
  const gaps = [];
  for (let i = 1; i < f.length; i++) if (f[i] - f[i-1] > 500) gaps.push((f[i]-f[i-1]) + 'ms @' + f[i-1]);
  return {
    readyState: document.readyState,
    loadEventAt: window.__loadAt,
    frameCount: f.length,
    firstFrameAt: f[0],
    lastFrameAt: f[f.length - 1],
    worstGapMs: worst,
    worstGapAt: worstAt,
    stalls: gaps,
    fluidLive: document.querySelector('.fluid-layer')?.dataset.live ?? 'not-live',
    docH: document.documentElement.scrollHeight,
  };
})()`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(JSON.stringify(r.result?.result?.value ?? r.result, null, 2));

ws.close();
try { child.kill(); } catch {}
await sleep(1500);
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
