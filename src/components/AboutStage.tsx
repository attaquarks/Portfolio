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
 * at 66.67svh of scroll: the portrait keeps the exact settle it has always had
 * at every viewport.
 *
 * The stamp is deliberately not one of these children any more. A decode driven
 * by scroll position runs at whatever speed the reader happens to scroll: crawled
 * it never lands, flicked it is over before the eye reaches it, and on a phone
 * too short to pin the act the timeline is never built at all, so it never ran
 * there. It is timed separately now, and this constant survives only as the point
 * at which the scroll has carried its container in far enough to let go.
 */
const SCRAMBLE_START = 2.1;
const LATE_START = 3.0;
const LATE_END = 3.79;
/** The closing hold. Being last, it is also what sets the timeline's length. */
const TAIL = 0.36;
const TIMELINE_TOTAL = LATE_END + TAIL;
/**
 * The scroll fraction at which the stamp's container has finished arriving, and
 * therefore where the decode is released. That is the whole of the scroll's
 * involvement in the decode: it decides *when* it starts, never how fast it runs
 * once it has.
 */
const DECODE_AT = SCRAMBLE_START / TIMELINE_TOTAL;
/**
 * How long the decode takes once released. A wall-clock beat rather than a
 * scroll distance, so it is the same length on every device and at every scroll
 * speed: long enough to read as a string arriving a character at a time, short
 * enough to have landed by the time the eye settles on it.
 */
