import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../hooks/useReducedMotion';
import { readCapability } from '../hooks/useDeviceTier';

gsap.registerPlugin(ScrollTrigger);

/**
 * Act one's wallpaper: a living fluid field, rendered here rather than embedded.
 *
 * This replaces the `fluid-bg` embed, which was measured on this project's own
 * hardware (Intel HD 630 / ANGLE D3D11, cold shader cache, headful Chrome):
 *
 *              with embed     blocked
 *   load event    3796ms        795ms
 *   worst stall   3498ms        632ms
 *   ever live        no           —
 *
 * Three and a half seconds of frozen tab, three seconds added to load, and after
 * thirty seconds the embed still had not painted a frame — so the page showed a
 * static poster and a spinner that never stopped. An iframe is also a subresource,
 * which is why `window.load` waited on it, and `load` is what the tab throbber
 * tracks. Owning the renderer fixes all of that at once.
 *
 * The cost is controlled in three places, and all three matter on integrated
 * graphics:
 *
 * 1. **Internal resolution is tiny** — capped at 480px on the long edge,
 *    regardless of the viewport. The layer is blurred and dimmed to sit behind
 *    type, so resolution buys nothing here; a 480x300 buffer is ~144k pixels,
 *    about 3% of a 1440x900 one, and CSS upscaling *is* the blur.
 * 2. **The shader is deliberately small** — four octaves of value noise and two
 *    warp passes. The embed's stall was shader compilation, not shading; a short
 *    program compiles in milliseconds on the same hardware that choked for 3.5s.
 * 3. **It stops when it is off screen.** The field belongs to the hero. Once the
 *    constellation takes over, this stops submitting frames entirely rather than
 *    rendering a layer at zero opacity.
 *
 * Two things below are new, and both are about phones rather than about speed.
 * They are called out where they happen: the fragment precision, which is the
 * reason the wallpaper was **missing** on mobile rather than merely slow, and
 * the context-loss handling, which is the reason it would have stayed missing.
 */

/** Long-edge cap for the render buffer. See note 1 above. */
const MAX_EDGE = 480;

/** ~30fps. The motion is slow enough that the extra 30 frames buy nothing. */
const FRAME_MS = 33;

/**
 * ~20fps, for devices that say they are short of cores or memory. The field's
 * own motion is glacial — a whole warp cycle takes tens of seconds — so halving
 * the cadence is invisible, and on a phone the point is to leave the frame
 * budget to the constellation and the scroll.
 */
const FRAME_MS_LOW = 50;

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/*
 * `highp`, and this is the whole of the mobile fix.
 *
 * This shader used to declare `precision mediump float`, on the reasoning that
 * nothing here needs more than half precision. On a desktop that is true and
 * harmless: every desktop GL implementation runs `mediump` at fp32 regardless.
 * On a phone it is neither. `mediump` IS fp16 there, and fp16 has 10 bits of
 * mantissa and a ceiling of 65504 — which the hash below walks straight
 * through. `dot(p, vec2(127.1, 311.7))` reaches ~1e4 for the cell coordinates
 * this fbm generates, and multiplying that by 43758 overflows to infinity, so
 * `sin(inf)` is NaN, and NaN painted across the hero is a black rectangle. The
 * poster underneath never got a chance: the canvas sits on top of it at
 * opacity 1, so the layer looked *loaded* while showing nothing.
 *
 * That is the reported "the main wallpaper background does not load at all",
 * and it is a precision question, not a performance one. Asking for highp
 * gives every real mobile GPU fp32 and restores the exact field the desktop
 * has always drawn. A device that genuinely cannot do highp in a fragment
 * shader fails to compile, `buildScene` returns null, and the layer falls back
 * to the poster — which is a finished frame of this same piece, so the hero
 * still has its colour. Never a black rectangle.
 */
