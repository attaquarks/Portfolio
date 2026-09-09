import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { projects } from '../data/projects';
import { CardContainer, CardBody, CardItem } from './ui/3d-card';
import { GlowingEffect } from './ui/glowing-effect';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

/**
 * The project grid, revealed on a scroll-scrubbed timeline.
 *
 * What replaced what: the old version scattered cards to random offsets and
 * played a one-shot settle on enter. Random was the problem — the motion carried
 * no meaning, and `toggleActions` meant it fired on its own clock. This is
 * scrubbed, so the reveal is genuinely tied to scroll position and reverses
 * cleanly.
 *
 * It also deliberately *completes early* — the range ends while the grid is still
 * entering the viewport. Scrubbing decoration is good; scrubbing the opacity of
 * text someone is trying to read means a reader who stops mid-scroll is left with
 * a half-faded card, so the animation gets out of the way before the reading
 * starts.
 *
 * No blur in this tween on purpose: five simultaneously blurred cards is five
 * offscreen renders per scrubbed frame, and this section is already carrying a
 * WebGL canvas.
 */
export function ProjectField() {
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const cards = field.querySelectorAll<HTMLElement>('.project-reveal');

    if (prefersReducedMotion()) {
      gsap.set(cards, { y: 0, opacity: 1 });
      return;
    }

    const tween = gsap.fromTo(
      cards,
      { y: 44, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        ease: 'none',
        stagger: 0.14,
        scrollTrigger: {
          trigger: field,
          start: 'top 90%',
          end: 'top 38%',
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
    <div className="project-field" ref={fieldRef}>
      {projects.map((p) => (
        <div key={p.name} className="project-reveal">
          <CardContainer>
            <CardBody className="project-card">
              {/* Sits inside CardBody rather than beside CardContainer so it
                  inherits the tilt — a flat glowing border around a card that
                  is visibly rotating looks broken. */}
              <GlowingEffect
                disabled={false}
                glow
                blur={0}
                spread={34}
                proximity={72}
                inactiveZone={0.5}
                borderWidth={1}
              />
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="project-card-link"
              >
                <CardItem translateZ={40}>
                  <span className="tag">{p.tag}</span>
                  <h3>{p.name}</h3>
                </CardItem>
                <CardItem translateZ={20}>
                  <p>{p.description}</p>
                </CardItem>
                <CardItem translateZ={30} className="stack">
                  {p.stack.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </CardItem>
              </a>
            </CardBody>
          </CardContainer>
        </div>
      ))}
    </div>
  );
}