const SCRAMBLE_SECONDS = 2;

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
 * Paints the stamp at `t` through its decode window, where `t` runs 0 to 1 over
 * SCRAMBLE_SECONDS of wall clock rather than over a distance of scroll.
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
 * The sequence is a scrubbed timeline with the stamp running on a clock of its
 * own. The image resolves out of a mosaic of ink tiles first, and only once it
 * has *finished* resolving does the copy come up on top of it. Overlapping the
 * two would mean reading a paragraph while the thing behind it is still
 * changing, which is the specific way scroll-driven sections become unreadable.
 *
 * The stamp is the deliberate exception to the scrubbing. The kicker, the stamp
 * and the heading arrive together as the scroll carries them in, and then
 * TERMINAL ENTHUSIAST decodes at a fixed pace that the reader's scroll speed
 * cannot touch — see DECODE_AT and SCRAMBLE_SECONDS. Only once it has resolved
 * do the paragraph and the facts under it start; the prose is held back
 * deliberately, because a paragraph typing itself in beneath a string that is
 * still scrambling reads as two things competing for the same moment.
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
    const stampBlock = act.querySelector<HTMLElement>('.about-stamp');
    // Two groups, not one. The kicker, the stamp and the heading arrive
    // together; the paragraph and the facts wait for the stamp to finish
    // decoding. The grouping is by class rather than by document order, so
    // moving the stamp above the heading did not change which beat it lands in.
    const blocksEarly = act.querySelectorAll<HTMLElement>(
      '.about-block:not(.about-block-late)'
    );
    const blocksLate = act.querySelectorAll<HTMLElement>('.about-block-late');

    // Reduced motion is the one case that gets no decode at all. The preference
    // is a statement about the person rather than about the hardware, and a
    // string that churns through random characters before landing is high on the
    // list of things it is asking not to be shown.
    if (prefersReducedMotion()) {
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

    // The decode lives on its own clock. Nothing below writes `stampState`
    // except this one paused tween, so scroll can start the decode but can never
    // drive it, stall it, or scrub it backwards.
    const stampState = { t: 0 };
    const paint = () => {
      if (stamp) paintStamp(stamp, stampState.t);
    };
    // Painted at rest rather than left as React rendered it, so the phrase grows
    // out of one character when it starts instead of collapsing to one.
    paint();

    const scramble = gsap.to(stampState, {
      t: 1,
      duration: SCRAMBLE_SECONDS,
      ease: 'none',
      paused: true,
      onUpdate: paint,
    });

    // Scroll is allowed exactly one involvement: releasing the decode, once. A
    // second release would restart a phrase that has already landed.
    let started = false;
    const startScramble = () => {
      if (started) return;
      started = true;
      scramble.play();
    };

    // A page restored to a scroll position at or past the stamp never crosses
    // either trigger below, which would strand the phrase at the single
    // character `paint` left it showing. Asking the element where it is covers
    // the deep link and the restored scroll in one line.
    const pastStart = () =>
      !!stampBlock &&
      stampBlock.getBoundingClientRect().top < window.innerHeight * 0.85;

    if (isShortViewport()) {
      gsap.set(tiles, { opacity: 0 });
      gsap.set(act.querySelectorAll<HTMLElement>('.about-block'), {
        y: 0,
        opacity: 1,
      });
      gsap.set(portrait, { scale: 1 });

      // No pinned timeline runs on this path, so the stamp arriving is itself
      // the cue. This is the path a short phone takes — the Galaxy S9 and the J7
      // are why it exists — and it is the reason the decode is no longer a
      // timeline child: on those phones the timeline is never built, so a
      // timeline child could never have run there.
      const entry = ScrollTrigger.create({
        trigger: stampBlock ?? act,
        start: 'top 85%',
        once: true,
        onEnter: startScramble,
      });
      if (pastStart()) startScramble();

      return () => {
        entry.kill();
        scramble.kill();
        // StrictMode runs this effect twice. Putting the phrase back means the
        // second pass starts from the element's rendered state, not from
        // whatever the first pass happened to leave mid-scramble.
        if (stamp) stamp.textContent = STAMP_TEXT;
      };
    }

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: act,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.5,
        // The whole of what scroll still decides about the stamp: it carries the
        // container in, and DECODE_AT is the point at which that container has
        // landed and the phrase is let go. From there the tween runs to its end
        // at the same pace whether the reader keeps scrolling, stops dead, or
        // scrolls back up — which is the behaviour asked for, and the one this
        // could not have while it was a child of the scrubbed timeline.
        //
        // `self.progress` is the raw scroll fraction, read before the 0.5s scrub
        // catch-up, so the release leads the container by a few frames. That is
        // invisible here: the decode opens on a single character, so the first
        // frames of it read as part of the container's arrival.
        onUpdate: (self) => {
          if (self.progress >= DECODE_AT) startScramble();
        },
      },
    });

    if (pastStart()) startScramble();

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
      .fromTo(
        blocksLate,
        { y: 26, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.55, stagger: 0.12 },
        LATE_START
      )
      // An explicit tail. Timeline length is set by its children, so without a
      // placeholder the last beat would finish exactly as the act releases.
      .to({}, { duration: TAIL }, LATE_END);

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
      scramble.kill();
      // StrictMode runs this effect twice. Putting the phrase back means the
      // second pass starts from the element's rendered state, not from whatever
      // the first pass happened to leave mid-scramble.
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

              It is the hero's third bracket spent properly, and it is set in
              Façade Est — the site's one ornamental face — rather than in
              Departure Mono. The pixel-grid face says *this is machine output*,
              which the scramble already says on its own; what it cannot do is
              look like it was stamped. Façade Est's planes are heavy enough to
              read as impressed into the page at this size, which is what the
              phrase is doing here, and it keeps the act from spending its one
              display moment in the same face as the code blocks two acts up.
              Set apart from the heading below and the prose under that by air
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
              face cannot.

              The break is authored rather than left to the measure. "Building
              Software / from a terminal" is how the sentence wants to be read —
              the object on one line and where it happens on the next — and at
              some widths an unattended wrap would put "a terminal" alone on the
              second line and lose that. A hard break holds the reading at every
              size; there is room for it because "Building Software" is well
              under the column even at 320px. */}
          <h2 className="section-title about-block">
            Building Software
            <br />
            from a terminal
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
