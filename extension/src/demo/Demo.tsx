import { useMemo, useState } from 'react';
import { App, type Source } from '../app/App';
import type { CourseRules, Dump } from '../engine/types';
import demoRules from '../../../demo/fixtures/rules.json';
import week2 from '../../../demo/fixtures/week2.json';
import midterms from '../../../demo/fixtures/midterms.json';
import finals from '../../../demo/fixtures/finals.json';

const RULES = demoRules as unknown as CourseRules[];

const SCENARIOS = [
  { id: 'week2', label: 'Week 2',
    blurb: 'Nothing is graded yet — and Canvas is already reporting numbers.',
    dump: week2 },
  { id: 'midterms', label: 'Midterms',
    blurb: 'Half the term is decided. Now the courses separate.',
    dump: midterms },
  { id: 'finals', label: 'Finals week',
    blurb: 'One grade locked in, one out of reach. Time to reallocate.',
    dump: finals },
] as const;

type ScenarioId = typeof SCENARIOS[number]['id'];

export function Demo() {
  const [id, setId] = useState<ScenarioId>('midterms');
  const current = SCENARIOS.find((s) => s.id === id)!;

  const source: Source = useMemo(() => ({
    load: async () => current.dump as unknown as Dump,
    rules: RULES,
    standalone: false,
    banner: (
      <div className="scenarios">
        <span className="slabel">Sample semester at</span>
        <div className="srow" role="tablist" aria-label="Point in the semester">
          {SCENARIOS.map((s) => (
            <button
              key={s.id} role="tab" aria-selected={s.id === id}
              className={`sbtn${s.id === id ? ' on' : ''}`}
              onClick={() => setId(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    ),
  }), [id, current]);

  // Remount on scenario change so every card animates in again.
  return <App key={id} source={source} />;
}
