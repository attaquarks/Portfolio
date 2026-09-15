// Rebuild the wallpaper poster from a real frame of the live shader, and prove
// the replacement is faithful.
//
//   node scripts/poster.mjs [url]
//
// `public/fluid-poster.jpg` is what the page paints before the WebGL canvas goes
// live, what it paints if WebGL is unavailable, and what it paints under
// reduced motion. Measured with scripts/wallwalk.mjs it carries a 26% excess of
// edge energy on 8-pixel boundaries and an 8-pixel step of 0.45 luma levels
// against the live render's 0.11 — the DCT block of a JPEG saved at roughly
// 0.011 bits per pixel. It is also 68 luma where the live surface is 39, so the
// page currently jumps brighter and coarser the moment the poster appears and
// drops back when the canvas crossfades in.
//
// Everything here happens in one browser session on purpose. Two sessions are
// not the same session: an earlier version of this captured the poster in one
// run and the live frame to compare it against in another, and the two disagreed
// by 2.3x on mean |dx| and 13 luma levels on a surface neither had changed. The
// reference is therefore captured between the same two calls as the candidates,
// and every number is measured back through the browser's own decoder against
// that reference.

import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const CHROME = 'C:\\Users\\Atta\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const url = process.argv[2] || 'http://localhost:4174/';
const PROFILE = (process.env.TEMP || '/tmp') + '\\poster-' + Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REPO = 'C:\\Users\\Atta\\Documents\\Projects\\Portfolio';

/** Enough of PNG to check a capture in Node, without another encoder in the way. */
function decodePNG(buf) {
  let off = 8, w = 0, h = 0, ctype = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ctype = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const ch = ctype === 6 ? 4 : ctype === 2 ? 3 : 0;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const line = raw.subarray(p, p + stride);
    p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev ? prev[i] : 0, c = prev && i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[i] = v;
    }
  }
  return { w, h, ch, data: out };
}

// ---------------------------------------------------------------- browser

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

// Leave the wallpaper and nothing else. The poster is served to people who have
// no canvas at all, so it must not carry rails, copy or cues that only exist
// when the rest of the page does. Text is also edges, and edges are what every
// metric below measures.
const stripped = await evaluate(`(() => {
  const hidden = [];
  const hide = (el) => { el.style.visibility = 'hidden'; hidden.push(el.className || el.tagName); };
  const layer = document.querySelector('.fluid-layer');
  const before = { scrollY: Math.round(window.scrollY), opacity: getComputedStyle(layer).opacity };
  document.querySelectorAll('main > *').forEach(hide);
  document.querySelectorAll('[class*="rail"],[class*="spine"],[class*="dock"],[class*="cue"],[class*="veil"]')
    .forEach(hide);
  // The layer's own opacity is animated by scroll, and the poster lives inside
  // it — so capturing through a partly-transparent layer bakes that frame of the
  // animation into the poster, which the real layer then applies *again* at
  // runtime. An earlier run of this captured at 0.618 and produced a poster 8
  // luma levels darker than the surface it stands in for, with the number
  // drifting between runs as the scroll position drifted. Pinned open instead:
  // the poster is the wallpaper at full strength, and the layer does the fading.
  window.scrollTo(0, 0);
  layer.style.setProperty('--fluid-opacity', '1');
  return { hidden, live: layer.dataset.live ?? 'not-live', before, after: getComputedStyle(layer).opacity };
})()`);
console.log('stripped:', stripped.hidden.length, 'elements; fluid live =', stripped.live);
console.log('layer opacity — harness found it at', stripped.before.opacity,
  '(scrollY', stripped.before.scrollY + '), pinned to', stripped.after, 'for the capture');
if (stripped.live !== 'true') { console.log('aborting: the shader never painted'); process.exit(1); }

await sleep(500);
const facts = await evaluate(`(() => {
  const c = document.querySelector('.fluid-canvas');
  const l = document.querySelector('.fluid-layer');
  const r = c.getBoundingClientRect();
  return {
    buffer: [c.width, c.height],
    css: [Math.round(r.width), Math.round(r.height)],
    upscale: +(r.width / c.width).toFixed(3),
    layerOpacity: getComputedStyle(l).opacity,
    canvasOpacity: getComputedStyle(c).opacity,
    inner: [innerWidth, innerHeight],
    dpr: devicePixelRatio,
  };
})()`);
console.log('render facts:', JSON.stringify(facts));

const grab = async (format, quality, name) => {
  const params = { format, captureBeyondViewport: false };
  if (quality) params.quality = quality;
  const r = await send('Page.captureScreenshot', params);
  if (!r.result?.data) { console.log(`  ${format}: capture failed`, JSON.stringify(r.error ?? r)); return null; }
  const buf = Buffer.from(r.result.data, 'base64');
  // Prefixed so the whole experiment is one directory listing away from being
  // thrown out; only the winner gets promoted to fluid-poster.*.
  writeFileSync(`${REPO}\\public\\${name}`, buf);
  writeFileSync(`${REPO}\\dist\\${name}`, buf);
  return buf;
};

