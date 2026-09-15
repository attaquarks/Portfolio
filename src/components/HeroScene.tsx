import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { LivingField } from './LivingField';
import { BootLine } from './BootLine';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

const BOOT_LINES = [
  '> initializing attaquarks.system...',
  '> loading agents, models, and a few bad ideas...',
];

/**
 * Act one: the claim, in two beats, one screen each. The systems half, then the
 * interface half, each headline followed by the paragraph that makes it concrete.
 *
 * The hero used to be a single pinned screen that handed itself off to the
 * terminal. It scrolls now, and that is a consequence of the second beat rather
 * than a change of heart: one screen cannot hold two headlines and two
 * paragraphs without shrinking the headline down from the display size it
 * exists to be set at, and a hero that clips its own opening line on a short
 * laptop is worse than one that asks for a scroll. So the first screen is the
 * systems half, and the second is found by scrolling — which is also the
 * grammar the rest of the page already speaks.
 *
 * Each beat is now a full screen rather than a block of copy, which is a
 * stronger claim than "it scrolls": on arrival the first beat is the *whole* of
 * what is on screen, and the second is not peeking above the fold waiting to be
 * half-read. `.hero-beat` sets the height in CSS; the copy does not decide it.
 * The air between a headline and its paragraph is set on the paragraph, so it
 * is the same gap in both beats.
 *
 * The handoff survives, retimed to the last thing read here rather than to the
 * column's own bottom edge — see the note on it below.
 */
