// Isolate the wallpaper's three candidate surfaces and measure which one is
// producing visible blocks.
//
//   node scripts/wallwalk.mjs [url]
//
// Headful Chrome on a throwaway profile — real GPU, cold shader cache, the same
// harness shape as coldgpu.mjs, because that is the only configuration that
// reproduces the rendering anyone actually sees.
//
// The wallpaper can be drawn by three different things and each fails in its own
// way:
//
//   control  the page ground (--ink), i.e. no wallpaper at all. This is the
//            noise floor of the metric: with nothing there, every number below
//            that is texture rather than artefact.
//   poster   public/fluid-poster.jpg painted by CSS `background: cover`. If it
//            is the culprit the period is the JPEG DCT block, scaled by the
//            cover factor.
//   live     the 480px WebGL buffer stretched over the viewport. If it is the
//            culprit the period is the upscale factor, or the shader's own
//            value-noise lattice, which is coarser.
//
// The discriminator is the *period* of the horizontal edge-energy profile. A
// blocky image puts more edge energy on the boundaries than between them, and
// those boundaries repeat, so scanning N = 2..32 for the N whose boundaries
// carry the most energy names the cause outright: 3 is a 3x nearest-neighbour
// stretch, 8 a JPEG, 10 the poster's DCT blocks after `cover`, ~21 the noise
// lattice.
//
// The hero and the rails are hidden for the capture. They are text, text has
// edges, and edges are exactly what this measures — leaving them in would drown
// the signal in letterforms.

import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const CHROME = 'C:\\Users\\Atta\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const url = process.argv[2] || 'http://localhost:4174/';
const PROFILE = (process.env.TEMP || '/tmp') + '\\wallwalk-' + Date.now();
const OUT = (process.env.TEMP || '/tmp') + '\\wallwalk-' + Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal PNG reader: IHDR + concatenated IDAT + the five scanline filters.
 *  Enough for what `Page.captureScreenshot` emits (8-bit, non-interlaced). */
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8;
  let w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8) throw new Error(`bit depth ${depth}`);
  if (interlace !== 0) throw new Error('interlaced PNG');
  const ch = ctype === 6 ? 4 : ctype === 2 ? 3 : ctype === 0 ? 1 : 0;
  if (!ch) throw new Error(`colour type ${ctype}`);

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
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      } else if (f !== 0) throw new Error(`filter ${f}`);
      cur[i] = v;
    }
  }
  return { w, h, ch, data: out };
}

const lum = (img, x, y) => {
  const i = (y * img.w + x) * img.ch;
  const d = img.data;
  return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
};

/** Mean |difference| between each pixel and the next, per column (or per row),
 *  restricted to a crop so text and chrome never enter the numbers. */
function profile(img, crop, axis) {
  const { x0, y0, x1, y1 } = crop;
  const n = axis === 'x' ? x1 - x0 : y1 - y0;
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let s = 0, count = 0;
    if (axis === 'x') {
      const x = x0 + k;
      for (let y = y0; y < y1; y++) { s += Math.abs(lum(img, x + 1, y) - lum(img, x, y)); count++; }
    } else {
      const y = y0 + k;
      for (let x = x0; x < x1; x++) { s += Math.abs(lum(img, x, y + 1) - lum(img, x, y)); count++; }
    }
    out[k] = s / count;
  }
  return out;
}

/** How much more edge energy sits on multiples of N than off them. 1.0 is flat
 *  (no periodicity); the higher, the more the image is built from N-wide tiles. */
function periodicity(prof, origin, N) {
  let on = 0, onN = 0, off = 0, offN = 0;
  for (let k = 0; k < prof.length; k++) {
    const p = (((origin + k + 1) % N) + N) % N;
    if (p === 0) { on += prof[k]; onN++; } else { off += prof[k]; offN++; }
  }
  return onN && offN ? on / onN / (off / offN) : 0;
}

/** Fraction of adjacent pairs that are bit-identical. A nearest-neighbour
 *  stretch leaves long runs of them; interpolation leaves almost none. */
function flatRuns(prof) {
  let zero = 0;
  for (let i = 0; i < prof.length; i++) if (prof[i] < 0.05) zero++;
  return zero / prof.length;
}

