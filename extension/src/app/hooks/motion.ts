import { useEffect, useRef, useState } from 'react';

/** Respects the OS setting, and keeps respecting it if the user changes it. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * Fade-and-lift a section the first time it enters the viewport.
 * Returns a ref to attach and whether it has appeared yet.
 */
export function useReveal<T extends HTMLElement>(rootMargin = '-12% 0px') {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) { setShown(true); return; }
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') { setShown(true); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, rootMargin]);

  return { ref, shown };
}

/** Counts up to `value` once `active`. Snaps instantly under reduced motion. */
export function useCountUp(value: number, active: boolean, ms = 700): number {
  const [n, setN] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!active) return;
    if (reduced || ms === 0) { setN(value); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      // ease-out cubic: fast first, settles gently
      setN(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, active, ms, reduced]);

  return n;
}
