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
 * Act one: the claim, in two beats. The systems half, then the interface half,
 * each headline followed by the paragraph that makes it concrete.
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
 * The handoff survives, retimed. It used to be measured from a pin releasing;
 * it is measured from the copy instead — once the last line has climbed past
 * the lower third of the screen the reader is finished with it, and it
 * dissolves (lifts, blurs, clears) while the terminal rises underneath. Same
 * tween, same job: one beat replacing another should read as a cut, not as a
 * long scroll past some text.
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

    const handoff = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: content,
        start: 'bottom 35%',
        end: 'bottom 5%',
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

          {/* Beat two, the interface half. Same face and same size as the
              headline above it, because it is the same claim continued — the
              two are separated by air rather than by a change of style. A <p>
              rather than a second <h1>: the page has one headline, and this is
              it still talking. */}
          <p className="hero-punch" data-reveal>
            Interfaces that feel,
            <br />
            visuals that interact.
          </p>
          <p className="lede" data-reveal>
            The design half is not decoration. It is where a system becomes
            something a person can rely on &mdash; the flow, the states nobody
            plans for, the words in every error message. I build that myself in
            React and TypeScript, so what ships is what was designed, motion and
            edge cases included.
          </p>
        </div>

        <div className="scroll-cue mono">
          <span className="bar" />
          scroll
        </div>
      </section>
    </div>
  );
}
