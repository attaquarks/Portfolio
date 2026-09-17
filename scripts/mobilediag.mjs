// Mobile diagnostic. `diag.mjs` answers "why is the page blank" but pins
// `deviceScaleFactor: 1` and never emulates touch or a phone user agent, so on
// the layout it produces the page is not a phone and never was. This runs the
// same capture against a real device profile — DPR 3, five touch points, a
// mobile UA — and additionally installs a long-task observer before the page
// loads, because "it hangs" is a main-thread question and a main-thread stall
// that has already finished by the time you probe is invisible to a probe.
//
//   node scripts/mobilediag.mjs [url] [waitMs] [width] [height] [dpr]
//
// Defaults are an iPhone 14 (390x844 @3). Pass 360 800 3 for a mid-range
// Android, which is the device class most likely to actually break.
//
// ONE THING THIS CANNOT TELL YOU, and one thing it turns out it can. It cannot
// tell you what a phone feels like: the GPU here answers as
// `ANGLE (Intel, Intel(R) HD Graphics 630 ... D3D11)` — a desktop integrated
// part, hardware-accelerated but nowhere near a phone's, and a tile-based mobile
// GPU with a fraction of the bandwidth behaves nothing like an immediate-mode
// desktop one. Frame timings are therefore not phone timings. Read them for
// *what exists and what is broken* (contexts, sizes, visibility, errors,
// layout) and for relative changes between two builds measured on this same
// machine — never as a prediction of a handset.
//
// The earlier claim here was that this rendered through SwiftShader on the CPU.
// That was wrong, and the probe contradicted it: `--enable-unsafe-swiftshader`
// only *permits* a software fallback, so with a working GPU present the renderer
// string is identical with the flag and without it. Verified by running the same
// profile both ways.

import { spawn } from 'node:child_process';

const CHROME = 'C:\\Users\\Atta\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
// Overridable so a second profile can run alongside the first — in particular
// one launched *without* the software-GL flag, which is how you find out what
// the page does on a device that has no WebGL to give. Two Chromes cannot share
// a user-data-dir, so the profile directory follows the port.
const PORT = Number(process.env.PORT || 9222);
const SWIFTSHADER = process.env.SWIFTSHADER !== '0';
const url = process.argv[2] || 'http://localhost:4174/';
const wait = Number(process.argv[3] || 8000);
const width = Number(process.argv[4] || 390);
const height = Number(process.argv[5] || 844);
const dpr = Number(process.argv[6] || 3);
// Env-gated extras, all off by default so the plain run stays comparable to
// `diag.mjs`. These are the difference between "a narrow desktop window" and
// "a phone": a desktop CPU is roughly 4-6x a mid-range phone's, and a phone is
// very often on a connection nothing like a desktop's.
const cpu = Number(process.env.CPU || 0); // 4 = mid-range Android, 6 = older
const net = process.env.NET || ''; // 'slow4g' | 'fast3g'
const drive = process.env.SCROLL === '1'; // synthesize a real touch scroll
const reduced = process.env.REDUCED === '1'; // emulate prefers-reduced-motion
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A real mobile UA, not a 390px desktop window. Some engines take a materially
// different path on `Mobile` — notably iOS Safari's `position: fixed` handling
// and the `svh` unit resolution — so the UA is part of the device profile.
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
    '--user-data-dir=' + (process.env.TEMP || '/tmp') + `\\shot-profile-${PORT}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', 'about:blank',
    ...(SWIFTSHADER ? ['--enable-unsafe-swiftshader'] : []),
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
    failures.push(`${m.params.type} ${m.params.errorText} ${m.params.requestId}`);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');

// Installed before any page script runs, so it sees the long tasks that happen
// during load — which is when they happen.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__lt = [];
    window.__ltTop = null;
    window.__nav = performance.now();
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          window.__lt.push(Math.round(e.duration));
          if (!window.__ltTop || e.duration > window.__ltTop.ms) {
            const a = (e.attribution || [])
              .map((x) => x.name || x.containerType || x.containerName || '?');
            window.__ltTop = {
              ms: Math.round(e.duration),
              start: Math.round(e.startTime),
              via: a.join(' ') || '(no attribution)',
            };
          }
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch (e) { window.__lt = ['unsupported']; }
    try {
      window.__lcp = 0;
      new PerformanceObserver((l) => {
        const es = l.getEntries();
        window.__lcp = Math.round(es[es.length - 1].startTime);
      }).observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {}
  `,
});

