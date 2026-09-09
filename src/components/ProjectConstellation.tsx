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
  return {
    glow: new THREE.Color(read('--glow', '#4fe8c4')),
    glowDim: new THREE.Color(read('--glow-dim', '#2c8f77')),
    amber: new THREE.Color(read('--amber', '#f2a65a')),
    ink: read('--ink', '#12110f'),
  };
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
}: {
  nodes: THREE.Vector3[];
  colors: ReturnType<typeof palette>;
  progress: Progress;
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

  useFrame(() => {
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
      const passing = THREE.MathUtils.clamp((distance - 1.1) / 1.9, 0, 1);
      const halo = haloRefs.current[i];
      const core = coreRefs.current[i];
      if (halo) {
        const material = halo.material as THREE.SpriteMaterial;
        material.opacity = (0.16 + nearness * 0.4) * passing;
        halo.scale.setScalar(1.5 + nearness * 1.4);
      }
      if (core) {
        const material = core.material as THREE.MeshBasicMaterial;
        material.opacity = (0.45 + nearness * 0.55) * passing;
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
          opacity={0.34}
          depthWrite={false}
        />
      </lineSegments>

      {nodes.map((position, i) => (
        <group key={i} position={position}>
          <mesh ref={(el) => void (coreRefs.current[i] = el)}>
            <sphereGeometry args={[0.07, 16, 16]} />
            <meshBasicMaterial
              color={i % 3 === 1 ? colors.amber : colors.glow}
              transparent
              opacity={0.6}
            />
          </mesh>
          <sprite ref={(el) => void (haloRefs.current[i] = el)} scale={[1.5, 1.5, 1]}>
            <spriteMaterial
              map={glow}
              color={i % 3 === 1 ? colors.amber : colors.glow}
              transparent
              opacity={0.16}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
        </group>
      ))}
    </group>
  );
}

function Dust({ count, color, drift }: { count: number; color: THREE.Color; drift: boolean }) {
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

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        color={color}
        size={0.035}
        sizeAttenuation
        transparent
        opacity={0.5}
        depthWrite={false}
      />
    </points>
  );
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

    const trigger = ScrollTrigger.create({
      trigger: host.closest('section') ?? host,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        progress.current = self.progress;
      },
      // Rendering a WebGL scene nobody can see is the single most expensive
      // mistake available here, so the loop is switched off the moment the
      // section leaves the viewport.
      onToggle: (self) => setActive(self.isActive),
    });

    return () => trigger.kill();
  }, []);

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
            page background instead of ending on a visible edge. */}
        <fog attach="fog" args={[colors.ink, 7, 32]} />
        <CameraRig curve={curve} progress={progress} reduced={reduced} />
        <Constellation nodes={nodes} colors={colors} progress={progress} />
        <Dust count={dustCount} color={colors.glowDim} drift={!reduced} />
      </Canvas>
    </div>
  );
}
