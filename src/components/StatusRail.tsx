import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

/** Where the work happens, regardless of where the client is. */
const TZ = 'Asia/Karachi';

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * A hairline rail across the top: where I am, what time it is here, and how far
 * down the page you've come.
 *
 * It exists because a long scroll-driven site needs to tell you two things it
 * otherwise hides — that there is a person on the other end of it, and how much
 * of it is left. The clock does the first job better than the sentence "based in
 * Pakistan" does, because it is *running*: it says someone is awake there right
 * now. The percentage does the second, and it's the numeric partner to the spine
 * on the left edge.
 *
 * Departure Mono is the right face for exactly this and nothing longer — a
 * pixel-grid design reads as instrumentation at label size and as a novelty at
 * paragraph size.
 */
export function StatusRail() {
  const ref = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const [time, setTime] = useState(() => clock.format(new Date()));

  useEffect(() => {
    // One second, aligned to nothing in particular — a readout that ticks is the
    // whole point, and a drifting second is invisible.
    const id = window.setInterval(() => setTime(clock.format(new Date())), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const pct = pctRef.current;
    if (!pct) return;

    // Written straight to textContent rather than through state: this updates on
    // every scrolled frame, and re-rendering React 60 times a second to change
    // two digits is the kind of thing that shows up as jank in the acts around
    // it. The rail is the only owner of this node, so there's nothing to fight.
    if (prefersReducedMotion()) {
      pct.textContent = '000';
      return;
    }

    const trigger = ScrollTrigger.create({
      start: 0,
      end: 'max',
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        pct.textContent = String(Math.round(self.progress * 100)).padStart(3, '0');
      },
    });

    return () => trigger.kill();
  }, []);

  return (
    <div className="status-rail" ref={ref}>
      <span className="status-rail-where">
        [ Based in Pakistan &mdash; working globally ]
      </span>
      <span className="status-rail-meters">
        <span className="status-rail-clock">
          <span className="status-rail-pip" aria-hidden />
          {/* aria-hidden and not a <time>: this is ambient furniture, and a
              screen reader announcing a ticking clock every second is a
              hostile way to read a portfolio. */}
          <span aria-hidden>PKT {time}</span>
        </span>
        <span className="status-rail-scroll" aria-hidden>
          <span ref={pctRef}>000</span>%
        </span>
      </span>
    </div>
  );
}
