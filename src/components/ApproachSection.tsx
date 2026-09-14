import { prefersReducedMotion } from '../hooks/useReducedMotion';

type Role = {
  title: string;
  blurb: string;
  marks: string[];
};

/**
 * Three jobs, one person. This is the spine of the page: the hero claims three
 * roles in brackets, the projects show each one in the wild, and this act is
 * where the claim is cashed.
 *
 * The order is the order the work actually happens in — the system, the product
 * shaped around it, then the engineering that makes both real — which is also
 * why the third row is written last and sounds like it: it is the row that has
 * to carry production, not just capability.
 *
 * The marks are evidence, not decoration. Naming tools here is deliberate: a
 * job title with nothing under it is a title. The stack act lists the same
 * names in more detail, but a reader who stops at this section should still be
 * able to tell what I can be handed on a Monday.
 */
const ROLES: Role[] = [
  {
    title: 'AI Engineer',
    blurb:
      'Agentic systems that call tools, cope with one lying to them, and recover. Retrieval that keeps enough context to be worth citing. Multimodal pipelines that read images and text together — and evaluation strict enough to catch the model being wrong before a user does.',
    marks: ['LangGraph', 'RAG + evals', 'Multimodal', 'PyTorch'],
  },
  {
    title: 'Product Designer',
    blurb:
      'A model only becomes a product at the interface. I shape the flow, the states nobody plans for, and the words inside them, because that is the part a person experiences as the software being good. Interaction, motion, and the visual system holding it together.',
    marks: ['Interface systems', 'Motion', 'Design tokens', 'Prototyping'],
  },
  {
    title: 'Software Engineer',
    blurb:
      'Then I build it, and I ship it. React and TypeScript on the front, FastAPI and Postgres behind, the APIs, auth and integrations in between, and the containers and deploy path that put it in front of real users. Building the whole thing is what keeps the design honest.',
    marks: ['React + TypeScript', 'FastAPI', 'PostgreSQL', 'Docker'],
  },
];

/**
 * Act three: the three jobs, as numbered rows.
 *
 * A list, not cards. Cards would put three equal boxes side by side and ask the
 * reader to compare them; these are not alternatives to weigh but three layers
 * of one job, and the numbering plus the shared baseline reads as a sequence.
 * A stack of rules-and-rows is how a résumé, a changelog and a man page all say
 * "read me top to bottom".
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
