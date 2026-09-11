// Diagnostic: load the page, capture every console message, exception and failed
// request, then report layout metrics. Answers "why is the page blank" without
// guessing, which the screenshot script cannot do.
//
//   node scripts/diag.mjs [url] [waitMs] [width] [height]

import { spawn } from 'node:child_process';

const CHROME = 'C:\\Users\\Atta\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;
const url = process.argv[2] || 'http://localhost:4174/';
const wait = Number(process.argv[3] || 6000);
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
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
const logs = [];
const failures = [];

ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = (m.params.args || [])
      .map((a) => a.value ?? a.description ?? a.unserializableValue ?? a.type)
      .join(' ');
    logs.push(`[${m.params.type}] ${text}`);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    logs.push(`[EXCEPTION] ${d.exception?.description || d.text}`);
  }
  if (m.method === 'Network.loadingFailed') {
    failures.push(`${m.params.type} ${m.params.errorText}`);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width, height, deviceScaleFactor: 1, mobile: width < 768,
});
await send('Page.navigate', { url });
await sleep(wait);

const probe = `(() => {
  const root = document.getElementById('root');
  const sections = [...document.querySelectorAll('main > *')].map((el) => ({
    tag: el.tagName.toLowerCase(),
    id: el.id || el.className || '-',
    h: Math.round(el.getBoundingClientRect().height),
  }));
  return {
    rootChildren: root ? root.children.length : 'NO ROOT',
    rootHTMLLength: root ? root.innerHTML.length : 0,
    docH: document.documentElement.scrollHeight,
    bodyH: document.body.scrollHeight,
    innerH: window.innerHeight,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
    bodyHeightStyle: getComputedStyle(document.body).height,
    scrollTriggers: (window.ScrollTrigger?.getAll?.() || []).length,
    sections,
  };
})()`;

const r = await send('Runtime.evaluate', { expression: probe, returnByValue: true, awaitPromise: true });

console.log('=== CONSOLE ===');
console.log(logs.length ? logs.join('\n') : '(clean)');
console.log('\n=== FAILED REQUESTS ===');
console.log(failures.length ? [...new Set(failures)].join('\n') : '(none)');
console.log('\n=== LAYOUT ===');
console.log(JSON.stringify(r.result?.result?.value ?? r.result, null, 2));

ws.close();
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
