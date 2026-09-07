import { useEffect, useRef, useState } from 'react';
import { PILL_LABEL, narrate } from '../../engine/narrate';
import type { CourseResult } from '../../engine/types';
import { useCountUp, useReveal } from '../hooks/motion';
import { Receipt } from './Receipt';
import { WhatIf } from './WhatIf';
import { WhatsLeft, type PlanControls } from './WhatsLeft';

export function CourseCard({ result: actual, planned, plan, index }: {
  result: CourseResult;
  /** The same course re-evaluated with your hypothetical scores. */
  planned?: CourseResult;
  plan?: PlanControls;
  index: number;
}) {
  // With a plan in play every number on the card reflects it -- otherwise the
  // headline and the projection would disagree with each other.
  const result = planned ?? actual;
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

      {planned && (
        <p className="plan-out">
          With your planned scores, and the rest at your current pace, this
          finishes at <b>{planned.on_pace.toFixed(1)}%</b>{' '}
          <span className="lt">{planned.on_pace_letter}</span>
          <span className="plan-delta">
            {planned.on_pace >= actual.on_pace ? '\u25b2' : '\u25bc'}{' '}
            {Math.abs(planned.on_pace - actual.on_pace).toFixed(1)} points versus
            your pace without them
          </span>
        </p>
      )}

      <WhatsLeft result={actual} plan={plan} />

      <WhatIf result={result} />

      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary />
        {open && <Receipt result={result} />}
      </details>
    </article>
  );
}
