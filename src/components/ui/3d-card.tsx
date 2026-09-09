import React, { createContext, useContext, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const MouseEnterContext = createContext<
  [boolean, React.Dispatch<React.SetStateAction<boolean>>] | undefined
>(undefined);

const SPRING = { stiffness: 150, damping: 20, mass: 0.55 } as const;
const MAX_TILT = 9;

/** Tilt is decoration, and decoration has no business firing on a tap. */
function usePreciseHover() {
  const [precise] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
  return precise;
}

export function CardContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMouseEntered, setIsMouseEntered] = useState(false);
  const reduced = useReducedMotion();
  const precise = usePreciseHover();
  const interactive = precise && !reduced;

  // Mapping the transform straight off cursor position reads as artificial —
  // it has no weight, and it stops dead the instant the pointer stops. Running
  // the normalised position through a spring gives the surface momentum, which
  // is the whole reason the tilt feels like a physical object.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateY = useSpring(useTransform(pointerX, [-1, 1], [-MAX_TILT, MAX_TILT]), SPRING);
  const rotateX = useSpring(useTransform(pointerY, [-1, 1], [MAX_TILT, -MAX_TILT]), SPRING);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el || !interactive) return;
    const { left, top, width, height } = el.getBoundingClientRect();
    pointerX.set(((e.clientX - left) / width) * 2 - 1);
    pointerY.set(((e.clientY - top) / height) * 2 - 1);
  };

  const handleMouseLeave = () => {
    setIsMouseEntered(false);
    pointerX.set(0);
    pointerY.set(0);
  };

  return (
    <MouseEnterContext.Provider value={[isMouseEntered, setIsMouseEntered]}>
      <div
        className={cn('flex h-full w-full items-stretch justify-center', className)}
        style={{ perspective: 900 }}
      >
        <motion.div
          ref={containerRef}
          onMouseEnter={() => interactive && setIsMouseEntered(true)}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            rotateX: interactive ? rotateX : 0,
            rotateY: interactive ? rotateY : 0,
            transformStyle: 'preserve-3d',
          }}
          // Press feedback the tilt can't give: a card is a link, and a link
          // needs to acknowledge the tap on touch devices too.
          whileTap={reduced ? undefined : { scale: 0.985 }}
          transition={SPRING}
          className="relative h-full w-full will-change-transform"
        >
          {children}
        </motion.div>
      </div>
    </MouseEnterContext.Provider>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('h-full w-full', className)} style={{ transformStyle: 'preserve-3d' }}>
      {children}
    </div>
  );
}

export function CardItem({
  children,
  className,
  translateZ = 0,
}: {
  children: React.ReactNode;
  className?: string;
  translateZ?: number | string;
}) {
  return (
    <div
      className={className}
      style={{ transform: `translateZ(${translateZ}px)`, transformStyle: 'preserve-3d' }}
    >
      {children}
    </div>
  );
}

export function useMouseEnter() {
  const ctx = useContext(MouseEnterContext);
  if (!ctx) throw new Error('useMouseEnter must be used within a CardContainer');
  return ctx;
}
