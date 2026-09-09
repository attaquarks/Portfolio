import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Single source of truth for the reduced-motion preference, so the CSS block
 * in styles.css, GSAP timelines, Motion gestures, the R3F loop and the
 * background video all make the same decision from the same signal.
 *
 * Reads synchronously on first render (no post-mount flash of motion) and
 * stays live, because the preference can change mid-session.
 */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia(QUERY).matches;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
