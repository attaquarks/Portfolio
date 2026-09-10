import { prefersReducedMotion } from '../hooks/useReducedMotion';

type Role = {
  title: string;
  blurb: string;
  marks: string[];
};

/**
 * Three roles, in the order they show up in a project: the model gets built, the
 * product gets shaped around it, and the whole thing gets driven from a shell.
 */
const ROLES: Role[] = [
  {
    title: 'AI Engineer',
    blurb:
      'Agentic systems that use tools and recover when a tool lies to them, retrieval that keeps enough context to be worth citing, and evaluation honest enough to tell me when the model is wrong. Production paths, not notebooks.',
    marks: ['LangGraph', 'RAG + evals', 'FastAPI', 'PyTorch'],
  },
  {
    title: 'Product Designer',
    blurb:
      'A model only becomes a product at the interface. I design the flow, the empty state and the failure copy before I write the endpoint, because those are the parts a user actually experiences as the system being good.',
    marks: ['Interface systems', 'Motion', 'Design tokens', 'Prototyping'],
  },
  {
    title: 'Terminal enthusiast',
    blurb:
      'Nearly all of this was built in a shell, and it shows in the work: small composable tools, everything scriptable, state you can inspect. A good CLI is the same discipline as a good API with the ceremony removed.',
    marks: ['zsh', 'tmux', 'Docker', 'Makefiles'],
  },
];

/**
 * Act three-and-a-half: what I actually do, as three numbered rows.
 *
 * A list, not cards. Cards would put three equal boxes side by side and ask the
 * reader to compare them; these are not alternatives to weigh, they're one
 * person read top to bottom, and a stack of rules-and-rows is how a résumé, a
 * changelog and a man page all say that.
 *
 * The reveal is the shared `data-reveal` scrub rather than a bespoke timeline —
 * this is reading material, and it earns no choreography of its own.
 */
export function ApproachSection() {
  // Only used to skip the per-row transition delay; the reveal itself is
  // handled by useScrollReveal, which already respects the same preference.
  const reduced = prefersReducedMotion();

  return (
    <ol className="role-list">
      {ROLES.map((role, i) => (
        <li className="role-row" key={role.title} data-reveal>
          <span className="role-index">{String(i + 1).padStart(3, '0')}</span>
          <div className="role-body">
            <h3 className="role-title">{role.title}</h3>
            <p className="role-blurb">{role.blurb}</p>
          </div>
          <ul className="role-marks">
            {role.marks.map((mark, j) => (
              <li
                key={mark}
                style={reduced ? undefined : { transitionDelay: `${j * 40}ms` }}
              >
                {mark}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
