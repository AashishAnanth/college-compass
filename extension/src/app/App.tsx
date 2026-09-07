import { useCallback, useEffect, useState } from 'react';
import { evaluate } from '../engine/engine';
import { headline } from '../engine/narrate';
import rulesJson from '../engine/rules.json';
import type { CourseResult, CourseRules, Dump, RawCourse } from '../engine/types';
import { CourseCard } from './components/CourseCard';
import { Triage } from './components/Triage';

const BUNDLED_RULES = rulesJson as unknown as CourseRules[];

/** Where the data comes from. The extension reads a live Canvas session; the
 *  demo supplies fixtures. Everything below this line is identical either way. */
export interface Source {
  /** Last good result, painted instantly while a fresh read runs behind. */
  cached?(): Promise<{ dump: Dump; at: number } | null>;
  load(): Promise<Dump>;
  rules?: CourseRules[];
  /** Rendered above the courses; the demo puts its scenario switcher here. */
  banner?: React.ReactNode;
  /** False when the page already has its own masthead, as the demo does. */
  standalone?: boolean;
}

const chromeSource: Source = {
  async cached() {
    const r = await chrome.runtime.sendMessage({ type: 'cached' });
    return r?.ok && r.data ? { dump: r.data as Dump, at: r.at ?? Date.now() } : null;
  },
  async load() {
    const r = await chrome.runtime.sendMessage({ type: 'collect' });
    if (!r?.ok) throw new Error(r?.error ?? 'Could not read Canvas');
    const dump = r.data as Dump | null;
    if (!dump || dump.error) throw new Error('NOT_SIGNED_IN');
    return dump;
  },
};

const norm = (s: string) => s.replace(/[-\s]/g, '').toUpperCase();

function matchRules(course: RawCourse, rules: CourseRules[]): CourseRules | null {
  const code = norm(course.course_code);
  const first = norm(course.course_code.split(' ')[0] ?? '');
  const full = norm(course.name);
  return rules.find((r) => {
    const b = norm(r.course_code);
    return code.startsWith(b) || full.startsWith(b)
        || first.startsWith(b) || b.startsWith(first);
  }) ?? null;
}

function ago(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

interface View {
  results: CourseResult[];
  unknown: string[];
  term: number;
  live: boolean;
  at: number;
}

function build(dump: Dump, live: boolean, at: number,
               rules: CourseRules[]): View | null {
  const results: CourseResult[] = [];
  const unknown: string[] = [];
  for (const c of dump.courses) {
    const found = matchRules(c, rules);
    if (!found) { unknown.push(c.course_code); continue; }
    results.push(evaluate(found, c));
  }
  if (!results.length) return null;
  results.sort((a, b) => b.settled_pct - a.settled_pct);
  return { results, unknown, term: dump.term, live, at };
}

type Status =
  | { kind: 'loading' }
  | { kind: 'error'; title: string; body: string }
  | { kind: 'ready' };

export function App({ source = chromeSource }: { source?: Source }) {
  const rules = source.rules ?? BUNDLED_RULES;
  const [view, setView] = useState<View | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  const load = useCallback(async () => {
    setStatus({ kind: 'loading' });

    // Paint the last good result immediately, then refresh behind it.
    let painted = false;
    try {
      const cached = await source.cached?.();
      if (cached) {
        const v = build(cached.dump, false, cached.at, rules);
        if (v) { setView(v); setStatus({ kind: 'ready' }); painted = true; }
      }
    } catch { /* no cache yet; fall through to the live read */ }

    let dump: Dump;
    try {
      dump = await source.load();
    } catch (e) {
      if (painted) return;
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg === 'NOT_SIGNED_IN'
        ? { kind: 'error', title: 'Not signed in to Canvas',
            body: 'Open Canvas, sign in, then try again.' }
        : { kind: 'error', title: 'Could not read Canvas', body: msg });
      return;
    }

    const v = build(dump, true, Date.now(), rules);
    if (!v) {
      setStatus({ kind: 'error', title: 'No grading rules yet',
                  body: `Found ${dump.courses.length} courses but no rules for any of `
                      + 'them. Rules come from your syllabi.' });
      return;
    }
    setView(v);
    setStatus({ kind: 'ready' });
  }, [source, rules]);

  useEffect(() => { void load(); }, [load]);

  const h = view ? headline(view.results) : null;

  return (
    <div className="wrap">
      {source.standalone !== false && (
      <header className="mast">
        <svg className="needle" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10.25" stroke="currentColor" strokeWidth="1.1" opacity=".45" />
          <path d="M12 4.2 L15 13.4 L12 11.6 L9 13.4 Z" fill="currentColor" />
          <path d="M12 19.8 L9 10.6 L12 12.4 L15 10.6 Z" fill="currentColor" opacity=".3" />
        </svg>
        <span className="wordmark">College&nbsp;Compass</span>
        {view && <span className="tag">Term {view.term}</span>}
        {view && source.cached && (
          <span className="stale">
            <span className={`dot${view.live ? ' live' : ''}`} />
            {view.live ? 'live' : `cached ${ago(view.at)}`}
          </span>
        )}
      </header>
      )}

      {status.kind === 'loading' && !view && (
        <div className="state">
          <div className="spin" />
          <h3>Reading your courses</h3>
          <p>Using the Canvas session already open in your browser. Nothing is stored
             and nothing leaves this machine.</p>
        </div>
      )}

      {status.kind === 'error' && !view && (
        <div className="state">
          <h3>{status.title}</h3>
          <p>{status.body}</p>
          <button className="retry" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {view && h && (
        <div className="fadein" key={view.term + String(view.at)}>
          <p className="thesis">{h.claim}</p>
          <p className="standfirst">{h.detail}</p>

          {source.banner}

          <Triage results={view.results} />

          <section>
            <h2>Your courses</h2>
            {view.results.map((r, i) => (
              <CourseCard key={r.code} result={r} index={i} />
            ))}
          </section>

          <footer>
            Computed from your Canvas account and the grading rules in your syllabi.
            Canvas&rsquo;s own numbers are shown only so you can see how far off they
            are. Nothing is stored.
            {view.unknown.length > 0 && ` No rules yet for ${view.unknown.join(', ')}.`}
          </footer>
        </div>
      )}
    </div>
  );
}
