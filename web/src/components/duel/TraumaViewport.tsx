import React, { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import type { VisualMode } from '../../presentation/types.ts';

export interface TraumaViewportProps {
  visualMode: VisualMode;
  impulse: number;
  impulseKey: string | null;
  clearSignal: number;
  className?: string;
  children: React.ReactNode;
}

const TRAUMA_DECAY_PER_SEC = 2.4;
const MAX_OFFSET_X = 11;
const MAX_OFFSET_Y = 8;
const MAX_ROLL_DEG = 0.85;

/**
 * Damped `trauma^2` viewport wrapper producing smooth anime impact shake
 * purely on CSS transforms (`0` React state re-renders per frame) in Drama mode.
 */
export const TraumaViewport: React.FC<TraumaViewportProps> = ({
  visualMode,
  impulse,
  impulseKey,
  clearSignal,
  className = '',
  children
}) => {
  const prefersReducedMotion = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const traumaRef = useRef(0);
  const clockRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);

  const resetTransform = () => {
    traumaRef.current = 0;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (viewportRef.current) {
      viewportRef.current.style.transform = '';
    }
  };

  useEffect(() => {
    if (visualMode !== 'drama' || prefersReducedMotion) {
      resetTransform();
    }
  }, [visualMode, prefersReducedMotion]);

  useEffect(() => {
    resetTransform();
  }, [clearSignal]);

  useEffect(() => {
    if (visualMode !== 'drama' || prefersReducedMotion || !impulseKey || impulse <= 0) {
      return;
    }

    traumaRef.current = Math.min(1, traumaRef.current + impulse);

    if (rafRef.current !== null) return;
    lastTimeRef.current = performance.now();

    const stepShake = () => {
      const now = performance.now();
      const dt = Math.min(Math.max((now - lastTimeRef.current) / 1000, 0), 0.1);
      lastTimeRef.current = now;

      traumaRef.current = Math.max(0, traumaRef.current - TRAUMA_DECAY_PER_SEC * dt);
      if (traumaRef.current <= 0.005 || !viewportRef.current) {
        resetTransform();
        return;
      }

      const shake = traumaRef.current * traumaRef.current;
      clockRef.current += dt * 34;
      const t = clockRef.current;

      const ox = MAX_OFFSET_X * shake * Math.sin(t * 1.7);
      const oy = MAX_OFFSET_Y * shake * Math.sin(t * 2.3);
      const rot = MAX_ROLL_DEG * shake * Math.sin(t * 1.1);

      viewportRef.current.style.transform = `translate3d(${ox.toFixed(2)}px, ${oy.toFixed(2)}px, 0) rotate(${rot.toFixed(3)}deg)`;
      rafRef.current = requestAnimationFrame(stepShake);
    };

    rafRef.current = requestAnimationFrame(stepShake);
  }, [visualMode, prefersReducedMotion, impulse, impulseKey]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return (
    <div ref={viewportRef} className={className} data-testid="trauma-viewport">
      {children}
    </div>
  );
};
