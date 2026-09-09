import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from './useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

/**
 * Scroll-driven entrances for section furniture — kickers, titles, ledes.
 *
 * Two rules keep it from becoming the usual scroll-animation tax:
 *
 * 1. Every reveal *completes* while its element is still in the lower half of
 *    the viewport. Text you are trying to read must never be mid-tween.
 * 2. Only opacity and transform, on a handful of elements, at a small distance.
 *    The point is that arriving feels soft, not that things are Animated.
 *
 * Elements inside a sticky act are excluded on purpose: their natural (pre-stuck)
 * position sits at the top of a 200vh wrapper, so a viewport-relative trigger
 * would fire long before they're on screen. Those beats are choreographed by
 * their act's own timeline instead.
 */
export function useScrollReveal() {
  useEffect(() => {
    const targets = gsap.utils.toArray<HTMLElement>('[data-reveal]');
    if (targets.length === 0) return;

    if (prefersReducedMotion()) {
      gsap.set(targets, { y: 0, opacity: 1, clearProps: 'transform' });
      return;
    }

    const tweens = targets.map((el) =>
      gsap.fromTo(
        el,
        { y: 24, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            start: 'top 94%',
            end: 'top 68%',
            scrub: 0.5,
          },
        }
      )
    );

    return () => {
      for (const tween of tweens) {
        tween.scrollTrigger?.kill();
        tween.kill();
      }
    };
  }, []);
}

/**
 * Sticky acts, a lazy-loaded portrait and a background video all resolve their
 * final size after first paint, and every ScrollTrigger start/end is measured in
 * pixels. Without a refresh once things settle, the whole sequence is keyed to a
 * layout that no longer exists.
 */
export function useScrollTriggerRefresh() {
  useEffect(() => {
    const refresh = () => ScrollTrigger.refresh();

    window.addEventListener('load', refresh);
    document.fonts?.ready.then(refresh).catch(() => {});

    return () => window.removeEventListener('load', refresh);
  }, []);
}