console.log('\nencodings (KB):');
const written = [];
const variants = [
  ['webp', 92, '_lab-poster-q92.webp'],
  ['webp', 78, '_lab-poster-q78.webp'],
  ['jpeg', 92, '_lab-poster-q92.jpg'],
  ['jpeg', 80, '_lab-poster-q80.jpg'],
];
for (const [format, quality, name] of variants) {
  const buf = await grab(format, quality, name);
  if (buf) { console.log(`  ${name.padEnd(26)} ${(buf.length / 1024).toFixed(1)} KB`); written.push(name); }
}
// Interleaved with the candidates rather than taken first, so drift in the
// animated field cannot land entirely on one side of the comparison.
const ref = await grab('png', null, '_lab-live.png');
console.log(`  ${'_lab-live.png'.padEnd(26)} ${(ref.length / 1024).toFixed(1)} KB`);

console.log('\nin-capture check (PNG reference, decoded here in Node):');
{
  const img = decodePNG(ref);
  let s = 0, n = 0, luma = 0;
  for (let y = 40; y < img.h * 0.93; y += 2)
    for (let x = 40; x < img.w * 0.93; x += 2) {
      const i = (y * img.w + x) * img.ch;
      luma += 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
      if (x + 1 < img.w) {
        const j = (y * img.w + x + 1) * img.ch;
        s += Math.abs(img.data[i] - img.data[j]);
      }
      n++;
    }
  console.log(`  reference ${img.w}x${img.h}  luma ${(luma / n).toFixed(1)}  mean|dx| ${(s / n).toFixed(3)}`);
}

// Measure every written file through the browser's own decoder, against the
// reference it was captured beside.
//
// The ratio metric used on its own is not comparable between images: a perfectly
// smooth gradient scores a *higher* ratio than a genuinely blocky photograph,
// because the between-boundary energy it divides by has collapsed to noise. This
// measures the thing a person actually sees instead — the step at a block edge
// that the surrounding pixels do not explain:
//
//   step(x) = | (I(x+1) - I(x)) - 0.5 * ((I(x) - I(x-1)) + (I(x+2) - I(x+1))) |
//
// averaged down each column. A smooth gradient through the same pixel leaves
// step ~ 0 whichever side of a block edge it sits on, so what remains is the
// discontinuity the encoder stamped in. It is in luma levels, so it is directly
// comparable across encoders and against the live render.
console.log('\nround-trip check (decoded by the browser from the served file):');
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
        const a = L(x-1,y), b = L(x,y), e = L(x+1,y), f = L(x+2,y);
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
      return { N, excess: on/onN - off/offN };
    };
    const named = [3, 4, 8, 9, 10, 16].map(at);
    const worst = [...Array(31)].map((_, i) => at(i + 2)).sort((a, b) => b.excess - a.excess)[0];
    let luma = 0, n = 0;
    for (let y = y0; y < y1; y += 4) for (let x = x0; x < x1; x += 4) { luma += L(x, y); n++; }
    return { url: u, size: [bmp.width, bmp.height], luma: luma/n,
             meanDx: dx.reduce((a,b) => a+b, 0) / dx.length, named, worst };
  };
  const out = [];
  for (const u of ${JSON.stringify(['_lab-live.png', ...written])}) out.push(await measure('/' + u));
  return out;
})()`);

const refRow = results.find((r) => r.url === '/_lab-live.png');
console.log('  surface                    size       luma  mean|dx|   N=4    N=8    N=10   worst');
for (const r of results) {
  if (r.error) { console.log(`  ${r.url.padEnd(26)} ERROR ${r.error}`); continue; }
  const g = (N) => r.named.find((v) => v.N === N).excess;
  const tag = r.url === '/_lab-live.png' ? '  <-- target' : '';
  console.log(
    `  ${r.url.replace(/^\/_lab-/, '').padEnd(26)} ${r.size.join('x').padEnd(10)} ` +
    `${r.luma.toFixed(1).padStart(5)} ${r.meanDx.toFixed(3).padStart(8)}   ` +
    `${g(4).toFixed(3)}  ${g(8).toFixed(3)}  ${g(10).toFixed(3).padStart(5)}  ` +
    `N=${r.worst.N}:${r.worst.excess.toFixed(3)}${tag}`
  );
}
if (refRow) {
  const close = results.filter((r) => !r.error && r.url !== '/_lab-live.png')
    .sort((a, b) => Math.abs(a.luma - refRow.luma) - Math.abs(b.luma - refRow.luma));
  console.log(`\n  closest to the live frame on luma and 8px step:`);
  for (const r of close) {
    const dL = r.luma - refRow.luma;
    const dS = r.named.find((v) => v.N === 8).excess - refRow.named.find((v) => v.N === 8).excess;
    console.log(`    ${r.url.padEnd(28)} luma ${dL >= 0 ? '+' : ''}${dL.toFixed(1)}   N=8 step ${dS >= 0 ? '+' : ''}${dS.toFixed(3)}`);
  }
}

ws.close();
try { child.kill(); } catch {}
await sleep(1500);
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
