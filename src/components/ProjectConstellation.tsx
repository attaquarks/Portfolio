import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../hooks/useReducedMotion';

gsap.registerPlugin(ScrollTrigger);

/** Scroll progress through the projects section, written by ScrollTrigger and
 *  read inside useFrame. A ref rather than state on purpose: the camera has to
 *  move every frame, and re-rendering React 60 times a second to move a camera
 *  would be the most expensive way possible to do it. */
type Progress = { current: number };

function palette() {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;

  const glow = new THREE.Color(read('--glow', '#4fe8c4'));
  const amber = new THREE.Color(read('--amber', '#f2a65a'));
  const paper = new THREE.Color(read('--paper', '#edeae2'));

  // Three colours is this site's palette and it stays that way — but three
  // colours spread across twenty nodes is a legend, not a sky. These two are not
  // new hues; they are the ones already here, pushed apart: `ice` is the paper
  // warmed toward the glow, `cyan` is the glow pulled toward blue. Every star is
  // still recognisably from this page. What grew is the range they span, and a
  // wider range at the same brightness is what makes a field read as depth.
  return {
    glow,
    glowDim: new THREE.Color(read('--glow-dim', '#2c8f77')),
    amber,
    paper,
    ice: paper.clone().lerp(glow, 0.42),
    cyan: glow.clone().lerp(new THREE.Color('#79c7ff'), 0.42),
    ink: read('--ink', '#12110f'),
  };
}

/**
 * Which of the six a node wears.
 *
 * Hashed rather than `i % n`: the nodes are laid out along a helix in index
 * order, so any repeating pattern over the index paints stripes down the path
 * and you end up reading the arithmetic instead of the sky. Hashed rather than
 * `Math.random`, because a constellation whose stars rearranged themselves on
 * every visit would read as noise rather than as a place.
 *
 * Weighted — mint four times in nine, amber twice, one each of ice, cyan and
 * paper — so the field has a temperature range without any one node looking like
 * it wandered in from another website.
 */
function starHue(colors: ReturnType<typeof palette>, i: number) {
  let x = Math.imul(i + 1, 2654435761) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 1597334677) >>> 0;
  x ^= x >>> 16;
  const pick = (x >>> 0) % 9;
  if (pick < 4) return colors.glow;
  if (pick < 6) return colors.amber;
  if (pick === 6) return colors.ice;
  if (pick === 7) return colors.cyan;
  return colors.paper;
}

/** One node per project, threaded along -Z on a slow helix so the camera has
 *  something to bank around instead of flying down a straight tube. */
function layout(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const t = count > 1 ? i / (count - 1) : 0;
    const angle = t * Math.PI * 1.75;
    return new THREE.Vector3(
      Math.cos(angle) * 3.1,
      Math.sin(angle * 1.4) * 1.5,
      -t * 27
    );
  });
}

/** A sphere with a flat material draws a hard-edged circle, and at the range this
 *  camera passes nodes that circle fills a good part of the screen — it stops
 *  reading as a glow and starts reading as a coloured disc pasted over the page.
 *  A billboarded sprite carrying a radial falloff is the fix, and one 128px
 *  texture serves every node in the scene. */
