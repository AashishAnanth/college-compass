import { useEffect, useRef, useState } from 'react';
import { PILL_LABEL, narrate } from '../../engine/narrate';
import type { CourseResult } from '../../engine/types';
import { Receipt } from './Receipt';
import { WhatIf } from './WhatIf';

export function CourseCard({ result }: { result: CourseResult }) {
  const n = narrate(result);
  const [open, setOpen] = useState(false);

  // Grow the bar after first paint so it animates in.
  const fill = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = fill.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.style.width = `${Math.max(0.6, result.settled_pct).toFixed(3)}%`;
    });
    return () => cancelAnimationFrame(id);
  }, [result.settled_pct]);

  return (
    <article className="course">
      <div className="meta">
        <span className="code">{result.code}</span>
        <span className={`pill ${n.state}`}>{PILL_LABEL[n.state]}</span>
        <span className="settled">{result.settled_pct.toFixed(1)}% decided</span>
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

      <WhatIf result={result} />

      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary />
        {open && <Receipt result={result} />}
      </details>
    </article>
  );
}
