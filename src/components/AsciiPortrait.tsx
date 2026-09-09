import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

/**
 * The ASCII portrait, wiped in from the bottom as the about section arrives.
 *
 * The asset itself is untouched — the retint to --glow happens purely at the
 * compositing layer (see .ascii-portrait in styles.css), so the finished render
 * stays the finished render while still belonging to the palette.
 *
 * The reveal is scroll-driven but deliberately front-loaded: it completes while
 * the figure is still entering the viewport, so a reader who stops mid-scroll
 * never gets a half-drawn portrait. Scrubbing decoration is good; scrubbing
 * something someone is trying to look at is not.
 */
export function AsciiPortrait() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const figure = ref.current;
    if (!figure) return;
    const image = figure.querySelector('img');
    if (!image) return;

    if (prefersReducedMotion()) {
      gsap.set(image, { clipPath: 'inset(0% 0% 0% 0%)' });
      return;
    }

    const tween = gsap.fromTo(
      image,
      { clipPath: 'inset(0% 0% 100% 0%)' },
      {
        clipPath: 'inset(0% 0% 0% 0%)',
        ease: 'none',
        scrollTrigger: {
          trigger: figure,
          // The end is keyed to the figure's *bottom*, not its top. A
          // viewport-relative top offset like `top 42%` is not reachable for an
          // element that sits near the end of the document — on a phone the
          // portrait is the last thing before the footer, the page runs out of
          // scroll, and the reveal freezes half-drawn forever.
          start: 'top 90%',
          end: 'bottom 80%',
          scrub: 0.5,
        },
      }
    );

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, []);

  return (
    <figure className="ascii-portrait" ref={ref}>
      {/* The frame owns the ink backdrop the image screens against, and clips the
          bloom and scanlines. The caption sits outside it so those overlays never
          land on top of text. */}
      <span className="ascii-portrait-frame">
        <span className="ascii-portrait-bloom" aria-hidden />
        <img
          src="/ascii/portrait.png"
          alt="Portrait of Atta Ur Rehman rendered as ASCII characters"
          width={680}
          height={682}
          loading="lazy"
          decoding="async"
        />
        <span className="ascii-portrait-scan" aria-hidden />
        <span className="ascii-portrait-vignette" aria-hidden />
      </span>
      <figcaption className="mono">./render --mode=ascii --subject=self</figcaption>
    </figure>
  );
}
