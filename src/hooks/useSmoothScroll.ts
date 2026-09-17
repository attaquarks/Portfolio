import { useEffect } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from './useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

/**
 * A frame longer than this is a stall rather than a slow frame, and the scroll
 * is told it lasted one 30fps frame instead. These are GSAP's own defaults, set
 * here explicitly because the numbers are the whole point of the setting.
 */
const LAG_MS = 500;
const LAG_STEP_MS = 33;

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

    /**
     * GSAP's lag smoothing, turned back on.
     *
     * It was off — `lagSmoothing(0)` — which is what the Lenis/GSAP integration
     * snippet recommends, and is presumably where the line came from. Off means
     * the threshold is Infinity: the ticker never clamps, and every listener is
     * handed the frame's true elapsed time however long that was. On a desktop
     * that is 16ms essentially always, so the setting does nothing and nobody
     * notices. It is a phone setting, and on a phone it is the bug.
     *
     * What happens without it, traced through both libraries: GSAP's ticker
     * advances `time`, this callback forwards it as `lenis.raf(time * 1000)`,
     * Lenis computes `deltaTime = time - this.time`, and `advance()` adds that
     * straight to the running animation — `currentTime += deltaTime`, with only
     * the resulting *progress* clamped to 1. So a 900ms main-thread stall does
     * not merely delay a scroll in flight, it finishes it: the page teleports
     * to wherever the flick was headed instead of gliding there. Every scrubbed
     * tween driven off the same ticker does the same thing. That is the reported
     * "the scroll is very messy, it hangs everywhere" — not one long freeze, but
     * a scroll that keeps snapping to its destination.
     *
     * Clamping restores the honest reading of a stall: time did not pass for the
     * animation, so it continues from where it was. A frame under LAG_MS passes
     * through untouched, so ordinary scrolling — including a desktop having a
     * bad frame — is bit-for-bit what it was before.
     *
     * LAG_MS is deliberately not lower. A device stuck at 3fps has 333ms frames
     * and needs real time to keep passing, or the clock dilates and the scroll
     * falls further behind the finger with every frame. The line belongs above
     * "slow but sustained" and below "stopped", which is where GSAP put it.
     */
    gsap.ticker.lagSmoothing(LAG_MS, LAG_STEP_MS);

    return () => {
      lenis.off('scroll', onScroll);
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);
}
