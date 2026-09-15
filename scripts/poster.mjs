// Rebuild the wallpaper poster from a real frame of the live shader, and prove
// the replacement has no block structure.
//
//   node scripts/poster.mjs [url]
//
// `public/fluid-poster.jpg` is what the page paints before the WebGL canvas goes
// live, what it paints if WebGL is unavailable, and what it paints under
// reduced motion. Measured with scripts/wallwalk.mjs it carries a 26% excess of
// edge energy on 8-pixel boundaries — the DCT block of a JPEG saved at roughly
// 0.011 bits per pixel. The live surface has no such structure, so the fix is to
// take the poster from the live surface instead of from an encoder's floor.
//
// Captured at deviceScaleFactor 1 with every other layer hidden, then saved in
// several encodings so the smallest one that still measures flat can be chosen.
// Verification is done back in the browser against the written file, because
// that is the only check that survives the encoder.

import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const CHROME = 'C:\\Users\\Atta\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const url = process.argv[2] || 'http://localhost:4174/';
const PROFILE = (process.env.TEMP || '/tmp') + '\\poster-' + Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REPO = 'C:\\Users\\Atta\\Documents\\Projects\\Portfolio';

/** Same reader as scripts/wallwalk.mjs — enough of PNG to check the capture. */
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

const lum = (img, x, y) => {
  const i = (y * img.w + x) * img.ch, d = img.data;
  return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
};

/** Edge energy on multiples of N versus off them, over the full width. 1.0 is
 *  flat; 1.25 is the block signature we are trying to write out.
 *
 *  Cropped away from every edge on purpose. A headful viewport carries a 15px
 *  scrollbar at its right column, and one hard vertical edge there is enough to
 *  swamp the statistic: every N that divides that column's x scores enormously,
 *  which is how N=25, N=19 and N=15 all "won" a run of this against a perfectly
 *  smooth gradient. The crop is the fix; the scrollbar is hidden as well. */
const CROP = (w, h) => ({
  x0: 20,
  x1: Math.round(w * 0.97),
  y0: 20,
  y1: Math.round(h * 0.97),
});

