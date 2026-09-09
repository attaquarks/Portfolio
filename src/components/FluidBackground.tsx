import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

const SRC = '/fluid-bg.mp4';
const POSTER = '/fluid-bg.jpg';

/**
 * Atmosphere layer for the hero — the Fluid export (Bloom · MINT · Möbius 0.86)
 * treated as a light source rather than a wallpaper.
 *
 * Every frame of that loop is a near-white mint bloom with a hard black lens
 * edge, so full-bleed at any readable opacity would flatten the warm-charcoal
 * identity and wreck text contrast. Instead the video is over-scaled so the lens
 * edge sits off-canvas, blurred (which also hides h264 gradient banding),
 * desaturated and hue-shifted toward --glow, radially masked so the bloom never
 * reaches the text column, and composited with `screen` onto --ink so it reads
 * as emitted light on charcoal. All of that lives in .fluid-* in styles.css;
 * this component only owns playback.
 *
 * Opacity is exposed as --fluid-opacity so the hero's scroll timeline can scrub
 * the whole layer out as you leave the section.
 */
export function FluidBackground({ className = '' }: { className?: string }) {
  const reduced = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reduced) return;

    // The source is a short palindrome loop; half speed turns an 8s drift into a
    // 16s one, which reads as atmosphere instead of as a playing video.
    video.playbackRate = 0.55;
    video.play().catch(() => {
      /* autoplay refused — the poster frame is already showing, so this is fine */
    });

    // Decoding a 1440-wide video that nobody can see is pure battery cost.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.01 }
    );
    observer.observe(video);

    return () => observer.disconnect();
  }, [reduced]);

  return (
    <div className={`fluid-layer ${className}`} aria-hidden>
      {reduced ? (
        <img className="fluid-media" src={POSTER} alt="" />
      ) : (
        <video
          ref={videoRef}
          className="fluid-media"
          src={SRC}
          poster={POSTER}
          muted
          loop
          playsInline
          preload="metadata"
        />
      )}
      <div className="fluid-scrim" />
    </div>
  );
}
