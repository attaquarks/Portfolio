import { IconBrandGithub, IconBrandLinkedin, IconMail } from '@tabler/icons-react';
import type { ReactNode } from 'react';

type Channel = {
  label: string;
  handle: string;
  href: string;
  icon: ReactNode;
};

/* Tabler, at one size and one stroke weight, because the dock is already drawn
   in it — a second icon family in the same palette reads as an inconsistency
   long before anyone can name which set each mark came from. `stroke={1.5}`
   matches the line weight of the rules these rows sit on. */
const CHANNELS: Channel[] = [
  {
    label: 'Email',
    handle: 'attaworkplace@gmail.com',
    href: 'mailto:attaworkplace@gmail.com',
    icon: <IconMail size={20} stroke={1.5} />,
  },
  {
    label: 'LinkedIn',
    handle: 'in/attaurrehmann',
    href: 'https://www.linkedin.com/in/attaurrehmann/',
    icon: <IconBrandLinkedin size={20} stroke={1.5} />,
  },
  {
    label: 'GitHub',
    handle: 'attaquarks',
    href: 'https://github.com/attaquarks',
    icon: <IconBrandGithub size={20} stroke={1.5} />,
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
 *
 * Email leads. It is the only channel here that reaches a person directly rather
 * than through a platform's notifications, so it is the one a hiring manager
 * should land on first.
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
            <a
              className="channel-row"
              href={c.href}
              {...(c.href.startsWith('mailto:')
                ? {}
                : { target: '_blank', rel: 'noreferrer' })}
            >
              <span className="channel-icon" aria-hidden>
                {c.icon}
              </span>
              <span className="channel-label">{c.label}</span>
              <span className="channel-handle" data-literal={c.href.startsWith('mailto:') || undefined}>
                {c.handle}
              </span>
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
