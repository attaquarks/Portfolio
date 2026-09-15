// The instrumentation every headful harness on this project shares, as source
// for Page.addScriptToEvaluateOnNewDocument.
//
// It lives in its own file because two harnesses now need exactly the same
// three things, and the last time this code existed twice the two copies drifted
// and disagreed about what the page was doing:
//
//   - a frame recorder, so a stall can be attributed to a moment rather than to
//     "the page felt slow";
//   - a WebGL draw hook tagged by surface, so "is the constellation rendering
//     yet" is a number and not an inference. Draw calls are issued on the CPU,
//     so this counts them whether or not the GPU is real;
//   - a scroll driver that steps once per frame, because a single scrollTo lets
//     ScrollTrigger and Lenis each see one enormous delta and skip the frames
//     the numbers are about.
//
// Installed before any of the page's own script runs, so the fluid canvas's
// first frame is measured too.

export default `
  window.__frames = [];
  window.__loadAt = null;
  addEventListener('load', () => { window.__loadAt = Math.round(performance.now()); });
  (function tick() {
    window.__frames.push(Math.round(performance.now()));
    requestAnimationFrame(tick);
  })();

  // Every draw call, tagged by which surface made it. Storing the first and
  // last time per surface plus a one-second histogram keeps this cheap enough
  // to sit in the hot path of a 60fps scene without being the reason the
  // numbers look bad. First/last alone cannot answer the question that
  // matters — *when* the scene was drawing relative to the handoff — and a
  // running total cannot tell a burst from a trickle.
  //
  // The key walks up until it finds a named ancestor: R3F's <Canvas
  // className="constellation-canvas"> puts that class on an outer div and
  // leaves the canvas and its immediate parent anonymous, so keying on the
  // canvas alone files the whole constellation under "unnamed".
  window.__gl = { first: {}, last: {}, count: {}, buckets: {}, programs: [], firstDrawAt: null };
  const nameOf = (canvas) => {
    for (let el = canvas; el; el = el.parentElement) {
      const n = typeof el.className === 'string' ? el.className : '';
      if (n) return n;
    }
    return 'unnamed';
  };
  const hook = (Ctx) => {
    if (!Ctx) return;
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const orig = Ctx.prototype[name];
      if (!orig) continue;
      Ctx.prototype[name] = function (...args) {
        const key = this.canvas ? nameOf(this.canvas) : 'unnamed';
        const t = Math.round(performance.now());
        if (window.__gl.first[key] === undefined) {
          window.__gl.first[key] = t;
          if (window.__gl.firstDrawAt === null) window.__gl.firstDrawAt = t;
        }
        window.__gl.last[key] = t;
        window.__gl.count[key] = (window.__gl.count[key] || 0) + 1;
        const b = key + '@' + Math.floor(t / 1000);
        window.__gl.buckets[b] = (window.__gl.buckets[b] || 0) + 1;
        return orig.apply(this, args);
      };
    }
    const link = Ctx.prototype.linkProgram;
    if (link) {
      Ctx.prototype.linkProgram = function (...args) {
        window.__gl.programs.push(Math.round(performance.now()));
        return link.apply(this, args);
      };
    }
  };
  hook(window.WebGLRenderingContext);
  hook(window.WebGL2RenderingContext);
  window.__gl.nameOf = nameOf;

  // One reading of the whole backdrop chain, taken inside the same frame as
  // the scroll position it belongs to so the two cannot disagree.
  window.__state = () => {
    const cs = (sel, p) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).getPropertyValue(p).trim() : null;
    };
    const c = document.querySelector('.constellation-canvas');
    const canvas = c ? (c.tagName === 'CANVAS' ? c : c.querySelector('canvas')) : null;
    return {
      y: Math.round(window.scrollY),
      fluid: cs('.fluid-layer', 'opacity'),
      con: cs('.constellation', 'opacity'),
      vis: document.visibilityState,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      canvas: !!canvas,
      buf: canvas ? canvas.width + 'x' + canvas.height : null,
      conDraws: canvas ? window.__gl.count[window.__gl.nameOf(canvas)] || 0 : 0,
      fluidDraws: window.__gl.count['fluid-canvas'] || 0,
    };
  };

  window.__sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // The drive. One scroll step per frame from the top of the page to past the
  // boundary, at roughly what a wheel produces, so the crossing is a crossing
  // and not a teleport: a single scrollTo would let ScrollTrigger and Lenis
  // each see one enormous delta and skip the frames the numbers are about.
  window.__drive = (to, ms) =>
    new Promise((resolve) => {
      const trace = [];
      const t0 = performance.now();
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / ms);
        window.scrollTo(0, Math.round(to * p));
        const s = window.__state();
        trace.push([Math.round(performance.now() - t0), s.y, s.fluid, s.con, s.conDraws]);
        if (p < 1) requestAnimationFrame(step);
        else resolve(trace);
      };
      requestAnimationFrame(step);
    });
`;
