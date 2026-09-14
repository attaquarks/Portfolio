import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

/**
 * 96 divides into 12 × 8 on a wide screen and 8 × 12 on a narrow one, so the
 * column count can move at a breakpoint in CSS alone and the tiles stay roughly
 * square either way. Fixed here so React never has to re-render the mosaic.
 */
const TILES = Array.from({ length: 96 }, (_, i) => i);

/**
 * Act four. The portrait is the stage, not an illustration beside the text.
 *
 * The sequence is one scrubbed timeline in two beats, in this order for a
 * reason: the image resolves out of a mosaic of ink tiles first, and only once
 * it has *finished* resolving does the copy come up on top of it. Overlapping
 * the two would mean reading a paragraph while the thing behind it is still
 * changing, which is the specific way scroll-driven sections become unreadable.
 *
 * Blocks rather than a wipe because the subject is a dithered ASCII render — it
 * is already made of cells, so clearing it cell-wise is the material's own
 * behaviour rather than an effect applied to it. It also happens to be the
 * cheapest possible reveal: 96 elements changing nothing but opacity, which the
 * compositor handles without a single layout or paint.
 *
 * The final beat lands at ~85% of the act, not at 100%. The remaining scroll is
 * a deliberate hold on the finished frame, so anyone who stops at the bottom of
 * this section sees a resolved portrait with settled type rather than the last
 * frame of an animation.
 */
export function AboutStage() {
  const actRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const act = actRef.current;
    if (!act) return;

    const tiles = act.querySelectorAll<HTMLElement>('.about-tile');
    const blocks = act.querySelectorAll<HTMLElement>('.about-block');
    const portrait = act.querySelector<HTMLElement>('.about-portrait');

    if (prefersReducedMotion()) {
      gsap.set(tiles, { opacity: 0 });
      gsap.set(blocks, { y: 0, opacity: 1 });
      gsap.set(portrait, { scale: 1 });
      return;
    }

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: act,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.5,
      },
    });

    tl
      // Random rather than a grid origin: an ordered sweep reads as a wipe with
      // extra steps, where random reads as something arriving over a connection.
      .to(
        tiles,
        {
          opacity: 0,
          duration: 1,
          stagger: { amount: 0.85, from: 'random', ease: 'none' },
        },
        0
      )
      // A long, almost imperceptible settle underneath the whole thing. It is
      // what stops the resolved portrait from feeling like a static plate that
      // was simply uncovered.
      .fromTo(portrait, { scale: 1.07 }, { scale: 1, duration: 2.04 }, 0)
      .fromTo(
        blocks,
        { y: 26, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.55, stagger: 0.12 },
        1.28
      )
      // An explicit tail. Timeline length is set by its children, so without a
      // placeholder the last beat would finish exactly as the act releases.
      .to({}, { duration: 0.36 }, 2.04);

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, []);

  return (
    <div className="act act-about" id="about" ref={actRef}>
      <section className="about-stage">
        <div className="about-plate">
          <img
            className="about-portrait"
            src="/ascii/portrait-phosphor.png"
            alt="Portrait of Atta Ur Rehman, rendered as dithered ASCII characters"
            width={680}
            height={682}
            loading="lazy"
            decoding="async"
          />
          <span className="about-portrait-scan" aria-hidden />

          {/* The tiles sit above the portrait and below the copy: they are what
              the image is arriving *out of*, so they have to occlude it. */}
          <div className="about-mosaic" aria-hidden>
            {TILES.map((i) => (
              <span className="about-tile" key={i} />
            ))}
          </div>
        </div>

        {/* Outside the plate on purpose. As a child it was clipped to the
            plate's box, and its darkest stop landed on the plate's left edge as
            a hard vertical seam running the full height of the viewport. Spanning
            the stage, the same ramp starts off the left of the screen and there
            is no edge to see. */}
        <span className="about-portrait-scrim" aria-hidden />

        <div className="section-inner about-overlay">
          <div className="kicker about-block">
            <span className="kicker-index">004</span>
            <span>who&rsquo;s behind it</span>
          </div>
          {/* Three words carry the display face: the claim in the title is the
              same one the hero makes in brackets, so it gets the treatment that
              makes a reader stop on it. Everything else stays in the text faces
              — a decorative face on a whole sentence is a poster, and this is
              still a section of a portfolio that has to be read. */}
          <h2 className="section-title about-block">
            The <span className="facade">Engineer</span> who{' '}
            <span className="facade">Designs</span> software from a{' '}
            <span className="facade">terminal</span>:
          </h2>
          <p className="lede about-block">
            One person for both jobs is the point: the model&rsquo;s evaluation
            and the words in the empty state get decided in the same head, so
            neither is designed around the other. Most of that happens in a
            terminal.
          </p>
          <ul className="about-facts about-block">
            <li>
              <span className="about-fact-key">Looking for</span>
              <span className="about-fact-value">
                AI engineering &amp; applied ML roles, remote or hybrid
              </span>
            </li>
            <li>
              <span className="about-fact-key">Domains</span>
              <span className="about-fact-value">
                Healthcare, productivity tooling, developer tools
              </span>
            </li>
            <li>
              <span className="about-fact-key">Working with</span>
              <span className="about-fact-value">Teams in any timezone, from UTC+5</span>
            </li>
          </ul>

          {/* The indentation is the whole idea: the title runs full width, this
              sits in from the left like a second paragraph starting on a page,
              so it reads as an aside to the claim rather than a fourth fact.
              It is also the one block on the page that answers the third
              bracket in the hero. */}
          <div className="about-terminal about-block">
            <p className="about-terminal-label">TERMINAL ENTHUSIAST</p>
            <p className="about-terminal-copy">
              Everything runs in one window: agents beside the build, several at
              once, each on its own branch of the work. Bash does the rest &mdash;
              layouts, migrations, tests, deploys &mdash; and a script gets
              written before a menu gets opened.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
