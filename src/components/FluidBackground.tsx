import { useEffect, useRef } from 'react';
import { fluidBackground, type FluidBgHandle } from 'fluid-bg/core';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

/**
 * The living wallpaper — one Fluid piece behind the entire site.
 *
 * This replaces an exported mp4 of the same artwork. The video was a recording
 * of a generative system: an 8s loop, h264 banding across the gradients, and a
 * visible seam every time it wrapped. Running the engine means it never repeats
 * and never bands.
 *
 * Three decisions here are load-bearing.
 *
 * 1. A still of the piece paints first, from CSS, with no JavaScript involved
 *    (see .fluid-layer). The page therefore looks finished on the first frame,
 *    and if the live layer never arrives the fallback is the same artwork rather
 *    than an empty rectangle.
 *
 * 2. `mode: 'iframe'`, not the default native canvas. Measured on this project's
 *    own hardware (Intel HD 630 / ANGLE D3D11), compiling the engine's shader
 *    blocks the main thread for ~11.5s on a cold shader cache — 53ms once Chrome
 *    has cached it, but that first visit is a completely frozen tab, which is
 *    every recruiter opening the link for the first time. In iframe mode the
 *    compile happens in the embed's own renderer process, so the host page never
 *    gives up a frame: scroll, the GSAP timelines and the R3F constellation all
 *    keep running while it warms up. The cost is a few seconds of poster instead
 *    of live art on a cold cache, which is a much cheaper thing to spend.
 *
 * 3. `dimColor` is --ink, not black. Darkening toward the page's own charcoal
 *    keeps the piece in the palette; darkening toward #000 greys it out and the
 *    mint goes muddy. The poster is pre-dimmed by the same amount so the two
 *    layers match through the crossfade.
 *
 * The hash's own colours (#73D4AB, #EDFCF2) land almost exactly on --glow and
 * --paper, so unlike the video this needs no hue correction — only a brightness
 * ceiling, which `dim` and the scroll-scrubbed opacity below provide.
 */

/** Engine Bloom · MINT · Möbius. The embed flag is added by the package. */
const HASH =
  '#p=0.55,1.7,6,0.02,1,17,0,8,22.65,0.8,0.85,1,0,0,13,0,0,0,0,0,8421504,2059865,7591083,15596786,0,2,5,50,0,3,86';

/** Dim strength, kept next to the value baked into public/fluid-poster.jpg. */
const DIM = 0.46;

export function FluidBackground() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduced = prefersReducedMotion();

    // Nothing is mounted at all under reduced motion — not a paused engine, an
    // absent one. The poster is a real frame of the same piece, so the layer
    // still carries the page's only colour, at zero runtime cost.
    let handle: FluidBgHandle | null = null;
    let reveal: number | undefined;

    if (!reduced) {
      try {
        handle = fluidBackground(host, {
          mode: 'iframe',
          hash: HASH,
          // Enough to read as depth of field rather than as a texture competing
          // with the type. The embed over-scans, so no soft edge shows.
          blur: 14,
          dim: DIM,
          dimColor: '#12110f',
        });
      } catch {
        handle = null;
      }
    }

    const frame = handle?.el.querySelector('iframe');
    if (frame) {
      // `load` fires when the embed's document is ready, which is before its
      // first painted frame. The settle delay is what stops the crossfade
      // handing the poster over to a blank rectangle.
      const onLoad = () => {
        reveal = window.setTimeout(() => {
          host.dataset.live = 'true';
        }, 900);
      };
      frame.addEventListener('load', onLoad, { once: true });
    }

    // The layer owns its own scroll response rather than being driven by the
    // hero's timeline. It outlives the hero — it is behind every section — so
    // tying its opacity to one act's lifecycle would mean the wallpaper
    // switching off the moment that act released.
    let settle: ScrollTrigger | null = null;
    if (!reduced) {
      settle = ScrollTrigger.create({
        start: 0,
        end: () => window.innerHeight * 0.9,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          // Brightest under the hero, where it is the subject; easing to a
          // steady ambient level everywhere else, where it is the room.
          gsap.set(host, { '--fluid-opacity': 1 - self.progress * 0.52 });
        },
      });
    }

    return () => {
      window.clearTimeout(reveal);
      settle?.kill();
      handle?.destroy();
      delete host.dataset.live;
    };
  }, []);

  return <div className="fluid-layer" ref={hostRef} aria-hidden />;
}
