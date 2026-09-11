// One-off DOM probe over CDP. `node scripts/probe.mjs "<js expression>"`
// Returns the JSON-serialised result, for checking computed styles and layout
// against the real rendered page instead of reasoning about the cascade.
//
//   node scripts/probe.mjs "<expr>" [url] [waitMs] [width] [height]
//
// Width/height matter more than they look: half the layout questions worth
// probing are the ones that only go wrong at one breakpoint.
//
// Set REDUCED=1 to emulate `prefers-reduced-motion: reduce` — the preference
// changes the page's whole structure (the acts collapse and no renderer is
// mounted), so it has to be probed as its own layout, not as a modifier.

import { spawn } from 'node:child_process';

const CHROME = 'C:\\Users\\Atta\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;
const expression = process.argv[2];
const url = process.argv[3] || 'http://localhost:5173/';
const wait = Number(process.argv[4] || 2200);
const width = Number(process.argv[5] || 1440);
const height = Number(process.argv[6] || 900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  width,
  height,
  deviceScaleFactor: 1,
  mobile: width < 768,
});
// Before navigation, so the page's first render already sees the preference.
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-motion', value: process.env.REDUCED ? 'reduce' : 'no-preference' }],
});
await send('Page.navigate', { url });
await sleep(wait);

const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
console.log(JSON.stringify(r.result?.result?.value ?? r.result, null, 2));

ws.close();
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
