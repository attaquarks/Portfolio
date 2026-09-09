import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

/**
 * The terminal boot line. Typing is the one place on this page where a
 * character-by-character effect earns its keep — it's the hero's opening beat,
 * seen once per visit, and it sets the machine-log voice the rest of the page
 * speaks in.
 */
export function BootLine({ lines, speed = 28 }: { lines: string[]; speed?: number }) {
  const reduced = prefersReducedMotion();
  // Under reduced motion the resting state is the destination, not the journey:
  // the final line, present immediately, with no interval running behind it.
  const [display, setDisplay] = useState(() => (reduced ? lines[lines.length - 1] ?? '' : ''));
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    if (reduced) return;
    if (lineIndex >= lines.length) return;
    const full = lines[lineIndex];
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplay(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(id);
        setTimeout(() => setLineIndex((v) => v + 1), 500);
      }
    }, speed);
    return () => clearInterval(id);
  }, [lineIndex, lines, speed, reduced]);

  return (
    <div className="hero-eyebrow">
      {display}
      <span className="cursor">&nbsp;</span>
    </div>
  );
}