function useGlowTexture() {
  return useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.2, 'rgba(255,255,255,0.4)');
      gradient.addColorStop(0.52, 'rgba(255,255,255,0.09)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

function Constellation({
  nodes,
  colors,
  progress,
  flourish,
}: {
  nodes: THREE.Vector3[];
  colors: ReturnType<typeof palette>;
  progress: Progress;
  /** 1 at the instant the backdrop hands over, decaying to 0 over about a
   *  second. The constellation arrives brighter than it lives and settles into
   *  its drift — which is the difference between a scene that switches on and a
   *  scene you walked into while something was still fading. */
  flourish: Progress;
}) {
  const { camera } = useThree();
  const haloRefs = useRef<(THREE.Sprite | null)[]>([]);
  const coreRefs = useRef<(THREE.Mesh | null)[]>([]);
  const glow = useGlowTexture();

  useEffect(() => () => glow.dispose(), [glow]);

  const edges = useMemo(() => {
    const points: number[] = [];
    const push = (a: THREE.Vector3, b: THREE.Vector3) =>
      points.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (let i = 0; i < nodes.length - 1; i++) push(nodes[i], nodes[i + 1]);
    // A few long-range links so the shape reads as a graph rather than a chain.
    for (let i = 0; i + 2 < nodes.length; i += 2) push(nodes[i], nodes[i + 2]);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return geometry;
  }, [nodes]);

  // useMemo'd geometry isn't owned by the reconciler, so it has to be released
  // by hand — otherwise every remount leaks a GPU buffer.
  useEffect(() => () => edges.dispose(), [edges]);

  useFrame((_, delta) => {
    flourish.current = Math.max(0, flourish.current - delta / 0.8);
    const lift = 1 + flourish.current * 0.7;

    // Each node brightens as the camera arrives at it. This is the reason the
    // scene is hand-written R3F: the reaction is to *our* scroll progress, which
    // no exported scene file could know about.
    for (let i = 0; i < nodes.length; i++) {
      const distance = camera.position.distanceTo(nodes[i]);
      const nearness = THREE.MathUtils.clamp(1 - (distance - 2.5) / 11, 0, 1);
      // …and fades back out as the camera passes through it. Monotonic
      // "nearer is brighter" means the node the camera is currently inside
      // becomes a flat wash across the whole viewport, which is exactly what a
      // background layer must never do. You don't see the star you're inside.
      //
      // The fade runs from 1.1 out to 5.5 units, not to 3.0. At three units a
      // node's halo already covers most of the viewport, so starting the fade
      // there meant the brightest, largest state was also the last one drawn —
      // and a disc that size, clipped by the edge of the screen, reads as a
      // light leak rather than as a star going past. Dimming across the whole
      // approach keeps the far field exactly as it was and leaves a close pass
      // as a soft wash instead of a hard-edged blob.
      const passing = THREE.MathUtils.clamp((distance - 1.1) / 4.4, 0, 1);
      const halo = haloRefs.current[i];
      const core = coreRefs.current[i];
      if (halo) {
        const material = halo.material as THREE.SpriteMaterial;
        // Both surfaces are additive now, so these numbers are amounts of light
        // added rather than degrees of opacity. That is the point of the swap:
        // two halos crossing each other sum to something brighter than either,
        // and the whole field gains a floor of light where the density is
        // highest — the top of the helix — which is where the eye should go
        // first. Raising opacity on a normal-blended material could only ever
        // approach the colour; it can never exceed it, and nothing glows.
        material.opacity = (0.24 + nearness * 0.52) * passing * lift;
        halo.scale.setScalar((1.55 + nearness * 1.5) * (1 + flourish.current * 0.3));
      }
      if (core) {
        const material = core.material as THREE.MeshBasicMaterial;
        material.opacity = (0.58 + nearness * 0.5) * passing * lift;
      }
    }
    void progress;
  });

  return (
    <group>
      <lineSegments geometry={edges}>
        <lineBasicMaterial
          color={colors.glowDim}
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      {nodes.map((position, i) => {
        const hue = starHue(colors, i);
        return (
          <group key={i} position={position}>
            <mesh ref={(el) => void (coreRefs.current[i] = el)}>
              <sphereGeometry args={[0.07, 16, 16]} />
              <meshBasicMaterial
                color={hue}
                transparent
                opacity={0.6}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            <sprite ref={(el) => void (haloRefs.current[i] = el)} scale={[1.5, 1.5, 1]}>
              <spriteMaterial
                map={glow}
                color={hue}
                transparent
                opacity={0.16}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </sprite>
          </group>
        );
      })}
    </group>
  );
}

function Dust({
  count,
  color,
  size,
  opacity,
  drift,
}: {
  count: number;
  color: THREE.Color;
  size: number;
  opacity: number;
  drift: boolean;
}) {
  const ref = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 26;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 2] = -Math.random() * 34 + 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [count]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    if (!drift || !ref.current) return;
    ref.current.rotation.y += delta * 0.012;
  });

  // Two of these are drawn, in two colours rather than one, because a single
  // per-vertex colour is not worth a second shader program compiled at the exact
  // moment the scene first appears — and because two objects lets the layers
  // differ in size as well as hue, which reads as depth rather than as a tint.
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        color={color}
        size={size}
        sizeAttenuation
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/**
 * Compiles every program the scene will ever use, at mount, during idle.
 *
 * A WebGL program is linked the first time three draws something that needs it,
 * and linking is synchronous and cannot be made not to happen. Left alone it
 * lands on the first frame of the render loop — measured on this project's own
 * hardware as a 98ms dropped-frame stall at scrollY 1096, with all four of the
 * scene's programs linking inside a 65ms window there. Starting the loop a
 * screen early does not help with this, and that was the trap: the warm-up
 * window moves *when the first frame happens*, but the first frame is itself
 * the cost, so the window only relocates the stall from the handoff to
 * mid-hero. It has to happen somewhere; it should happen where nobody is
 * scrolling.
 *
 * compileAsync is not a way to skip the work — it calls compile() synchronously
 * first — but it uses KHR_parallel_shader_compile where the driver offers it, so
 * the driver links on its own thread and the wait is a promise instead of a
 * stall. requestIdleCallback puts the synchronous half into a gap the browser
 * was going to spend idle anyway, which at this point in the page's life is
 * most of them: the chunk lands around 3.5s into a page that is already loaded
 * and being read.
 */
function Warmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    let cancelled = false;
    const compile = () => {
      if (cancelled) return;
      void (gl.compileAsync
        ? gl.compileAsync(scene, camera)
        : Promise.resolve(gl.compile(scene, camera)));
    };
    // The timeout is the safety net: an idle callback with no deadline can be
    // starved indefinitely on a busy page, and a scene that reaches its first
    // frame uncompiled is the exact failure this exists to prevent.
    const handle = window.requestIdleCallback
      ? window.requestIdleCallback(compile, { timeout: 1500 })
      : window.setTimeout(compile, 200);
    return () => {
      cancelled = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(handle);
      window.clearTimeout(handle);
    };
  }, [gl, scene, camera]);

  return null;
}

function CameraRig({
  curve,
  progress,
  reduced,
}: {
  curve: THREE.CatmullRomCurve3;
  progress: Progress;
  reduced: boolean;
}) {
  const { camera } = useThree();
  const eased = useRef(reduced ? 0.3 : 0);
  const tangent = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const target = reduced ? 0.3 : progress.current;

    // Damped approach instead of binding the camera straight to scroll position.
    // A 1:1 map feels mechanical because it has no weight; this gives the camera
    // just enough lag to read as a body being carried along. Exponential form so
    // the feel is identical at 60 and 120fps.
    eased.current +=
      (target - eased.current) * (1 - Math.pow(0.0016, Math.min(delta, 0.05)));

    const t = THREE.MathUtils.clamp(eased.current, 0, 1);
    curve.getPointAt(t, camera.position);

    // Orient from the tangent rather than from a point further along the curve —
    // that version divides by zero at t = 1 and snaps the camera to NaN.
    curve.getTangentAt(t, tangent);
    lookAt.copy(camera.position).addScaledVector(tangent, 4);
    camera.lookAt(lookAt);
  });

  return null;
}

/**
 * The projects section's 3D layer: a constellation of one node per project with
 * the camera flying through it, driven entirely by how far you've scrolled the
 * section.
 *
 * Deliberately its own canvas and its own component — it shares no renderer with
 * the hero's 2D field, and it sits behind the cards as depth rather than as
 * something to look at directly. The cards are the content; this is the room
 * they're in.
 */
