import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

/**
 * The scrollytelling backbone, made visible: a hairline rail down the left edge
 * whose fill tracks total page progress. It's the cheapest way to say "these are
 * acts of one sequence, not five stacked sections" — the eye reads a single
 * continuous line crossing every section boundary.
 *
 * One numeric custom property drives both the fill's scaleY and the leading dot's
 * translate. Scaling the dot as part of the fill would squash it to nothing at low
 * progress, and the alternative — two separately scrubbed tweens — can drift apart
 * by a frame.
 */
export function ScrollSpine() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const spine = ref.current;
    if (!spine) return;

    // With no smooth scroll there's nothing to scrub against, and a progress
    // meter that jumps per wheel-tick is worse than no progress meter.
    if (prefersReducedMotion()) return;

    spine.dataset.live = 'true';

    const tween = gsap.fromTo(
      spine,
      { '--spine': 0 },
      {
        '--spine': 1,
        ease: 'none',
        scrollTrigger: {
          start: 0,
          end: 'max',
          // A touch of smoothing so the leading edge glides rather than
          // twitching with every wheel event.
          scrub: 0.4,
        },
      }
    );

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, []);

  return (
    <div className="scroll-spine" ref={ref} aria-hidden>
      <span className="scroll-spine-track" />
      <span className="scroll-spine-fill" />
      <span className="scroll-spine-dot" />
    </div>
  );
}
