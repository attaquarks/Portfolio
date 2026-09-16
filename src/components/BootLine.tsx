import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

/**
 * How long a finished line is left to be read before it is replaced. Long
 * enough to actually read a 46-character line twice over, short enough that a
 * visitor who lands and waits still sees the second line inside the first ten
 * seconds.
 */
const HOLD_MS = 5600;

/**
 * The beat between one line clearing and the next one starting to type. Without
 * it the second line types straight over the first and the swap reads as a
 * rendering glitch; with it, the line clears, the cursor blinks in an empty
 * row, and the new line arrives — which is what a terminal actually does.
 */
const GAP_MS = 340;

/**
 * The terminal boot line, cycling between the two lines for as long as the page
 * is open.
 *
 * It used to type both lines once and stop on the second. That reads as a
 * loading sequence that has finished — which is the wrong thing for the one
 * piece of copy on the page that is *about* the machine being busy — and it
 * left a visitor who stayed in the hero looking at a frozen line. Cycling never
 * resolves, so the voice stays alive the whole time the hero is on screen.
 *
 * The hold is measured from the end of typing, not from the start: each line is
 * fully legible on screen for `hold` milliseconds before anything moves. With
 * the default speed that is a full sweep of about seven seconds per line.
 *
 * `lines` must be a stable reference (a module constant, as it is at the call
 * site) — it is in the dependency list, and a literal array would restart the
 * cycle on every render.
 */
export function BootLine({
  lines,
  speed = 28,
  hold = HOLD_MS,
}: {
  lines: string[];
  speed?: number;
  hold?: number;
}) {
  const reduced = prefersReducedMotion();
  // Under reduced motion the animation is dropped rather than slowed, so there
  // is no cycle to sit in the middle of: one line is chosen and left there. It
  // is the last one, because that is the line with something of a person in it
  // and a visitor who sees exactly one of them should see that one.
  const [display, setDisplay] = useState(() => (reduced ? lines[lines.length - 1] ?? '' : ''));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced || lines.length === 0) return;

    const full = lines[index % lines.length];
    let typed = 0;
    let holdId: number | undefined;
    let nextId: number | undefined;

    const typeId = window.setInterval(() => {
      typed++;
      setDisplay(full.slice(0, typed));
      if (typed < full.length) return;

      window.clearInterval(typeId);
      holdId = window.setTimeout(() => {
        setDisplay('');
        nextId = window.setTimeout(() => {
          setIndex((v) => (v + 1) % lines.length);
        }, GAP_MS);
      }, hold);
    }, speed);

    // All three timers are cleared on every path out. StrictMode's second effect
    // pass and an unmount mid-hold both land here, and a surviving interval
    // would go on typing into a component that is no longer mounted.
    return () => {
      window.clearInterval(typeId);
      window.clearTimeout(holdId);
      window.clearTimeout(nextId);
    };
  }, [index, lines, speed, hold, reduced]);

  return (
    <div className="hero-eyebrow">
      {display}
      <span className="cursor">&nbsp;</span>
    </div>
  );
}
