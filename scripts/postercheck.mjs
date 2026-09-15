// Compare every candidate poster against a live frame of the shader, on one
// metric, in one browser session, at one viewport size.
//
//   node scripts/postercheck.mjs [url]
//
// The ratio metric in poster.mjs is not comparable between images: a perfectly
// smooth gradient scores a *higher* ratio than a genuinely blocky photograph,
// because the between-boundary energy it divides by has collapsed to noise. So
// this measures the thing a person actually sees instead — the size of the step
// at a block edge that the surrounding pixels do not explain.
//
//   step(x) = | (I(x+1) - I(x)) - 0.5 * ((I(x) - I(x-1)) + (I(x+2) - I(x+1))) |
//
// averaged down each column. A smooth gradient through the same pixel gives
// step ~ 0 whichever side of a block edge it sits on, so the only thing left in
// the number is the discontinuity the encoder stamped into the image. It is in
// luma levels, so it is directly comparable across encoders and against the
// live render.
//
// The live render is captured to a file and then measured through the exact
// same decode-and-measure path as the candidates, so nothing in the comparison
// depends on which decoder ran.

import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

const CHROME = 'C:\\Users\\Atta\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const url = process.argv[2] || 'http://localhost:4174/';
const PROFILE = (process.env.TEMP || '/tmp') + '\\postercheck-' + Date.now();
const REPO = 'C:\\Users\\Atta\\Documents\\Projects\\Portfolio';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDIDATES = [
  ['live @ t0', '/_lab-live.png'],
  ['live @ t0+14s', '/_lab-live2.png'],
  ['old poster (10 KB jpg)', '/fluid-poster.jpg'],
  ['new q92 webp', '/_lab-poster-q92.webp'],
  ['new q78 webp', '/_lab-poster-q78.webp'],
  ['new q92 jpg', '/_lab-poster-q92.jpg'],
  ['new q80 jpg', '/_lab-poster-q80.jpg'],
];

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
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value ?? r.result;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setScrollbarsHidden', { hidden: true });
await send('Page.navigate', { url });
await sleep(8000);

await evaluate(`(() => {
  document.querySelectorAll('main > *').forEach((el) => (el.style.visibility = 'hidden'));
  document.querySelectorAll('[class*="rail"],[class*="spine"],[class*="dock"],[class*="cue"],[class*="veil"]')
    .forEach((el) => (el.style.visibility = 'hidden'));
  return true;
})()`);
await sleep(600);

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
const buf = Buffer.from(shot.result.data, 'base64');
writeFileSync(`${REPO}\\dist\\_lab-live.png`, buf);
console.log(`live frame captured: ${(buf.length / 1024).toFixed(1)} KB`);

// A second live frame, this far apart. The field is animated, so if two live
// frames disagree on mean luma by as much as a candidate does, the candidates
// were simply captured at a different moment and nothing is wrong. If they
// agree, the difference is real and the capture path is at fault.
await sleep(14000);
const shot2 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
const buf2 = Buffer.from(shot2.result.data, 'base64');
writeFileSync(`${REPO}\\dist\\_lab-live2.png`, buf2);
console.log(`second live frame captured: ${(buf2.length / 1024).toFixed(1)} KB`);

const results = await evaluate(`(async () => {
  const measure = async (u) => {
    let bmp;
    try { bmp = await createImageBitmap(await (await fetch(u)).blob()); }
    catch (e) { return { url: u, error: String(e) }; }
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const L = (x, y) => { const i = (y * c.width + x) * 4; return 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]; };

    const x0 = 40, x1 = Math.round(c.width * 0.93), y0 = 40, y1 = Math.round(c.height * 0.93);
    const step = [], dx = [];
    for (let x = x0; x < x1; x++) {
      let s = 0, g = 0;
      for (let y = y0; y < y1; y++) {
        const a = L(x - 1, y), b = L(x, y), e = L(x + 1, y), f = L(x + 2, y);
        s += Math.abs((e - b) - 0.5 * ((b - a) + (f - e)));
        g += Math.abs(e - b);
      }
      step.push(s / (y1 - y0));
      dx.push(g / (y1 - y0));
    }

    const at = (N) => {
      let on = 0, onN = 0, off = 0, offN = 0;
      for (let k = 0; k < step.length; k++) {
        const p = (((x0 + k + 1) % N) + N) % N;
        if (p === 0) { on += step[k]; onN++; } else { off += step[k]; offN++; }
      }
      return { N, on: on / onN, off: off / offN, excess: on / onN - off / offN };
    };
    const all = [];
    for (let N = 2; N <= 32; N++) all.push(at(N));
    const named = [3, 4, 8, 9, 10, 16].map(at);
    const worst = [...all].sort((a, b) => b.excess - a.excess).slice(0, 3);

    let luma = 0, n = 0;
    for (let y = y0; y < y1; y += 4) for (let x = x0; x < x1; x += 4) { luma += L(x, y); n++; }

    return {
      url: u, size: [bmp.width, bmp.height], luma: luma / n,
      meanDx: dx.reduce((a, b) => a + b, 0) / dx.length,
      named, worst,
    };
  };
  const out = [];
  for (const u of ${JSON.stringify(CANDIDATES.map((c) => c[1]))}) out.push(await measure(u));
  return out;
})()`);

console.log('\n  surface                     size       luma  mean|dx|   ' +
  'N=4 step   N=8 step   N=10 step   worst');
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  if (r.error) { console.log(`  ${CANDIDATES[i][0].padEnd(24)} ERROR ${r.error}`); continue; }
  const g = (N) => r.named.find((v) => v.N === N).excess;
  console.log(
    `  ${CANDIDATES[i][0].padEnd(24)} ${r.size.join('x').padEnd(10)} ` +
    `${r.luma.toFixed(1).padStart(5)} ${r.meanDx.toFixed(3).padStart(8)}   ` +
    `${g(4).toFixed(3).padStart(7)}   ${g(8).toFixed(3).padStart(7)}   ` +
    `${g(10).toFixed(3).padStart(8)}   ` +
    r.worst.map((w) => `N=${w.N}:${w.excess.toFixed(3)}`).join(' ')
  );
}
console.log('\n  (steps are in luma levels, 0-255. The live render is the target the poster should match.)');

ws.close();
try { child.kill(); } catch {}
await sleep(1500);
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
