import { prefersReducedMotion } from '../hooks/useReducedMotion';

type Role = {
  title: string;
  blurb: string;
  marks: string[];
};

/**
 * Three ways I build — but not three equal ones. The first two rows are two
 * surfaces of one practice: the system, then the interface that finishes it.
 * The third is not a skill category at all. It is how the person doing the
 * first two thinks, and it is written to sound like it — a stated belief
 * rather than a capabilities list.
 *
 * The marks follow the same rule. Rows one and two name concepts, not tools,
 * because the stack act already carries the tool names and a second list of
 * them here is a résumé, not a person. Row three names values.
 */
const ROLES: Role[] = [
  {
    title: 'AI systems, end to end',
    blurb:
      'The core of the work. Agents that use tools and recover when a tool lies to them. Retrieval that keeps enough context to be worth citing. Evaluation honest enough to tell me when the model is wrong. Built to hold up in production, not in a notebook.',
    marks: ['agentic systems', 'retrieval', 'evaluation'],
  },
  {
    title: 'The interfaces around them',
    blurb:
      'Not a separate job — the same one, finished. A model becomes a product at the interface, so the flow, the empty state and the failure copy get designed before the endpoint gets written. That is the part a person actually experiences as the system being good.',
    marks: ['flows', 'failure states', 'motion'],
  },
  {
    title: 'How I think',
    blurb:
      'Somewhere along the way this stopped being a preference. If I cannot see inside a system, I do not trust it — so I work in the one interface that never hides anything: plain text, everything inspectable, everything scriptable. It is not nostalgia. A tool you can take apart is a tool you can rely on, and that belief runs through every system above.',
    marks: ['nothing hidden', 'everything inspectable', 'small tools'],
  },
];

/**
 * Act three-and-a-half: how the work is actually done, as three numbered rows.
 *
 * A list, not cards. Cards would put three equal boxes side by side and ask the
 * reader to compare them; the first two rows are not alternatives to weigh but
 * two surfaces of one practice, and the third is not a skill at all. A stack of
 * rules-and-rows is how a résumé, a changelog and a man page all say "read me
 * top to bottom".
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
