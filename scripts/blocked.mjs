// Experiment: load the page with a set of URL patterns blocked, then report
// whether the page still finishes loading and whether the content below the
// hero is actually visible.
//
//   node scripts/blocked.mjs <url> <scrollPx> <pattern[,pattern...]>
//
// The point is to simulate a visitor whose network is slower or more hostile
// than the developer's, which is the one condition a local check never covers.

import { spawn } from 'node:child_process';

const CHROME = 'C:\\Users\\Atta\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;
const url = process.argv[2] || 'http://localhost:4174/';
const scrollTo = Number(process.argv[3] || 3200);
const patterns = (process.argv[4] || '').split(',').filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  try { return (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok; } catch { return false; }
}
if (!(await ready())) {
  spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
    '--user-data-dir=' + (process.env.TEMP || '/tmp') + '\\shot-profile',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--enable-unsafe-swiftshader', 'about:blank',
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
await send('Network.enable');
if (patterns.length) await send('Network.setBlockedURLs', { urls: patterns });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(6000);

// Scroll the way a reader does, then give the scrubbed reveals time to land.
await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${scrollTo})` });
await sleep(2500);

const expr = `(() => {
  const vis = [...document.querySelectorAll('[data-reveal]')].map((el) => {
    const r = el.getBoundingClientRect();
    return { onScreen: r.top < innerHeight && r.bottom > 0, op: +getComputedStyle(el).opacity };
  });
  const onScreen = vis.filter((v) => v.onScreen);
  return {
    readyState: document.readyState,
    scrollY: Math.round(window.scrollY),
    docH: document.documentElement.scrollHeight,
    revealTotal: vis.length,
    revealOnScreen: onScreen.length,
    revealOnScreenHidden: onScreen.filter((v) => v.op < 0.05).length,
    allOpacities: vis.map((v) => v.op.toFixed(2)).join(' '),
  };
})()`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(`blocked: ${patterns.join(', ') || '(nothing)'}`);
console.log(JSON.stringify(r.result?.result?.value ?? r.result, null, 2));

ws.close();
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