export function ProjectConstellation({ count }: { count: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const flourish = useRef(0);
  const [active, setActive] = useState(false);
  const reduced = prefersReducedMotion();

  const colors = useMemo(palette, []);
  const nodes = useMemo(() => layout(count), [count]);
  const curve = useMemo(() => {
    const lead = new THREE.Vector3(0, 1, 9);
    const path = nodes.map((n) =>
      n.clone().add(new THREE.Vector3(n.x > 0 ? -1.5 : 1.5, 0.55, 3.6))
    );
    const tail = nodes[nodes.length - 1].clone().add(new THREE.Vector3(0, 0.4, -5));
    return new THREE.CatmullRomCurve3([lead, ...path, tail], false, 'catmullrom', 0.4);
  }, [nodes]);

  const dustCount = typeof window !== 'undefined' && window.innerWidth < 700 ? 260 : 720;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const hero = document.querySelector<HTMLElement>('.hero');
    if (!hero) return;

    // Everything here is measured against one position: the hero's bottom edge
    // reaching the top of the viewport. That is where the wallpaper stops, where
    // this component's own container begins, and where the camera's flight
    // starts — three components reading the same boundary, each expressed as a
    // ScrollTrigger range rather than as an offset, so a refresh recomputes all
    // three together instead of three numbers drifting apart.
    const max = () => ScrollTrigger.maxScroll(window);
    const boundary = () => hero.offsetTop + hero.offsetHeight;

    // The layer is opaque above the boundary and invisible below it, and the
    // change is a cut, not a fade — a fade in would put two backdrops on screen
    // at once through the whole transition, which is the dissolve this is meant
    // to replace.
    //
    // `null` rather than `false` to start, so the first call always writes: on a
    // fresh load at the top the trigger changes state from nothing to nothing
    // and would otherwise never fire, leaving the constellation at the CSS
    // default wherever you happened to open the page.
    let open: boolean | null = null;
    const gate = (next: boolean) => {
      if (next === open) return;
      open = next;
      gsap.set(host, { '--constellation-opacity': next ? '1' : '0' });
      if (next && !reduced) flourish.current = 1;
    };

    // The render loop runs for one screen of scroll before the handoff and
    // stops again above it.
    //
    // This is deliberately not ScrollTrigger's own `isActive`. ScrollTrigger
    // recomputes `isActive`, dispatches `onToggle` and dispatches `onUpdate` all
    // inside one guard on the clipped progress having *changed* — and `onToggle`
    // is additionally skipped during a refresh. A refresh that moves the
    // trigger's start while the page is parked somewhere its clipped progress
    // does not change therefore leaves all three stale, indefinitely. Driving
    // the loop from `isActive` meant a constellation that rendered for twenty
    // seconds at scroll 0 in one run, started at the handoff in another, and
    // started eight seconds in during a third, depending on when the refresh
    // landed relative to layout. Rendering state is not something to infer from
    // a callback that may not fire; it is a pure function of where the page is,
    // so it is computed as one, from the same `boundary()` everything else here
    // uses, on every scroll event.
    let rendering = false;
    const setRendering = (next: boolean) => {
      if (next === rendering) return;
      rendering = next;
      setActive(next);
    };

    const apply = (y: number) => {
      const from = boundary();
      progress.current = THREE.MathUtils.clamp(
        (y - from) / Math.max(max() - from, 1),
        0,
        1
      );
      if (y < from) flourish.current = 0;
      setRendering(y >= from - window.innerHeight);
      gate(y >= from);
    };

    const trigger = ScrollTrigger.create({
      trigger: hero,
      // The whole page, rather than a window around the boundary. The range
      // below is the one place the numbers this component cares about are
      // derived, and deriving them needs `onUpdate` to fire — which it only does
      // while the trigger is active. A range that starts at the boundary would
      // go silent everywhere above it, which is precisely where the render loop
      // has to be able to switch *off*.
      start: 0,
      // Past the end of the page rather than at it, so the trigger is still
      // active on the last pixel. Ending at maxScroll would make it go silent at
      // exactly the scroll position where the field is the only thing on screen
      // behind the footer.
      end: () => max() + window.innerHeight,
      invalidateOnRefresh: true,
      onUpdate: (self) => apply(self.scroll()),
    });

    // `onUpdate` is a scroll callback, and a page can load with the scroll
    // already behind it — a deep link to #projects, or a restored position. So
    // the same function runs once at mount, on the next frame, because at this
    // point in the effect the hero's `100svh` beats have not necessarily been
    // laid out yet and a boundary measured now can be a fraction of its real
    // value.
    const first = requestAnimationFrame(() => apply(window.scrollY));

    return () => {
      cancelAnimationFrame(first);
      trigger.kill();
    };
  }, [reduced]);

  return (
    <div className="constellation" ref={hostRef} aria-hidden>
      <Canvas
        className="constellation-canvas"
        dpr={[1, 1.5]}
        frameloop={reduced ? 'demand' : active ? 'always' : 'never'}
        camera={{ fov: 55, near: 0.1, far: 60, position: [0, 1, 9] }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        {/* Fog in --ink so the far end of the constellation dissolves into the
            page background instead of ending on a visible edge. With additive
            blending the fog reads as "light that never arrives" rather than as
            haze, which is why the far field can be dimmer than it was. */}
        <fog attach="fog" args={[colors.ink, 7, 32]} />
        <CameraRig curve={curve} progress={progress} reduced={reduced} />
        <Constellation
          nodes={nodes}
          colors={colors}
          progress={progress}
          flourish={flourish}
        />
        <Dust count={dustCount} color={colors.glowDim} size={0.035} opacity={0.62} drift={!reduced} />
        <Dust
          count={Math.round(dustCount * 0.45)}
          color={colors.cyan}
          size={0.046}
          opacity={0.55}
          drift={!reduced}
        />
        {/* Last child on purpose: its effect has to run after every object above
            has been attached to the scene, or it compiles a graph with holes in
            it. */}
        <Warmup />
      </Canvas>
    </div>
  );
}
