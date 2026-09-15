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

/** The phrase the stamp is allowed to end on, and the only one it can end on. */
const STAMP_TEXT = 'TERMINAL ENTHUSIAST';

/**
 * The pool the stamp draws from while it is unresolved. Same shape of set as
 * the `chars` option ScrambleTextPlugin takes — letters, digits, punctuation.
 * Blocks and box-drawing glyphs are deliberately absent: a filled rectangle
 * reads as a redaction bar, which is a claim that the text is being *withheld*,
 * a different and much older idea than a value that has not settled yet.
 */
const STAMP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*?+=';

/** Fraction of the stamp's window spent growing the string to full length. */
const STAMP_GROW = 0.88;
/**
 * Where the window resolves. The gap between this and STAMP_GROW is deliberate:
 * the phrase reaches full length, stays scrambled for a beat, and then lands as
 * one event. Decoding on the same frame the last character arrives would read
 * as the string simply filling up.
 */
const STAMP_RESOLVE = 0.92;

/**
 * The timeline's shape, in its own units. `.act-about`'s height is set from the
 * total — LATE_END plus the closing hold — which is what fixes one timeline unit
 * at 66.67svh of scroll: the portrait keeps the exact settle it has always had,
 * and the stamp's window is 60svh of scroll at every viewport and every copy
 * length.
 */
const SCRAMBLE_START = 2.1;
const SCRAMBLE_DURATION = 0.9;
const LATE_START = 3.0;
const LATE_END = 3.79;

/**
 * The other half of the unpinning rule in styles.css. Kept in step with that
 * query by hand: this act is one screen tall by design, and on a screen too
 * short to hold its column the honest version is the static one rather than a
 * pinned column with its first and last lines cut off. Matches the
 * reduced-motion treatment, which is the same trade.
 *
 * All three clauses are in the CSS too, in the same order, so the two files can
 * be read against each other. The numbers are low on purpose — a laptop at
 * 1366x768 has a ~650px *window*, not 768, and an earlier version of this that
 * keyed off 700px unpinned the act on most laptops while there was still 120px
 * of screen left unused below the column.
 */
const isShortViewport = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(max-height: 580px)').matches ||
    window.matchMedia('(min-width: 1200px) and (max-height: 620px)').matches ||
    window.matchMedia('(max-width: 450px) and (max-height: 740px)').matches);

/**
 * Paints the stamp at `t` through its scroll window.
 *
 * The shape of this is the whole point of the section, and it is *not* what
 * ScrambleTextPlugin does — worth stating plainly, because the plugin is the
 * obvious thing to reach for and it cannot produce this. Its render resolves a
 * prefix to the true text and scrambles only what is left over
 * (`startText = text.slice(0, i)`, "ScrambleTextPlugin.js"), so the string
 * holds its full width from the first frame and decodes left to right: character
 * one settles, then character two. The behaviour asked for here is the other
 * idea — the string *grows*, every character in it stays random the whole way
 * up, and the phrase lands complete in one step. No combination of the plugin's
 * options expresses that, so the plugin is not used and the randomness lives
 * here. Every line of this is the behaviour that was asked for, not a fallback
 * from it.
 */
function paintStamp(el: HTMLElement, t: number) {
  if (t >= STAMP_RESOLVE) {
    if (el.textContent !== STAMP_TEXT) el.textContent = STAMP_TEXT;
    return;
  }

  const n = Math.max(
    1,
    Math.min(
      STAMP_TEXT.length,
      Math.round((t / STAMP_GROW) * STAMP_TEXT.length)
    )
  );

  let out = '';
  for (let i = 0; i < n; i++) {
    // The space holds its place rather than being randomised. It is what keeps
    // the phrase reading as two words the whole way up, instead of one long
    // token that splits in two on the final frame.
    out +=
      STAMP_TEXT.charAt(i) === ' '
        ? ' '
        : STAMP_CHARS.charAt((Math.random() * STAMP_CHARS.length) | 0);
  }
  el.textContent = out;
}