export function HeroScene() {
  const actRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const act = actRef.current;
    if (!act) return;

    const content = act.querySelector('.hero-content');
    const cue = act.querySelector('.scroll-cue');
    const field = act.querySelector('.hero-canvas');
    const intro = act.querySelectorAll('.hero-intro');
    const beatTwo = act.querySelector('.hero-beat-two');

    if (prefersReducedMotion()) {
      gsap.set(intro, { y: 0, opacity: 1 });
      return;
    }

    // A load-in, not a scroll-in. Arriving is a once-per-visit moment, which is
    // the one place a little choreography is worth its cost. Only the first beat
    // is in this tween: the second one starts below the fold, so animating it
    // here would be animating to nobody. Its elements carry the site's shared
    // `data-reveal` instead and arrive when they are actually on screen.
    //
    // fromTo, not from, and the end values are explicit for a reason: cleanup
    // kills this tween, which leaves the elements sitting at the *from* state.
    // A `gsap.from` recreated by StrictMode's second effect pass would then read
    // that opacity: 0 as its destination and animate 0 → 0, and the hero copy
    // never appears at all.
    const entrance = gsap.fromTo(
      intro,
      { y: 18, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.72,
        stagger: 0.09,
        ease: 'power3.out',
        delay: 0.12,
      }
    );

    // The cue has done its job the instant you start scrolling; holding it any
    // longer is the interface talking over itself. It needs its own tween now,
    // because the handoff below doesn't begin until the copy is nearly read —
    // by which time the cue would have been sitting there for two screens.
    const cueFade = gsap.to(cue, {
      opacity: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: act,
        start: 'top top',
        end: '+=140',
        scrub: true,
      },
    });

    // Measured from the *second* beat, not from the copy column. The column is
    // two screens tall now, so its bottom edge reaches `35%` only once beat two
    // has already left the top of the screen — the whole dissolve would play to
    // an empty viewport. Beat two is the last thing anyone reads here, so it is
    // the thing whose exit the handoff should be timed to.
    //
    // Timed to the end of the read rather than to the end of the beat, which is
    // the difference between the two probes. Beat two's paragraph finishes
    // arriving around 900px of scroll; starting the dissolve at `bottom 80%`
    // puts it at 1080, so the paragraph is still being read when it starts to
    // go. At `bottom 60%` the paragraph's last line has risen to 290px from the
    // top of the screen before anything moves — the beat is finished with
    // before it is given away. The end stays clear of the act's own boundary at
    // 1800, so the hero is fully released while the next act is still arriving
    // underneath it rather than after it has already arrived.
    const handoff = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: beatTwo,
        start: 'bottom 60%',
        end: 'bottom 15%',
        scrub: 0.4,
      },
    });

    handoff
      // Blur is doing real work in that tween — it bridges the crossfade so the
      // eye reads one thing receding rather than two things overlapping. It's
      // applied to a single element for exactly that reason; the same trick
      // across five project cards would cost five offscreen renders a frame.
      .to(content, { y: -80, opacity: 0, filter: 'blur(6px)', duration: 1 }, 0)
      // The particle field thins out but doesn't go to zero. A section that
      // empties completely spends its exit as a blank rectangle sliding up the
      // screen; keeping a trace means the hero is still *something* while the
      // next act arrives underneath it. (The fluid wallpaper is not part of
      // this timeline — it sits behind every act and runs its own scroll
      // response, so the hero releasing must not switch it off.)
      .to(field, { opacity: 0.4, duration: 1 }, 0);

    return () => {
      entrance.kill();
      cueFade.scrollTrigger?.kill();
      cueFade.kill();
      handoff.scrollTrigger?.kill();
      handoff.kill();
    };
  }, []);

  return (
    <div className="act act-hero" ref={actRef}>
      <section className="hero">
        <LivingField />
        <div className="hero-veil" aria-hidden />

        <div className="hero-content">
          {/* Beat one owns the first screen outright. Nothing of beat two is
              visible on arrival: the claim and the paragraph that grounds it are
              the whole of what a visitor is given before they choose to scroll,
              and the second half is something they find rather than something
              they are shown. `min-height: 100svh` on the two `.hero-beat`
              wrappers is what enforces that, not the copy's own length. */}
          <div className="hero-beat hero-beat-one">
            <div className="hero-intro">
              <BootLine lines={BOOT_LINES} />
            </div>
            {/* The positioning, stated as three brackets rather than a sentence,
                and sized to be read rather than skimmed — this is the line that
                says what I am, so it leads. Departure Mono is doing real work
                here: three short labels in caps are exactly what a pixel-grid
                face is legible at, and the brackets make them read as a spec
                sheet instead of a slogan. All three are claims the page then has
                to prove: the two roles in the approach act, the third in the
                terminal and the about act. */}
            <p className="hero-roles hero-intro">
              <span>[ AI Engineer ]</span>
              <span>[ Product Designer ]</span>
              <span>[ Terminal Enthusiast ]</span>
            </p>
            {/* Beat one, the systems half. */}
            <h1 className="hero-intro">
              Systems that think,
              <br />
              tools that work.
            </h1>
            <p className="lede hero-intro">
              Atta Ur Rehman &mdash; AI &amp; full-stack developer building agentic
              workflows, retrieval that preserves context, and the interfaces that
              make all of it usable. Engineering and design as one job, mostly done
              from a terminal.
            </p>
          </div>

          {/* Beat two, the interface half. Same face and same size as the
              headline above it, because it is the same claim continued — the two
              are separated by a screen rather than by a change of style. A <p>
              rather than a second <h1>: the page has one headline, and this is
              it still talking.

              Set on the other margin from beat one. The claim is one statement
              in two halves, and opposing them is what makes the second read as
              the answer to the first rather than as the paragraph after it. The
              paragraph below goes with it — a right-aligned headline over a
              left-aligned paragraph is a layout that has not decided.

              It arrives on scroll rather than on load. The `data-reveal` below is
              the site's shared scrubbed entrance, so the headline and its
              paragraph come up over a quarter-screen of scrolling with the
              reader's own movement driving them; nothing is animating to somebody
              who has not asked for it yet. */}
          <div className="hero-beat hero-beat-two">
            <p className="hero-punch hero-beat-right" data-reveal>
              Interface that feels,
              <br />
              Design that moves.
            </p>
            <p className="lede hero-beat-right" data-reveal>
              The design half is not decoration. It is where a system becomes
              something a person can rely on &mdash; the flow, the states nobody
              plans for, the words in every error message. I build that myself in
              React and TypeScript, so what ships is what was designed, motion and
              edge cases included.
            </p>
          </div>
        </div>

        <div className="scroll-cue mono">
          <span className="bar" />
          scroll
        </div>
      </section>
    </div>
  );
}
