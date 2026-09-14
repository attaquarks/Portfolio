import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

/* A session, not an inventory. The old buffer listed every framework I had
   ever touched, which read as a résumé wearing a costume. This one answers
   five questions in the order a person would actually ask them — who, what,
   how, where, why — and names tools only where they answer "how", at the
   resolution a choice actually gets made at. The last line is the point of
   the whole section; everything above it is setup. */
const COMMANDS: { cmd: string; out: string }[] = [
  { cmd: 'whoami', out: 'someone who builds AI systems end to end' },
  { cmd: 'cat what.txt', out: 'tool-using agents · retrieval that keeps its context · evaluation that can say no' },
  { cmd: 'cat how.txt', out: 'Python + FastAPI underneath · React + TypeScript on top · Docker around it' },
  { cmd: 'cat where.txt', out: 'healthcare and productivity — the places people actually depend on software' },
  { cmd: 'cat why.txt', out: 'a model nobody can use is a demo. the interface is where it becomes a product.' },
];

/**
 * The stack, typed out by scroll position rather than by a timer.
 *
 * The old version fired a setInterval on intersection, which meant the animation
 * ran on its own clock: scroll past quickly and you missed it, scroll back and
 * nothing happened. Here the section is sticky for an extra viewport of scroll
 * and progress through that range *is* the playhead — you can hold mid-command,
 * reverse it, or scrub it, because there's no clock to be out of step with.
 *
 * Each line is revealed with clip-path from the left, which is what typing
 * actually looks like, composites on the GPU, and needs no per-character DOM.
 */
export function StackTerminal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const terminal = ref.current;
    if (!terminal) return;

    const blocks = Array.from(terminal.querySelectorAll<HTMLElement>('.terminal-block'));
    const reveals = terminal.querySelectorAll<HTMLElement>('.terminal-reveal');
    const prompts = terminal.querySelectorAll<HTMLElement>('.prompt');

    // No scroll driver means no playhead. Print the whole buffer and be done.
    if (prefersReducedMotion()) {
      gsap.set(reveals, { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 });
      gsap.set(prompts, { opacity: 1 });
      return;
    }

    const act = terminal.closest('.act');
    if (!act) return;

    gsap.set(reveals, { clipPath: 'inset(0% 100% 0% 0%)' });
    gsap.set(terminal.querySelectorAll('.terminal-line.out .terminal-reveal'), { opacity: 0 });
    gsap.set(prompts, { opacity: 0.22 });

    const timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: act,
        // Starts while the section is still rising into place, not once it has
        // topped out. Waiting for `top top` meant a full viewport of scroll spent
        // looking at an empty panel of dim prompts — which reads as broken rather
        // than as anticipation. By the time the section settles there are already
        // a couple of commands in the buffer.
        start: 'top 40%',
        end: 'bottom bottom',
        scrub: 0.45,
      },
    });

    blocks.forEach((block) => {
      const prompt = block.querySelector('.prompt');
      const command = block.querySelector('.terminal-line:not(.out) .terminal-reveal');
      const output = block.querySelector('.terminal-line.out .terminal-reveal');

      timeline
        .to(prompt, { opacity: 1, duration: 0.06 })
        .to(command, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.5 })
        .to(output, { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1, duration: 0.4 }, '+=0.06')
        // A held beat between commands, so it reads as a session rather than a
        // single continuous wipe.
        .to({}, { duration: 0.2 });
    });

    // A hold on the finished buffer before the section unsticks. Without it the
    // last output lands on the same frame the whole section starts sliding away,
    // and the one thing the reader actually came for never sits still.
    timeline.to({}, { duration: 0.7 });

    return () => {
      timeline.scrollTrigger?.kill();
      timeline.kill();
    };
  }, []);

  return (
    <div className="terminal" ref={ref}>
      <div className="terminal-bar">
        <span className="terminal-dot" />
        <span className="terminal-dot" />
        <span className="terminal-dot" />
        <span className="terminal-title mono">attaquarks — zsh</span>
      </div>
      <div className="terminal-body">
        {COMMANDS.map((c) => (
          <div className="terminal-block" key={c.cmd}>
            <p className="terminal-line">
              <span className="prompt">$</span>
              <span className="terminal-reveal">{c.cmd}</span>
            </p>
            <p className="terminal-line out">
              <span className="terminal-reveal">{c.out}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
