import { lazy, Suspense } from 'react';
import { useSmoothScroll } from './hooks/useSmoothScroll';
import { useScrollReveal, useScrollTriggerRefresh } from './hooks/useScrollReveal';
import { FluidBackground } from './components/FluidBackground';
import { HeroScene } from './components/HeroScene';
import { ScrollSpine } from './components/ScrollSpine';
import { StatusRail } from './components/StatusRail';
import { SiteDock } from './components/SiteDock';
import { StackTerminal } from './components/StackTerminal';
import { ProjectField } from './components/ProjectField';
import { ApproachSection } from './components/ApproachSection';
import { AboutStage } from './components/AboutStage';
import { ContactSection } from './components/ContactSection';
import { projects } from './data/projects';

/**
 * three + R3F + drei is the single heaviest thing on the page, and it belongs to
 * act three. Loading it eagerly means the hero waits on a scene nobody can see
 * yet. Split out, it streams in during the hero and stack, and because the
 * constellation contributes no layout height there is nothing to shift when it
 * arrives.
 */
const ProjectConstellation = lazy(() =>
  import('./components/ProjectConstellation').then((m) => ({ default: m.ProjectConstellation }))
);

/**
 * Six movements on one continuous scroll.
 *
 * 001 stack    — sticky, scroll position is the playhead for the terminal
 * 002 projects — a camera flies a path through the constellation behind the cards
 * 003 approach — the three roles, as numbered rows
 * 004 about    — sticky; the portrait resolves out of blocks, then the copy lands on it
 * 005 contact  — where to find me
 *
 * (The hero is unnumbered on purpose: it's the title card, not a chapter.)
 *
 * The `.act` wrappers are tall containers holding `position: sticky` children,
 * rather than GSAP `pin: true`. Sticky needs no pin-spacer, so there's no
 * injected layout to keep in sync with Lenis, and reduced motion collapses the
 * whole structure back to normal flow with two CSS rules.
 */
export default function App() {
  useSmoothScroll();
  useScrollTriggerRefresh();
  useScrollReveal();

  return (
    <>
      {/* Outside <main> on purpose. It is the room the acts happen in, not one
          of them — a fixed layer at z-index 0 with the content lifted above it. */}
      <FluidBackground />
      <StatusRail />
      <ScrollSpine />
      <SiteDock />

      <main>
        <HeroScene />

        {/* The anchor lives on the wrapper, not the sticky section: a sticky
            element's box moves under you, so it's a moving scroll target. */}
        <div className="act act-stack" id="stack">
          <section className="stack-section">
            <div className="section-inner">
              <div className="kicker">
                <span className="kicker-index">001</span>
                <span>how it&rsquo;s built</span>
              </div>
              <h2 className="section-title">The stack behind the agents</h2>
              <StackTerminal />
            </div>
          </section>
        </div>

        {/* Outside #projects, and that placement is the whole point: a sticky
            element only sticks for as long as its parent's box lasts, so
            declared inside the projects section the constellation stopped dead
            at that section's edge. As a direct child of <main> it stays pinned
            from here to the bottom of the page, and the camera keeps travelling
            behind the approach rows, the portrait stage and the sign-off.
            It still contributes no height of its own — the -100svh margin in
            its rule pulls the next section back up over it. */}
        <Suspense fallback={null}>
          <ProjectConstellation count={projects.length} />
        </Suspense>

        <section id="projects">
          <div className="section-inner">
            <div className="kicker" data-reveal>
              <span className="kicker-index">002</span>
              <span>shipped work</span>
            </div>
            <h2 className="section-title" data-reveal>
              Projects that actually run
            </h2>
            <ProjectField />
          </div>
        </section>

        <section id="approach">
          <div className="section-inner">
            <div className="kicker" data-reveal>
              <span className="kicker-index">003</span>
              <span>how I work</span>
            </div>
            <h2 className="section-title" data-reveal>
              Three jobs, one person
            </h2>
            {/* The story in one line, before the three rows prove it. The hero
                states the roles; this is the sentence that explains why they
                are one person rather than three, which is the thing a reader
                scanning for a hire is actually trying to work out. */}
            <p className="lede" data-reveal>
              I build intelligent systems, design the products around them, and
              engineer them into real software.
            </p>
            <ApproachSection />
          </div>
        </section>

        <AboutStage />

        <section id="contact">
          <div className="section-inner">
            <div className="kicker" data-reveal>
              <span className="kicker-index">005</span>
              <span>get in touch</span>
            </div>
            <h2 className="section-title" data-reveal>
              Let&rsquo;s build something that ships
            </h2>
            <ContactSection />
          </div>
        </section>

        <footer>
          <span>© {new Date().getFullYear()} Atta Ur Rehman</span>
          <span className="footer-links">
            <a href="https://github.com/attaquarks" target="_blank" rel="noreferrer">
              github.com/attaquarks
            </a>
            <a href="https://www.linkedin.com/in/attaurrehmann/" target="_blank" rel="noreferrer">
              linkedin
            </a>
          </span>
        </footer>
      </main>
    </>
  );
}
