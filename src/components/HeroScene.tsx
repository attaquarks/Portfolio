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
 * Act one. The hero is sticky for an extra viewport of scroll and hands itself
 * off: content lifts, blurs and clears while the atmosphere pulls back and the
 * particle field drops to a trace. That handoff is what makes the stack section
 * feel like the next beat of one sequence instead of the top of a new page.
 *
 * Blur is doing real work in that tween — it bridges the crossfade so the eye
 * reads one thing receding rather than two things overlapping. It's applied to a
 * single element for exactly that reason; the same trick across five project
 * cards would cost five offscreen renders a frame.
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
    // the one place a little choreography is worth its cost.
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

    const handoff = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: act,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.4,
      },
    });

    handoff
      // Fades across the *whole* sticky range rather than clearing early. An
      // early finish leaves a stretch of scroll where the hero has emptied but
      // the next act can't arrive yet — the section is still stuck — and that
      // gap is what makes a scrollytelling page feel like it has dead scroll in
      // it. Ending exactly at the release means there is never a held blank.
      .to(content, { y: -80, opacity: 0, filter: 'blur(6px)', duration: 1 }, 0)
      // The particle field thins out but doesn't go to zero. A sticky section
      // that empties completely spends its exit sliding a blank rectangle up the
      // screen; keeping a trace means the hero is still *something* while the
      // next act arrives underneath it. (The fluid wallpaper is no longer part
      // of this timeline — it sits behind every act now and runs its own scroll
      // response, so the hero releasing must not switch it off.)
      .to(field, { opacity: 0.4, duration: 1 }, 0)
      // The cue has done its job the instant you start scrolling; holding it any
      // longer is the interface talking over itself.
      .to(cue, { opacity: 0, duration: 0.08 }, 0);

    return () => {
      entrance.kill();
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
              sheet instead of a slogan. */}
          <p className="hero-roles hero-intro">
            <span>[ AI Engineer ]</span>
            <span>[ Product Designer ]</span>
            <span>[ Terminal Enthusiast ]</span>
          </p>
          <h1 className="hero-intro">
            Systems that think,
            <br />
            tools that work.
          </h1>
          <p className="lede hero-intro">
            Atta Ur Rehman — AI &amp; full-stack developer building agentic workflows,
            retrieval that preserves context, and the interfaces that make all of it
            usable. Engineering and design as one job, mostly done from a terminal.
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
