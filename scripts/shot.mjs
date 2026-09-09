// Headless screenshot helper driven over the Chrome DevTools Protocol.
//
// Chrome's `--screenshot` CLI flag can't scroll, resize, or wait for a WebGL
// frame, all of which this project's scroll-driven scenes need. CDP over Node's
// native WebSocket gives that control with no extra dependency.
//
//   node scripts/shot.mjs --out shots/hero.png --w 1440 --h 900 --scroll 0.35
//
// --scroll takes 0..1 as a fraction of scrollable height, or a raw px value >1,
// or a CSS selector to scroll to. Chrome is reused across runs via a fixed
// debugging port, so a batch of shots costs one browser launch.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const CHROME = 'C:\\Users\\Atta\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const url = arg('url', 'http://localhost:5173/');
const out = arg('out', 'shots/shot.png');
const width = Number(arg('w', 1440));
const height = Number(arg('h', 900));
const dsf = Number(arg('dsf', 1));
const wait = Number(arg('wait', 2200));
const scroll = arg('scroll', '0');
const mobile = has('mobile');
const full = has('full');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function chromeReady() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
}

async function launch() {
  if (await chromeReady()) return;
  spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      '--remote-allow-origins=*',
      '--user-data-dir=' + (process.env.TEMP || '/tmp') + '\\shot-profile',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--mute-audio',
      // The hero background video must start without a user gesture, and the
      // R3F scenes need a real WebGL context (SwiftShader in headless).
      '--autoplay-policy=no-user-gesture-required',
      '--enable-unsafe-swiftshader',
      '--disable-background-timer-throttling',
      'about:blank',
    ],
    { detached: true, stdio: 'ignore' }
  ).unref();

  for (let i = 0; i < 60; i++) {
    await sleep(250);
    if (await chromeReady()) return;
  }
  throw new Error('Chrome did not expose a debugging port in 15s');
}

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

await launch();

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});
const cdp = new Session(ws);

await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: dsf,
  mobile,
});

await cdp.send('Page.navigate', { url });
await sleep(wait);

// Scroll deterministically, then let scroll-driven animation settle. Lenis
// smooths programmatic scroll too, so jump the raw position and let the
// GSAP ticker catch up rather than animating there.
if (scroll && scroll !== '0') {
  const expr = /^[\d.]+$/.test(scroll)
    ? Number(scroll) <= 1
      ? `window.scrollTo(0, (document.body.scrollHeight - innerHeight) * ${scroll})`
      : `window.scrollTo(0, ${scroll})`
    : `document.querySelector(${JSON.stringify(scroll)})?.scrollIntoView()`;
  await cdp.send('Runtime.evaluate', { expression: expr });
  await sleep(1600);
}

const shot = await cdp.send('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: full,
  ...(full ? {} : { clip: undefined }),
});

if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(shot.data, 'base64'));

const logs = await cdp.send('Runtime.evaluate', {
  expression: 'JSON.stringify(window.__shotErrors || [])',
  returnByValue: true,
});
ws.close();
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);

console.log(`${out}  ${width}x${height}@${dsf}x  scroll=${scroll}`);
if (logs.result?.value && logs.result.value !== '[]') console.log('page errors:', logs.result.value);
