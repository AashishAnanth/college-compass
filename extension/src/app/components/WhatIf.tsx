import { useMemo, useState } from 'react';
import { letterFor, project } from '../../engine/engine';
import type { CourseResult } from '../../engine/types';

/** "If I average X% on everything left, where do I finish?"
 *  Bonus is assumed forfeited, so this is the floor of the scenario. */
export function WhatIf({ result }: { result: CourseResult }) {
  const [rate, setRate] = useState(85);

  const { final, letter } = useMemo(() => {
    const f = project(result, rate / 100);
    return { final: f, letter: letterFor(result.rules, f) };
  }, [result, rate]);

  const needA = result.needed_for('A');
  const low = letter === 'D' || letter === 'F';

  return (
    <div className="whatif">
      <div className="wtop">
        <span className="wlabel">
          If I average <b>{rate}%</b> on everything left
        </span>
        <span className="wout">
          you finish at <span className="pct">{final.toFixed(1)}%</span>{' '}
          <span className={`lt${low ? ' low' : ''}`}>{letter}</span>
        </span>
      </div>
      <input
        type="range" min={0} max={100} step={1} value={rate}
        onChange={(e) => setRate(Number(e.target.value))}
        aria-label={`Assumed average on remaining work in ${result.code}`}
      />
      <div className="wticks"><span>0%</span><span>50%</span><span>100%</span></div>
      <p className="wnote">
        {needA !== null && needA > 0 && needA <= 100
          ? `The A needs ${needA.toFixed(0)}%. Bonus is assumed forfeited — this is the
             floor of that scenario, not the best case.`
          : 'Bonus is assumed forfeited, so this is the floor of that scenario.'}
      </p>
    </div>
  );
}
