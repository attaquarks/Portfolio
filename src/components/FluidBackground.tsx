import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

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
 */

/** Long-edge cap for the render buffer. See note 1 above. */
const MAX_EDGE = 480;

/** ~30fps. The motion is slow enough that the extra 30 frames buy nothing. */
const FRAME_MS = 33;

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/* Domain-warped value noise. mediump throughout: this runs on integrated parts
   where highp is emulated, and nothing here needs the precision. */
const FRAG = `
precision mediump float;
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

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = vs && fs ? gl.createProgram() : null;
    if (!vs || !fs || !program) return;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, 'u_res');
    const uTime = gl.getUniformLocation(program, 'u_time');
    gl.uniform3fv(gl.getUniformLocation(program, 'u_ink'), rgb('--ink', '#12110f'));
    gl.uniform3fv(gl.getUniformLocation(program, 'u_deep'), rgb('--glow-dim', '#2c8f77'));
    gl.uniform3fv(gl.getUniformLocation(program, 'u_glow'), rgb('--glow', '#4fe8c4'));
    gl.uniform3fv(gl.getUniformLocation(program, 'u_paper'), rgb('--paper', '#ece7dd'));

    const resize = () => {
      const ratio = window.innerWidth / Math.max(window.innerHeight, 1);
      const w = Math.max(2, Math.round(ratio >= 1 ? MAX_EDGE : MAX_EDGE * ratio));
      const h = Math.max(2, Math.round(ratio >= 1 ? MAX_EDGE / ratio : MAX_EDGE));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    resize();

    let raf = 0;
    let last = 0;
    let painted = false;
    // `visible` is the hero zone; `shown` is the tab. Either one false means no
    // frames — a background nobody is looking at should cost nothing.
    let visible = true;
    let shown = document.visibilityState === 'visible';
    const started = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;

      gl.uniform1f(uTime, (now - started) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!painted) {
        painted = true;
        // Crossfade poster to live only once a real frame exists behind it.
        host.dataset.live = 'true';
      }
    };

    const sync = () => {
      const run = visible && shown;
      if (run && !raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      } else if (!run && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    sync();

    const onVisibility = () => {
      shown = document.visibilityState === 'visible';
      sync();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onResize = () => resize();
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
      zone.kill();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
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