/**
 * Act four. The portrait is the stage, not an illustration beside the text.
 *
 * The sequence is one scrubbed timeline in three beats, in this order for a
 * reason: the image resolves out of a mosaic of ink tiles first, and only once
 * it has *finished* resolving does the copy come up on top of it. Overlapping
 * the two would mean reading a paragraph while the thing behind it is still
 * changing, which is the specific way scroll-driven sections become unreadable.
 *
 * The third beat is the stamp, and it opens the act: the kicker, the stamp and
 * the heading arrive together, then TERMINAL ENTHUSIAST decodes over a long
 * stretch of scroll, and only once it has resolved do the paragraph and the
 * facts under it start. The prose is held back deliberately — a paragraph typing
 * itself in beneath a string that is still scrambling reads as two things
 * competing for the same moment.
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
    const portrait = act.querySelector<HTMLElement>('.about-portrait');
    const stamp = act.querySelector<HTMLElement>('.about-stamp-live');
    // Two groups, not one. The kicker, the stamp and the heading arrive
    // together; the paragraph and the facts wait for the stamp to finish
    // decoding. The grouping is by class rather than by document order, so
    // moving the stamp above the heading did not change which beat it lands in.
    const blocksEarly = act.querySelectorAll<HTMLElement>(
      '.about-block:not(.about-block-late)'
    );
    const blocksLate = act.querySelectorAll<HTMLElement>('.about-block-late');

    if (prefersReducedMotion() || isShortViewport()) {
      gsap.set(tiles, { opacity: 0 });
      gsap.set(act.querySelectorAll<HTMLElement>('.about-block'), {
        y: 0,
        opacity: 1,
      });
      gsap.set(portrait, { scale: 1 });
      // The stamp is left exactly as React rendered it: the finished phrase is
      // the honest static version of a string that was going to end there.
      return;
    }

    // ScrollTrigger only paints the stamp once the playhead reaches its window.
    // Painting it here means the act doesn't show the finished phrase for the
    // first screen and a half of its scroll, before the window opens.
    const stampState = { t: 0 };
    const paint = () => {
      if (stamp) paintStamp(stamp, stampState.t);
    };
    paint();

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
        blocksEarly,
        { y: 26, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.55, stagger: 0.12 },
        1.28
      )
      // The stamp's own window, driven by the same scrubbed playhead as
      // everything else rather than by a ScrollTrigger of its own: one progress
      // value for the act means the decode cannot drift out of step with the
      // image behind it when the user scrolls back up.
      .to(
        stampState,
        {
          t: 1,
          duration: SCRAMBLE_DURATION,
          ease: 'none',
          onUpdate: paint,
        },
        SCRAMBLE_START
      )
      .fromTo(
        blocksLate,
        { y: 26, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.55, stagger: 0.12 },
        LATE_START
      )
      // An explicit tail. Timeline length is set by its children, so without a
      // placeholder the last beat would finish exactly as the act releases.
      .to({}, { duration: 0.36 }, LATE_END);

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
      // StrictMode runs this effect twice. Putting the phrase back means the
      // second pass starts from the element's rendered state, not from
      // whatever the first pass happened to leave mid-scramble.
      if (stamp) stamp.textContent = STAMP_TEXT;
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
          {/* The act's one display moment, and the only string on the page that
              arrives rather than is read. It opens the act, above the heading,
              because it is the answer the heading then explains — the phrase
              comes first and the sentence about it follows, which is the order
              the hero's brackets set up three sections earlier.

              It is the hero's third bracket spent properly: Departure Mono,
              because this is machine output and the face is what says so, and
              set apart from the heading below and the prose under that by air
              rather than by a rule. Centred, because it is the one element in
              this column that is not part of the reading — it is a stamp.

              Two elements, one visible: the scramble rewrites textContent every
              frame, so assistive tech is given a stable copy of the phrase
              instead of the half-decoded string. */}
          <div className="about-stamp about-block">
            <span className="about-stamp-live" aria-hidden="true">
              TERMINAL ENTHUSIAST
            </span>
            <span className="sr-only">Terminal enthusiast</span>
          </div>

          {/* One face throughout. This heading held the site's only Façade Est
              words until 2026-09-15, when the stamp above took over as the act's
              display moment — two ornamental treatments in one column is one
              too many, and the stamp is the one that says something the plain
              face cannot. */}
          <h2 className="section-title about-block">
            Engineer who builds Software from a terminal:
          </h2>

          <p className="lede about-block about-block-late">
            One person for both jobs is the point: the model&rsquo;s evaluation
            and the words in the empty state get decided in the same head, so
            neither is designed around the other. Most of that happens in a
            terminal.
          </p>
          <ul className="about-facts about-block about-block-late">
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
        </div>
      </section>
    </div>
  );
}