const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_ink;
uniform vec3 u_deep;
uniform vec3 u_glow;
uniform vec3 u_paper;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (v_uv * u_res - 0.5 * u_res) / min(u_res.x, u_res.y);
  vec2 p = uv * 1.7;
  float t = u_time;

  // Two warp passes. One reads as noise, three costs more than it shows.
  vec2 q = vec2(fbm(p + t * 0.07), fbm(p + vec2(5.2, 1.3) - t * 0.05));
  vec2 r = vec2(
    fbm(p + 3.4 * q + vec2(1.7, 9.2) + t * 0.04),
    fbm(p + 3.4 * q + vec2(8.3, 2.8) - t * 0.03)
  );
  float f = fbm(p + 3.2 * r);

  // Bias toward the dark end: this is a ground for type, and a field that
  // averages mid-grey leaves nothing for the headline to sit against.
  f = smoothstep(0.18, 0.92, f);
  float lift = clamp(length(r) * 0.7, 0.0, 1.0);

  vec3 col = mix(u_ink, u_deep, smoothstep(0.0, 0.55, f));
  col = mix(col, u_glow, smoothstep(0.52, 0.93, f) * 0.72);
  col = mix(col, u_paper, smoothstep(0.86, 1.0, f) * lift * 0.35);

  // Centre bloom, so the piece has a subject instead of being an even texture.
  float bloom = 1.0 - smoothstep(0.0, 1.05, length(uv * vec2(0.85, 1.15)));
  col += u_glow * bloom * 0.085;

  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** Reads a `#rrggbb` custom property into a 0..1 triple for the shader. */