function report(img, label) {
  const { x0, x1, y0, y1 } = CROP(img.w, img.h);
  const prof = new Float64Array(x1 - x0);
  for (let k = 0; k < prof.length; k++) {
    let s = 0;
    for (let y = y0; y < y1; y++) s += Math.abs(lum(img, x0 + k + 1, y) - lum(img, x0 + k, y));
    prof[k] = s / (y1 - y0);
  }
  const scored = [];
  for (let N = 2; N <= 32; N++) {
    let on = 0, onN = 0, off = 0, offN = 0;
    for (let k = 0; k < prof.length; k++) {
      const p = (((x0 + k + 1) % N) + N) % N;
      if (p === 0) { on += prof[k]; onN++; } else { off += prof[k]; offN++; }
    }
    scored.push({ N, r: (on / onN) / (off / offN) });
  }
  scored.sort((a, b) => b.r - a.r);
  const mean = [...prof].reduce((a, b) => a + b, 0) / prof.length;
  console.log(`  ${label.padEnd(28)} ${img.w}x${img.h}  mean|dx| ${mean.toFixed(3)}  top: ` +
    scored.slice(0, 4).map((s) => `N=${s.N}:${s.r.toFixed(3)}`).join('  '));
  return scored[0];
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
// when the rest of the page does.
const stripped = await evaluate(`(() => {
  const hidden = [];
  const hide = (el) => { el.style.visibility = 'hidden'; hidden.push(el.className || el.tagName); };
  document.querySelectorAll('main > *').forEach(hide);
  document.querySelectorAll('[class*="rail"],[class*="spine"],[class*="dock"],[class*="cue"],[class*="veil"]')
    .forEach(hide);
  if (!document.querySelector('.fluid-layer').dataset.live) return { ok: false, reason: 'fluid never went live' };
  return { ok: true, hidden, live: true };
})()`);
if (!stripped?.ok) { console.log('capture aborted:', JSON.stringify(stripped)); process.exit(1); }
console.log('stripped for capture:', stripped.hidden.join(', '));
await sleep(500);

const grab = async (format, quality, name) => {
  const params = { format, captureBeyondViewport: false };
  if (quality) params.quality = quality;
  const r = await send('Page.captureScreenshot', params);
  if (!r.result?.data) { console.log(`  ${format}: capture failed`, JSON.stringify(r.error ?? r)); return null; }
  const buf = Buffer.from(r.result.data, 'base64');
  // Labelled and prefixed so the whole experiment is one directory listing away
  // from being thrown out; only the winner gets promoted to fluid-poster.*.
  writeFileSync(`${REPO}\\public\\${name}`, buf);
  writeFileSync(`${REPO}\\dist\\${name}`, buf);
  return buf;
};

console.log('\nencodings (KB):');
const variants = [
  ['webp', 92, '_lab-poster-q92.webp'],
  ['webp', 78, '_lab-poster-q78.webp'],
  ['jpeg', 92, '_lab-poster-q92.jpg'],
  ['jpeg', 80, '_lab-poster-q80.jpg'],
];
const written = [];
for (const [format, quality, name] of variants) {
  const buf = await grab(format, quality, name);
  if (buf) { console.log(`  ${name.padEnd(26)} ${(buf.length / 1024).toFixed(1)} KB`); written.push(name); }
}

// The PNG master, so the capture's own cleanliness can be checked with the
// decoder rather than through another encoder.
const master = await grab('png', null, '_poster-master.png');
if (master) {
  console.log(`  ${'_poster-master.png'.padEnd(26)} ${(master.length / 1024).toFixed(1)} KB`);
  console.log('\ncapture check (PNG master):');
  report(decodePNG(master), 'master');
}

// Re-measure each written file the way the browser actually decodes it.
console.log('\nround-trip check (decoded by the browser from the served file):');
const verify = await evaluate(`(async () => {
  const check = async (u) => {
    let bmp;
    try { bmp = await createImageBitmap(await (await fetch(u)).blob()); }
    catch (e) { return { url: u, error: String(e) }; }
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const L = (x, y) => { const i = (y * c.width + x) * 4; return 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]; };
    const x0 = 20, x1 = Math.round(c.width * 0.97), y0 = 20, y1 = Math.round(c.height * 0.97);
    const prof = [];
    for (let x = x0; x < x1; x++) { let s = 0; for (let y = y0; y < y1; y++) s += Math.abs(L(x+1,y) - L(x,y)); prof.push(s/(y1-y0)); }
    const out = [];
    for (let N = 2; N <= 32; N++) {
      let on=0,onN=0,off=0,offN=0;
      for (let k = 0; k < prof.length; k++) { const p = (((x0+k+1)%N)+N)%N; if (p===0) {on+=prof[k];onN++;} else {off+=prof[k];offN++;} }
      out.push({ N, r: (on/onN)/(off/offN) });
    }
    out.sort((a,b) => b.r - a.r);
    return { url: u, size: [bmp.width, bmp.height], meanDx: prof.reduce((a,b)=>a+b,0)/prof.length, top: out.slice(0,3) };
  };
  return await Promise.all(${JSON.stringify(written)}.map((n) => check('/' + n)));
})()`);

for (const v of verify) {
  if (v.error) { console.log(`  ${v.url}  ERROR ${v.error}`); continue; }
  console.log(`  ${v.url.padEnd(28)} ${v.size.join('x')}  mean|dx| ${v.meanDx.toFixed(3)}  ` +
    v.top.map((t) => `N=${t.N}:${t.r.toFixed(3)}`).join('  '));
}

ws.close();
try { child.kill(); } catch {}
await sleep(1500);
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