function analyse(img, label) {
  // A crop of the wallpaper clear of the rails, the dock and the hero copy.
  const crop = {
    x0: Math.round(img.w * 0.16),
    y0: Math.round(img.h * 0.28),
    x1: Math.round(img.w * 0.84),
    y1: Math.round(img.h * 0.92),
  };
  const px = profile(img, crop, 'x');
  const py = profile(img, crop, 'y');

  const scored = [];
  for (let N = 2; N <= 32; N++) {
    scored.push({ N, x: periodicity(px, crop.x0, N), y: periodicity(py, crop.y0, N) });
  }
  const top = [...scored]
    .map((s) => ({ ...s, mean: (s.x + s.y) / 2 }))
    .sort((a, b) => b.mean - a.mean)
    .slice(0, 6);

  // 24x15 map of local edge energy, so a region that turned out to hold text is
  // visible as such rather than silently folded into the averages.
  const gx = 24, gy = 15;
  const grid = [];
  for (let r = 0; r < gy; r++) {
    let line = '';
    for (let c = 0; c < gx; c++) {
      const x0 = Math.round((c * img.w) / gx), x1 = Math.round(((c + 1) * img.w) / gx);
      const y0 = Math.round((r * img.h) / gy), y1 = Math.round(((r + 1) * img.h) / gy);
      let s = 0, n = 0;
      for (let y = y0; y < y1 - 1; y += 2)
        for (let x = x0; x < x1 - 1; x += 2) {
          s += Math.abs(lum(img, x + 1, y) - lum(img, x, y)) +
               Math.abs(lum(img, x, y + 1) - lum(img, x, y));
          n += 2;
        }
      const v = n ? s / n : 0;
      line += v < 0.25 ? '.' : v < 0.75 ? '-' : v < 1.5 ? '+' : v < 3 ? '#' : '@';
    }
    grid.push(line);
  }

  const meanLum = (() => {
    let s = 0, n = 0;
    for (let y = crop.y0; y < crop.y1; y += 3)
      for (let x = crop.x0; x < crop.x1; x += 3) { s += lum(img, x, y); n++; }
    return s / n;
  })();

  console.log(`\n=== ${label} ===`);
  console.log(`  crop ${crop.x0},${crop.y0} -> ${crop.x1},${crop.y1}   mean luma ${meanLum.toFixed(1)}`);
  console.log(`  mean |dx| ${(px.reduce((a, b) => a + b, 0) / px.length).toFixed(3)}   ` +
              `mean |dy| ${(py.reduce((a, b) => a + b, 0) / py.length).toFixed(3)}`);
  console.log(`  strongest periods (on-boundary / between-boundary edge energy):`);
  for (const t of top) {
    console.log(`    N=${String(t.N).padStart(2)}   x ${t.x.toFixed(3)}   y ${t.y.toFixed(3)}   mean ${t.mean.toFixed(3)}`);
  }
  console.log(`  energy map:`);
  for (const line of grid) console.log('    ' + line);
  return top;
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
await send('Page.navigate', { url });
await sleep(7000);

const facts = await evaluate(`(() => {
  const c = document.querySelector('.fluid-canvas');
  const l = document.querySelector('.fluid-layer');
  const r = c.getBoundingClientRect();
  return {
    canvasBuffer: c ? [c.width, c.height] : null,
    canvasCss: c ? [Math.round(r.width), Math.round(r.height)] : null,
    upscale: c && c.width ? (r.width / c.width).toFixed(3) : null,
    imageRendering: c ? getComputedStyle(c).imageRendering : null,
    layerImageRendering: l ? getComputedStyle(l).imageRendering : null,
    live: l ? l.dataset.live ?? 'no' : null,
    inner: [window.innerWidth, window.innerHeight],
    ctxSmoothing: (() => {
      const t = document.createElement('canvas').getContext('2d');
      return { enabled: t.imageSmoothingEnabled, quality: t.imageSmoothingQuality };
    })(),
  };
})()`);
console.log('page:', JSON.stringify(facts, null, 2));

// Clear the field for every capture. Text is edges, and edges are the whole
// measurement.
await evaluate(`(() => {
  document.querySelectorAll('main > *').forEach((el) => (el.style.visibility = 'hidden'));
  document.querySelectorAll('.status-rail, .scroll-spine, .site-dock').forEach((el) => (el.style.visibility = 'hidden'));
  return true;
})()`);

const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(r.result.data, 'base64');
  writeFileSync(`${OUT}-${name}.png`, buf);
  return decodePNG(buf);
};

const live = await shot('live');
analyse(live, 'live  — 480px WebGL buffer stretched over the viewport');

await evaluate(`document.querySelector('.fluid-canvas').remove(), true`);
await sleep(600);
const poster = await shot('poster');
analyse(poster, 'poster — public/fluid-poster.jpg under `background: cover`');

await evaluate(`document.querySelector('.fluid-layer').style.display = 'none', true`);
await sleep(600);
const control = await shot('control');
analyse(control, 'control — bare page ground, no wallpaper at all');

console.log(`\nPNGs written to ${OUT}-{live,poster,control}.png`);

ws.close();
try { child.kill(); } catch {}
await sleep(1500);
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
