type Channel = {
  label: string;
  handle: string;
  href: string;
};

const CHANNELS: Channel[] = [
  {
    label: 'LinkedIn',
    handle: 'in/attaurrehmann',
    href: 'https://www.linkedin.com/in/attaurrehmann/',
  },
  {
    label: 'GitHub',
    handle: 'attaquarks',
    href: 'https://github.com/attaquarks',
  },
];

/**
 * The last act, and the only one asking for something.
 *
 * Rows, not buttons. A portfolio's ending is the one place where the reader has
 * already decided; what they need is the address, at a size they can hit without
 * aiming, not a call to action styled to persuade them. Each row is the whole
 * width of the column and states the handle plainly, so it reads as contact
 * details rather than marketing.
 */
export function ContactSection() {
  return (
    <div className="contact-block">
      <p className="availability" data-reveal>
        <span className="availability-pip" aria-hidden />
        <span>Available for work &mdash; open to AI engineering roles</span>
      </p>

      <ul className="channel-list">
        {CHANNELS.map((c) => (
          <li key={c.label} data-reveal>
            <a className="channel-row" href={c.href} target="_blank" rel="noreferrer">
              <span className="channel-label">{c.label}</span>
              <span className="channel-handle">{c.handle}</span>
              <span className="channel-arrow" aria-hidden>
                &rarr;
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