// Denies every WebGL context before any page script runs. `--disable-webgl` is
// not usable here — Chrome's own GPU process answers for it and some builds
// ignore it — whereas this is the same thing the browser does to the page on a
// blocked/driverless device, and it is exactly the condition the poster
// fallback exists for. Without this, the flag-swap trick above proves nothing:
// `--enable-unsafe-swiftshader` only *permits* software GL, so a machine with a
// real GPU uses it and the renderer string comes back identical either way.
if (process.env.NOWEBGL === '1') {
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      for (const proto of [window.HTMLCanvasElement.prototype]) {
        const real = proto.getContext;
        proto.getContext = function (type, ...rest) {
          if (String(type).includes('webgl') || String(type).includes('experimental-webgl')) return null;
          return real.call(this, type, ...rest);
        };
      }
    `,
  });
}

await send('Emulation.setDeviceMetricsOverride', {
  width, height, deviceScaleFactor: dpr, mobile: true,
});
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setUserAgentOverride', { userAgent: MOBILE_UA });
if (reduced) {
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
}

// Both of these have to be in place before the navigation, or the load they are
// meant to describe is already over by the time they apply.
if (cpu) await send('Emulation.setCPUThrottlingRate', { rate: cpu });
if (net) {
  const fast3g = net === 'fast3g';
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: fast3g ? 300 : 150,
    downloadThroughput: ((fast3g ? 400 : 1600) * 1024) / 8,
    uploadThroughput: ((fast3g ? 400 : 750) * 1024) / 8,
  });
}

await send('Page.navigate', { url });
await sleep(wait);

// A real finger drag would be ideal, but `Input.synthesizeScrollGesture` with
// `gestureSourceType: 'touch'` does not move the page in this headless setup —
// verified against a plain 6000px data: URL, which also stayed at scrollY 0. So
// it is a harness limitation and not a finding about the site, and this drives
// with synthesized wheel events instead. Those are Lenis' own input path
// (`smoothWheel: true`), so the smoothed scroll, ScrollTrigger updates and the
// WebGL layers are all exercised exactly as they are on a desktop scroll.
let driveStats = null;
if (drive) {
  await send('Runtime.evaluate', {
    expression: `
      window.__gaps = [];
      (() => {
        let last = performance.now();
        const step = (t) => {
          window.__gaps.push(t - last);
          last = t;
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      })();
    `,
  });
  const before = await send('Runtime.evaluate', { expression: 'scrollY', returnByValue: true });
  for (let i = 0; i < 40; i++) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: Math.round(width / 2),
      y: Math.round(height / 2),
      deltaX: 0,
      deltaY: Math.round(height * 0.7),
      modifiers: 0,
    });
    await sleep(120);
  }
  const r2 = await send('Runtime.evaluate', {
    expression: `(() => {
      const g = window.__gaps.filter((x) => x > 0);
      g.sort((a, b) => a - b);
      const at = (q) => Math.round(g[Math.floor(g.length * q)] || 0);
      return {
        frames: g.length,
        medianGapMs: at(0.5),
        p95GapMs: at(0.95),
        worstGapMs: Math.round(g[g.length - 1] || 0),
        gapsOver100ms: g.filter((x) => x > 100).length,
        gapsOver250ms: g.filter((x) => x > 250).length,
        scrollY: Math.round(scrollY),
        docH: document.documentElement.scrollHeight,
      };
    })()`,
    returnByValue: true,
  });
  driveStats = { from: before.result?.result?.value, ...(r2.result?.result?.value || {}) };
}

const probe = `(() => {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const rect = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };

  let webgl = 'ok';
  try {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl');
    if (!g) webgl = 'NO CONTEXT';
    else {
      const dbg = g.getExtension('WEBGL_debug_renderer_info');
      const r = dbg ? g.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
      const p = dbg ? g.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : g.getParameter(g.VENDOR);
      webgl = (p || '?') + ' / ' + (r || '?');
      const lo = g.getExtension('OES_element_index_uint');
      webgl += ' | uint-index:' + !!lo + ' | float-tex:' + !!g.getExtension('OES_texture_float');
      g.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch (e) { webgl = 'THROW: ' + e.message; }

  const layer = document.querySelector('.fluid-layer');
  const fcanvas = document.querySelector('.fluid-canvas');
  const con = document.querySelector('.constellation');
  // The R3F wrapper div carries that class, not the canvas element, so reading
  // its width returns undefined — the probe reported nulls for the drawing
  // buffer, which looks like a finding and is not one.
  const ccanvas = document.querySelector('.constellation canvas');
  const hero = document.querySelector('.hero');
  const main = document.querySelector('main');

  return {
    vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio,
    docH: document.documentElement.scrollHeight,
    // What the device tier is actually deciding on, so the reductions it drives
    // can be told apart from their absence. A harness that emulates touch but
    // reports pointer:fine would silently exercise the desktop path.
    capability: {
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory ?? null,
    },
    webgl,
    lcp: window.__lcp ?? null,
    longTasks: window.__lt ?? 'no observer',
    longTaskCount: Array.isArray(window.__lt) ? window.__lt.length : -1,
    // Which long task was worst and what the browser blames for it. Under a
    // software GL driver this is the difference between "the site is slow" and
    // "SwiftShader is linking shaders on the CPU", which are not the same claim.
    longestTask: window.__ltTop ?? null,
    fluidLayer: layer ? {
      opacity: cs(layer).opacity,
      varFluid: cs(layer).getPropertyValue('--fluid-opacity').trim(),
      dataLive: layer.dataset.live ?? null,
      rect: rect(layer),
      position: cs(layer).position,
      bgImage: cs(layer).backgroundImage.slice(0, 48),
    } : 'MISSING',
    fluidCanvas: fcanvas ? {
      buffer: [fcanvas.width, fcanvas.height],
      cssOpacity: cs(fcanvas).opacity,
      rect: rect(fcanvas),
    } : 'MISSING',
    constellation: con ? {
      opacity: cs(con).opacity,
      varConstel: cs(con).getPropertyValue('--constellation-opacity').trim(),
      rect: rect(con),
      position: cs(con).position,
      marginBottom: cs(con).marginBottom,
      // Set when the GPU took the context away; the layer hides itself while it
      // is on, so a stuck true here is a blank constellation.
      lost: con.dataset.lost ?? null,
    } : 'MISSING',
    constelCanvas: ccanvas ? {
      buffer: [ccanvas.width, ccanvas.height],
      rect: rect(ccanvas),
      visibility: cs(ccanvas).visibility,
    } : 'MISSING',
    heroH: hero ? Math.round(hero.getBoundingClientRect().height) : 'MISSING',
    mainH: main ? Math.round(main.getBoundingClientRect().height) : 'MISSING',
    // Whether the About act is the animated (pinned, 377vh) version or the
    // static one, and whether the column would actually fit if it were pinned.
    // The static branch is chosen from a viewport-height guess, so the guess is
    // only defensible against the real column height — which is this number.
    about: (() => {
      const act = document.querySelector('.act-about');
      const stage = document.querySelector('.about-stage');
      const overlay = document.querySelector('.about-overlay');
      if (!act || !stage || !overlay) return 'MISSING';
      const columnH = Math.round(overlay.getBoundingClientRect().height);
      // Two discriminators for whether the scrubbed timeline was actually
      // built, as opposed to the act merely being tall. The static branch sets
      // the tiles to opacity 0 at mount, where the animated one leaves them at
      // their painted 1 until the scrub moves; and the static branch leaves the
      // finished phrase in the stamp, where the animated one has already
      // painted it through its window at t=0, which is one character.
      const tile = document.querySelector('.about-tile');
      const stampEl = document.querySelector('.about-stamp-live');
      const stampText = stampEl ? stampEl.textContent || '' : null;
      return {
        actH: Math.round(act.getBoundingClientRect().height),
        stagePosition: cs(stage).position,
        columnH,
        // Negative once the column fits inside one screen with room to spare.
        columnOverflowVsViewport: columnH - Math.round(innerHeight),
        tileOpacity: tile ? cs(tile).opacity : 'MISSING',
        stampChars: stampText ? stampText.length : null,
        stampResolved: stampText === 'TERMINAL ENTHUSIAST',
      };
    })(),
    acts: [...document.querySelectorAll('.act')].map((a) => Math.round(a.getBoundingClientRect().height)),
    scrollTriggers: (window.ScrollTrigger?.getAll?.() || []).length,
    canvasesInDom: document.querySelectorAll('canvas').length,
  };
})()`;

const r = await send('Runtime.evaluate', { expression: probe, returnByValue: true, awaitPromise: true });

console.log(`=== ${url} @ ${width}x${height} dpr${dpr} (mobile) ===`);
console.log(`profile: cpu=${cpu || 'unthrottled'}x net=${net || 'unthrottled'} scroll=${drive ? 'touch-driven' : 'none'} reduced=${reduced ? 'yes' : 'no'}`);
console.log('\n=== CONSOLE ===');
console.log(logs.length ? logs.join('\n') : '(clean)');
console.log('\n=== FAILED REQUESTS ===');
console.log(failures.length ? [...new Set(failures)].join('\n') : '(none)');
console.log('\n=== TOUCH SCROLL (what a finger feels) ===');
console.log(driveStats ? JSON.stringify(driveStats, null, 2) : '(not driven — pass SCROLL=1)');
console.log('\n=== STATE ===');
console.log(JSON.stringify(r.result?.result?.value ?? r.result, null, 2));

ws.close();
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
