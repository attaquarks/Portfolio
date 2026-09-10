import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  IconBrandGithub,
  IconBrandLinkedin,
  IconFolders,
  IconMail,
  IconTerminal2,
  IconUser,
} from '@tabler/icons-react';
import { FloatingDock } from './ui/floating-dock';

gsap.registerPlugin(ScrollTrigger);

// Four destinations and two addresses. Approach is deliberately left out — it
// sits between Projects and About in the reading order, and a dock that lists
// every heading stops being navigation and becomes a table of contents.
const ITEMS = [
  { title: 'Stack', href: '#stack', icon: <IconTerminal2 className="dock-icon" /> },
  { title: 'Projects', href: '#projects', icon: <IconFolders className="dock-icon" /> },
  { title: 'About', href: '#about', icon: <IconUser className="dock-icon" /> },
  { title: 'Contact', href: '#contact', icon: <IconMail className="dock-icon" /> },
  {
    title: 'GitHub',
    href: 'https://github.com/attaquarks',
    icon: <IconBrandGithub className="dock-icon" />,
  },
  {
    title: 'LinkedIn',
    href: 'https://www.linkedin.com/in/attaurrehmann/',
    icon: <IconBrandLinkedin className="dock-icon" />,
  },
];

/**
 * Navigation, withheld until it's useful. The hero is meant to be the whole
 * first viewport, so the dock stays out of it and arrives once you've committed
 * to scrolling — then persists, because a long scroll-driven page without a way
 * back is hostile.
 *
 * Enter/exit is a CSS transition rather than a scrubbed tween: it's a binary
 * state, and transitions retarget mid-flight when you reverse direction across
 * the threshold, where a keyframe or a scrub would stutter.
 */
export function SiteDock() {
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trigger = ScrollTrigger.create({
      // Plain scroll offsets, not an element trigger: the threshold is "you have
      // committed to leaving the hero", which is a distance, not a boundary.
      start: () => window.innerHeight * 0.55,
      // A number past the end of any page, not 'max'. A trigger is active for
      // start <= scroll < end, so `end: 'max'` switches the dock off on the one
      // frame the reader is at the very bottom — which on mobile is the footer,
      // precisely where the only thing left to want is a way back up.
      end: 99999,
      invalidateOnRefresh: true,
      onToggle: (self) => setShown(self.isActive),
    });
    return () => trigger.kill();
  }, []);

  return (
    <div className="site-dock" data-shown={shown} ref={ref}>
      <FloatingDock
        items={ITEMS}
        desktopClassName="site-dock-desktop"
        mobileClassName="site-dock-mobile"
      />
    </div>
  );
}
