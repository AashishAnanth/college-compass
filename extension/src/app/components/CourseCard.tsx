import { useEffect, useRef, useState } from 'react';
import { PILL_LABEL, narrate } from '../../engine/narrate';
import type { CourseResult } from '../../engine/types';
import { useCountUp, useReveal } from '../hooks/motion';
import { Receipt } from './Receipt';
import { WhatIf } from './WhatIf';
import { WhatsLeft } from './WhatsLeft';

export function CourseCard({ result, index }: { result: CourseResult; index: number }) {
  const n = narrate(result);
  const [open, setOpen] = useState(false);
  const { ref, shown } = useReveal<HTMLElement>();
  const settled = useCountUp(result.settled_pct, shown, 800);

  // Grow the bar once the card is actually on screen.
  const fill = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = fill.current;
    if (!el || !shown) return;
    const id = requestAnimationFrame(() => {
      el.style.width = `${Math.max(0.6, result.settled_pct).toFixed(3)}%`;
    });
    return () => cancelAnimationFrame(id);
  }, [result.settled_pct, shown]);

  return (
    <article
      className={`course${shown ? ' in' : ''}`}
      ref={ref}
      style={{ transitionDelay: `${Math.min(index, 5) * 70}ms` }}
    >
      <div className="meta">
        <span className="code">{result.code}</span>
        <span className={`pill ${n.state}`}>{PILL_LABEL[n.state]}</span>
        <span className="settled">{settled.toFixed(1)}% decided</span>
      </div>

      <p className="claim">{n.claim}</p>
      <p className="because">{n.because}</p>

      <div className="band">
        <span className="lo">{result.floor.toFixed(0)}%</span>
        <div className="track"><div className="fill" ref={fill} /></div>
        <span className="hi">{result.ceiling.toFixed(0)}%</span>
      </div>
      <p className="bandnote">
        If everything left goes badly you finish at <b>{result.floor.toFixed(0)}%</b>.
        If it all goes perfectly, <b>{result.ceiling.toFixed(0)}%</b>. That gap is how
        little is settled.
      </p>

      <WhatsLeft result={result} />

      <WhatIf result={result} />

      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary />
        {open && <Receipt result={result} />}
      </details>
    </article>
  );
}
