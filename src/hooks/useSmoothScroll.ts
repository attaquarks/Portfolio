import { useEffect } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from './useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

/**
 * Wires Lenis smooth-scroll into GSAP's ticker so ScrollTrigger and Lenis stay
 * in sync. This is the one scroll driver on the page — every scroll-triggered
 * animation must hang off ScrollTrigger rather than adding its own listener,
 * or it will run a frame out of step with the smoothed scroll position.
 */
export function useSmoothScroll() {
  useEffect(() => {
    // Smoothing hijacks the native scroll position, which is itself a motion
    // effect. Honour the preference by staying out of the way entirely.
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({
      duration: 1.1,
      smoothWheel: true,
      // The dock navigates by hash. Without this, Lenis keeps its own smoothed
      // position while the browser hard-jumps the real one, and the page tears.
      anchors: true,
    });

    const onScroll = () => ScrollTrigger.update();
    lenis.on('scroll', onScroll);

    // Must keep a reference to the exact function handed to the ticker —
    // gsap.ticker.remove() matches by identity, so removing `lenis.raf`
    // instead would leave this callback attached forever, and StrictMode's
    // double-invoked effect would then drive a destroyed Lenis every frame.
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.off('scroll', onScroll);
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);
}
