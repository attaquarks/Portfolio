import { useEffect, useRef } from 'react';
import { onScrollFrame } from '../lib/scrollSignal';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

/**
 * A generative particle field: nodes drift on their own, link to nearby
 * neighbours, and lean into scroll velocity and pointer position. Pure canvas2D,
 * which is the right tool for the hero — it costs a fraction of a WebGL context
 * and the projects section already spends that budget.
 */
export function LivingField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = (canvas.width = canvas.offsetWidth * dpr);
    let height = (canvas.height = canvas.offsetHeight * dpr);

    // Density has to follow area, not a constant. The old fixed count was tuned
    // against a 300x150 canvas and read as a handful of stray dots once the layer
    // actually filled a 1440-wide hero.
    const densityFor = (w: number, h: number) =>
      Math.round(Math.min(Math.max(((w / dpr) * (h / dpr)) / 12000, 45), 150));

    let count = densityFor(width, height);
    const LINK_DIST = 132 * dpr;

    type Node = { x: number; y: number; vx: number; vy: number };
    const spawn = (): Node => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
    });
    let nodes: Node[] = Array.from({ length: count }, spawn);

    let scrollVelocity = 0;
    let pointer = { x: width / 2, y: height / 2 };
    const reduced = prefersReducedMotion();

    const onPointerMove = (e: PointerEvent) => {
      pointer = { x: e.clientX * dpr, y: e.clientY * dpr };
    };

    const style = getComputedStyle(document.documentElement);
    const glow = style.getPropertyValue('--glow').trim() || '#4fe8c4';
    const amber = style.getPropertyValue('--amber').trim() || '#f2a65a';

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK_DIST) {
            ctx.strokeStyle = `rgba(79, 232, 196, ${0.13 * (1 - d / LINK_DIST)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      nodes.forEach((n, i) => {
        ctx.fillStyle = i % 5 === 0 ? amber : glow;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.8 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    };

    // A field of drifting, cursor-seeking particles is exactly the kind of
    // ambient motion the preference exists to switch off. Draw the graph once so
    // the hero keeps its texture, then stop.
    if (reduced) {
      draw();
      const onResizeStatic = () => {
        width = canvas.width = canvas.offsetWidth * dpr;
        height = canvas.height = canvas.offsetHeight * dpr;
        nodes = Array.from({ length: densityFor(width, height) }, spawn);
        draw();
      };
      const ro = new ResizeObserver(onResizeStatic);
      ro.observe(canvas);
      return () => ro.disconnect();
    }

    let raf = 0;
    const tick = () => {
      for (const n of nodes) {
        n.x += n.vx + scrollVelocity * 0.02;
        n.y += n.vy;

        const dx = pointer.x - n.x;
        const dy = pointer.y - n.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 220 * dpr && dist > 0) {
          n.vx += (dx / dist) * 0.006;
          n.vy += (dy / dist) * 0.006;
        }

        n.vx *= 0.98;
        n.vy *= 0.98;

        if (n.x < 0) n.x = width;
        if (n.x > width) n.x = 0;
        if (n.y < 0) n.y = height;
        if (n.y > height) n.y = 0;
      }

      draw();
      scrollVelocity *= 0.9;
      raf = requestAnimationFrame(tick);
    };
    tick();

    // Velocity comes from the shared Lenis-driven ticker rather than a private
    // `scroll` listener, so the field leans on the same frame the page moves on
    // instead of one frame behind the smoothed position.
    const unsubscribe = onScrollFrame((_, delta) => {
      scrollVelocity = delta;
    });

    const onResize = () => {
      const prevW = width;
      const prevH = height;
      width = canvas.width = canvas.offsetWidth * dpr;
      height = canvas.height = canvas.offsetHeight * dpr;

      // Rescale rather than reseed: respawning the whole field on every resize
      // step makes a window drag look like the hero is glitching.
      const sx = width / prevW;
      const sy = height / prevH;
      if (Number.isFinite(sx) && Number.isFinite(sy)) {
        for (const n of nodes) {
          n.x *= sx;
          n.y *= sy;
        }
      }

      const next = densityFor(width, height);
      if (next > count) nodes.push(...Array.from({ length: next - count }, spawn));
      else if (next < count) nodes.length = next;
      count = next;
    };

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(canvas);
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-canvas" />;
}