function rgb(name: string, fallback: string): [number, number, number] {
  const style = getComputedStyle(document.documentElement);
  const hex = (style.getPropertyValue(name).trim() || fallback).replace('#', '');
  const n = parseInt(
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex,
    16
  );
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Everything that lives in the GL context. Held together so it can be thrown
 * away and rebuilt as one unit, which is what a lost context requires: the
 * context object survives, every object inside it does not.
 */
interface Scene {
  program: WebGLProgram;
  vs: WebGLShader;
  fs: WebGLShader;
  buffer: WebGLBuffer;
  uRes: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
}

function buildScene(gl: WebGLRenderingContext): Scene | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  if (!buffer) {
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  const loc = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  // Uniform state belongs to the program, so it is set here and not at the
  // call site — a restored context needs all of it back.
  gl.uniform3fv(gl.getUniformLocation(program, 'u_ink'), rgb('--ink', '#12110f'));
  gl.uniform3fv(gl.getUniformLocation(program, 'u_deep'), rgb('--glow-dim', '#2c8f77'));
  gl.uniform3fv(gl.getUniformLocation(program, 'u_glow'), rgb('--glow', '#4fe8c4'));
  gl.uniform3fv(gl.getUniformLocation(program, 'u_paper'), rgb('--paper', '#ece7dd'));

  return {
    program,
    vs,
    fs,
    buffer,
    uRes: gl.getUniformLocation(program, 'u_res'),
    uTime: gl.getUniformLocation(program, 'u_time'),
  };
}

function disposeScene(gl: WebGLRenderingContext, scene: Scene) {
  gl.deleteBuffer(scene.buffer);
  gl.deleteProgram(scene.program);
  gl.deleteShader(scene.vs);
  gl.deleteShader(scene.fs);
}

export function FluidBackground() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    // Under reduced motion nothing is created at all — not a paused context, an
    // absent one. The poster underneath is a real frame of the same piece, so
    // the layer still carries the page's colour at zero runtime cost.
    if (prefersReducedMotion()) return;

    const gl =
      (canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
        failIfMajorPerformanceCaveat: false,
      }) as WebGLRenderingContext | null) ?? null;

    // No WebGL, or a driver that refuses the context: the poster is already
    // painted and is a complete answer. Nothing to clean up, nothing to log.
    if (!gl) return;

    const frameMs = readCapability().lowPower ? FRAME_MS_LOW : FRAME_MS;

    let scene = buildScene(gl);
    if (!scene) return;

    const resize = (force = false) => {
      // Measured off the canvas' own box, not the window, and on mobile that is
      // not a distinction without a difference. The layer is `position: fixed`,
      // so iOS sizes it to the *layout* viewport and leaves it alone; the URL
      // bar collapsing moves the visual viewport, which is what `innerHeight`
      // reports. Sizing from the box means the toolbar animation does not read
      // as a resize at all.
      const w0 = canvas.clientWidth || window.innerWidth;
      const h0 = canvas.clientHeight || window.innerHeight;
      const ratio = w0 / Math.max(h0, 1);
      const w = Math.max(2, Math.round(ratio >= 1 ? MAX_EDGE : MAX_EDGE * ratio));
      const h = Math.max(2, Math.round(ratio >= 1 ? MAX_EDGE / ratio : MAX_EDGE));
      // The early return is what keeps a resize from reallocating the drawing
      // buffer, so it has to be defeatable: after a context restore the size is
      // unchanged but the viewport and `u_res` are gone with the context.
      if (!force && canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      if (scene) gl.uniform2f(scene.uRes, w, h);
    };
    resize(true);

    let raf = 0;
    let last = 0;
    let painted = false;
    // `visible` is the hero zone; `shown` is the tab. Either one false means no
    // frames — a background nobody is looking at should cost nothing.
    let visible = true;
    let shown = document.visibilityState === 'visible';
    // Set while the GPU has taken the context away. Nothing may run, and
    // nothing may claim to have painted.
    let lost = false;
    const started = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!scene || lost || gl.isContextLost()) return;
      if (now - last < frameMs) return;
      last = now;

      gl.uniform1f(scene.uTime, (now - started) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!painted) {
        painted = true;
        // Crossfade poster to live only once a real frame exists behind it.
        host.dataset.live = 'true';
      }
    };

    const sync = () => {
      const run = !lost && visible && shown;
      if (run && !raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      } else if (!run && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    sync();

    /**
     * A phone takes the context away routinely — backgrounding the tab under
     * memory pressure, a driver reset, a thermal eviction — and it hands it
     * back when it feels like it. Unhandled, the first loss is permanent and
     * silent: the canvas keeps its box and its last contents, `data-live` stays
     * set, and the hero wears a frozen or blank rectangle for the rest of the
     * session. That is very likely the second half of what was reported.
     *
     * `preventDefault` is not optional housekeeping here. Without it the browser
     * will not fire `webglcontextrestored` at all.
     */
    const onContextLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      // Drop the live flag so the poster crossfades back in over the dead
      // canvas, and drop the scene: every object in it died with the context.
      if (scene) disposeScene(gl, scene);
      scene = null;
      painted = false;
      delete host.dataset.live;
    };

    const onContextRestored = () => {
      scene = buildScene(gl);
      if (!scene) return; // poster stays; a second failure is a real answer
      lost = false;
      painted = false;
      // The canvas attributes survived the loss, so the size check would skip
      // the work that has to happen — viewport and `u_res` went with the context.
      resize(true);
      sync();
    };

    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const onVisibility = () => {
      shown = document.visibilityState === 'visible';
      sync();
    };
    document.addEventListener('visibilitychange', onVisibility);

    /**
     * Coalesced, because on a phone `resize` is not about resizing.
     *
     * iOS fires it continuously while the URL bar collapses, and every event
     * lands on a different `innerHeight` — which is a different aspect ratio,
     * which is a new drawing buffer, reallocated in the middle of the scroll.
     * That is a per-frame GL allocation for a toolbar animation on a blurred
     * 480px backdrop that cannot show the difference. Waiting for the events to
     * stop costs nothing visible and takes the allocation out of the scroll.
     */
    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => resize(), 220);
    };
    window.addEventListener('resize', onResize);

    /**
     * Act one of three. The wallpaper owns the hero and stops where the hero
     * stops — one backdrop hands over to the next, at one position, with nothing
     * in between.
     *
     * It used to run a single linear ramp from the top of the hero to 45% of the
     * way past the projects section, which spread the handoff over roughly three
     * screens. A three-screen fade is not a transition; it is a slow change of
     * ambient brightness, and the eye reads it as the same surface getting
     * dimmer rather than as arriving somewhere else. The wallpaper is now
     * undimmed for the whole hero — the copy sits on the veil, not on a faded
     * background — and then goes over the last stretch of the hero, so the two
     * backdrops are never both on screen and the seam is a cut.
     *
     * The renderer switches off with it: below the boundary there is nothing
     * this canvas can contribute, and under the constellation it would be a
     * full-viewport shader running behind an opaque scene.
     */
    const HOLD = 96;
    const zone = ScrollTrigger.create({
      // The hero's own box, so the boundary is expressed the same way here as it
      // is in the constellation — one position read twice, recomputed together
      // on every refresh.
      trigger: '.hero',
      start: 'top top',
      end: 'bottom top',
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        // Distance remaining to the boundary, so the fade is the last 96px of
        // scroll before it whatever the hero's height turns out to be.
        const remaining = (1 - self.progress) * (self.end - self.start);
        const opacity = Math.min(1, remaining / HOLD);
        gsap.set(host, { '--fluid-opacity': opacity });
        const next = opacity > 0.02;
        if (next !== visible) {
          visible = next;
          sync();
        }
      },
    });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      zone.kill();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      if (scene) disposeScene(gl, scene);
      // Ours to give back. A page that has navigated away and left its context
      // allocated is a page that has spent a phone's whole context budget for
      // nothing — and on mobile the constellation needs one too.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      delete host.dataset.live;
    };
  }, []);

  return (
    <div className="fluid-layer" ref={hostRef} aria-hidden>
      <canvas className="fluid-canvas" ref={canvasRef} />
    </div>
  );
}
