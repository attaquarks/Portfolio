import { lazy, Suspense } from 'react';
import { useSmoothScroll } from './hooks/useSmoothScroll';
import { useScrollReveal, useScrollTriggerRefresh } from './hooks/useScrollReveal';
import { HeroScene } from './components/HeroScene';
import { ScrollSpine } from './components/ScrollSpine';
import { SiteDock } from './components/SiteDock';
import { StackTerminal } from './components/StackTerminal';
import { ProjectField } from './components/ProjectField';
import { AsciiPortrait } from './components/AsciiPortrait';
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
 * Four acts on one continuous scroll.
 *
 * 1. hero    — sticky, hands itself off (content recedes, atmosphere pulls back)
 * 2. stack   — sticky, scroll position is the playhead for the terminal
 * 3. projects — a camera flies a path through the constellation behind the cards
 * 4. about   — the ASCII portrait wipes in
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
      <ScrollSpine />
      <SiteDock />

      <main>
        <HeroScene />

        {/* The anchor lives on the wrapper, not the sticky section: a sticky
            element's box moves under you, so it's a moving scroll target. */}
        <div className="act act-stack" id="stack">
          <section className="stack-section">
            <div className="section-inner">
              <div className="kicker">01 — how it&rsquo;s built</div>
              <h2 className="section-title">The stack behind the agents</h2>
              <StackTerminal />
            </div>
          </section>
        </div>

        <section id="projects">
          {/* No fallback: it's background, and an empty box is the correct
              placeholder for something that has no layout footprint. */}
          <Suspense fallback={null}>
            <ProjectConstellation count={projects.length} />
          </Suspense>
          <div className="section-inner">
            <div className="kicker" data-reveal>
              02 — shipped work
            </div>
            <h2 className="section-title" data-reveal>
              Projects that actually run
            </h2>
            <ProjectField />
          </div>
        </section>

        <section id="about">
          <div className="section-inner">
            <div className="about-grid">
              <div className="about-copy">
                <div className="kicker" data-reveal>
                  03 — what I&rsquo;m looking for
                </div>
                <h2 className="section-title" data-reveal>
                  Building agents that solve real workflow problems
                </h2>
                <p className="lede" data-reveal>
                  RAG systems with strong evaluation, healthcare and productivity tools, and
                  full-stack AI products that combine good engineering with thoughtful UX. Based in
                  Pakistan, working with teams anywhere.
                </p>
              </div>
              <AsciiPortrait />
            </div>
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
