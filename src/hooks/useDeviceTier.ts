import { useEffect, useState } from 'react';

/**
 * What kind of machine is drawing this page.
 *
 * The site has exactly one rendering strategy and it was written for a desktop:
 * two full-viewport WebGL surfaces, a fixed wallpaper, a stack of composited
 * layers, and scroll-driven timelines that assume a frame budget where a dropped
 * frame is rare. A phone has a fraction of that budget and, on the low end, a
 * fraction of a fraction. What a phone needs is not a different design but the
 * same design at a lower resolution and a lower duty cycle.
 *
 * This is deliberately *not* `prefers-reduced-motion`. That preference is a
 * statement about the person, and it is answered by not animating at all. A
 * phone is a statement about the hardware, and it is answered by animating the
 * same way more cheaply. Conflating them would mean every phone user gets the
 * reduced-motion page, which throws away the whole hero for no reason — and
 * every reduced-motion user gets a version that still spends GPU, which is the
 * opposite of what they asked for. The two decisions stay separate and can both
 * be true.
 */
export interface Capability {
  /**
   * The phone/tablet class: a coarse pointer, or a viewport narrower than the
   * narrowest desktop layout the site was designed against.
   */
  mobile: boolean;
  /**
   * `mobile` and additionally showing signs of a weak chip — few cores, little
   * memory, or both. Most phones are not this. A phone that is this needs the
   * constellation to be genuinely small rather than merely trimmed.
   */
  lowPower: boolean;
}

/** Below this, the desktop layout has already given up its gutters. */
const NARROW = 768;

/**
 * Resolved once and kept. Deliberately not reactive.
 *
 * Every consumer of this is a WebGL renderer that would have to tear down its
 * context, rebuild its programs and re-measure to change tier — and an
 * orientation change reports a new width and a new DPR without the device
 * having changed at all. Recomputing here would turn rotating a phone into a
 * shader recompile, mid-scroll, which is the one moment it must not happen. The
 * device is decided once, on first read, and stays decided for the session.
 */
let cached: Capability | null = null;

function compute(): Capability {
  if (typeof window === 'undefined') return { mobile: false, lowPower: false };

  // The harness and a real phone both hit this; `?tier=mobile|desktop` is the
  // override, so the mobile path can be exercised on a desktop GPU without
  // pretending the whole browser is a phone.
  const forced = new URLSearchParams(window.location.search).get('tier');
  if (forced === 'mobile' || forced === 'desktop') {
    return { mobile: forced === 'mobile', lowPower: false };
  }

  // `pointer: coarse` is the honest signal — it is about the input device
  // rather than about how wide the window happens to be, so a phone in
  // landscape and a desktop window dragged narrow are told apart correctly.
  // The width check is the fallback for browsers that answer 'none' or nothing.
  const coarse =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const mobile = coarse || window.innerWidth < NARROW;

  // Both are non-standard-ish and both are opt-out-able by the browser, so the
  // fallbacks are the optimistic ones: an engine that will not say how many
  // cores it has does not get treated as a weak device on that basis alone.
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory =
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;

  return { mobile, lowPower: mobile && (cores <= 4 || memory <= 4) };
}

/** Synchronous read, for effect bodies that must not wait for a re-render. */
export function readCapability(): Capability {
  if (!cached) cached = compute();
  return cached;
}

export function useCapability(): Capability {
  const [cap] = useState(readCapability);
  return cap;
}

/** Test seam: forget the cached decision. Not called by the app. */
export function resetCapabilityCache() {
  cached = null;
}

let webgl: boolean | null = null;

/**
 * Whether this device will hand the page a WebGL context at all.
 *
 * A phone can refuse and it is not an exotic case: a blocklisted driver on an
 * older handset, hardware acceleration switched off, a battery-saver mode that
 * revokes GL, a browser configured not to allow it, a locked-down or virtualised
 * environment. When it happens, three.js throws from inside R3F's own setup —
 * `WebGLRenderer: Error creating WebGL context` — and that throw is *not*
 * catchable by a React error boundary. Measured, not assumed: a boundary wrapped
 * around the canvas did not fire, and both exceptions still reached the console
 * as uncaught.
 *
 * So the question is asked before the mount instead of being recovered from
 * after it. That is only safe because the probe is sound rather than a guess:
 * it makes the same call R3F is about to make, on the same kind of canvas, so a
 * "no" here is the same "no" three would have got. It can still be wrong in the
 * other direction — a device that answers "yes" and then fails to allocate — but
 * never in the direction that costs a working device its constellation. The
 * context is released immediately; a probe that held one would spend the exact
 * resource it is testing for.
 */
export function hasWebGL(): boolean {
  if (webgl !== null) return webgl;
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ||
      canvas.getContext('webgl')) as WebGLRenderingContext | null;
    webgl = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

/**
 * Stays subscribed to the pointer query but never changes tier from it — the
 * subscription exists so that a device which reports `coarse` late (some
 * emulators answer 'none' for the first frames) still lands on the mobile path
 * before anything expensive is created, rather than after.
 */
export function useCapabilitySettled(): Capability {
  const [cap, setCap] = useState(readCapability);

  useEffect(() => {
    if (cached?.mobile) return;
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(pointer: coarse)');
    if (mql.matches) {
      cached = compute();
      setCap(cached);
      return;
    }
    const onChange = () => {
      cached = compute();
      setCap(cached);
    };
    mql.addEventListener('change', onChange, { once: true });
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return cap;
}
