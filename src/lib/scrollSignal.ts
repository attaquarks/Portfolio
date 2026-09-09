import gsap from 'gsap';

/**
 * One "the page moved" subscription for the things that can't be expressed as a
 * ScrollTrigger — a canvas that wants scroll velocity, a hover glow that has to
 * recompute its bounds.
 *
 * Lenis drives gsap.ticker (see useSmoothScroll), so hanging off the ticker and
 * diffing scrollY puts these callbacks on the same frame as the smoothed scroll
 * position. A real `scroll` listener would be a second scroll source running a
 * frame out of step with Lenis, which is the one thing this project must not
 * have. The ticker runs with or without Lenis, so this also works untouched
 * under prefers-reduced-motion, where Lenis never starts.
 */
type Subscriber = (y: number, delta: number) => void;

const subscribers = new Set<Subscriber>();
let lastY = 0;

function frame() {
  const y = window.scrollY;
  const delta = y - lastY;
  if (delta === 0) return;
  lastY = y;
  for (const fn of subscribers) fn(y, delta);
}

export function onScrollFrame(fn: Subscriber) {
  if (subscribers.size === 0) {
    lastY = window.scrollY;
    gsap.ticker.add(frame);
  }
  subscribers.add(fn);

  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) gsap.ticker.remove(frame);
  };
}
