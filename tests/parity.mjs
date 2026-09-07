/* Diffs the TypeScript engine against the Python one.
 *
 * The engine exists twice: Python for analysis, TypeScript so the extension
 * needs no backend. Any drift between them is a bug in whichever was edited
 * last, so every value is compared across every demo scenario -- and the real
 * Canvas dump too, when one is present locally.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { evaluate, project } from '../extension/build/engine.js';

const ROOT = new URL('..', import.meta.url).pathname;
const py = JSON.parse(readFileSync('/tmp/py_engine.json', 'utf8'));

const norm = (s) => s.replace(/[-\s]/g, '').toUpperCase();
const match = (c, rules) => rules.find((r) =>
  norm(c.course_code).startsWith(norm(r.course_code)) ||
  norm(c.name).startsWith(norm(r.course_code)));

const demoRules = JSON.parse(readFileSync(ROOT + 'demo/fixtures/rules.json', 'utf8'));
const realRules = existsSync(ROOT + 'engine/rules')
  ? readdirSync(ROOT + 'engine/rules').filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(ROOT + 'engine/rules/' + f, 'utf8')))
  : [];

const datasets = [
  ['demo:week2', 'demo/fixtures/week2.json', demoRules],
  ['demo:midterms', 'demo/fixtures/midterms.json', demoRules],
  ['demo:finals', 'demo/fixtures/finals.json', demoRules],
];
if (existsSync(ROOT + 'data/canvas-term239.json')) {
  datasets.push(['real', 'data/canvas-term239.json', realRules]);
}

let checks = 0;
const bad = [];
const near = (a, b) => (a === null || b === null) ? a === b : Math.abs(a - b) < 1e-6;
const cmp = (where, field, got, want) => {
  checks++;
  if (!near(got, want)) bad.push(`${where}.${field}: ts=${got} py=${want}`);
};

for (const [label, file, rules] of datasets) {
  const ref = py[label];
  if (!ref) { bad.push(`python produced no results for ${label}`); continue; }
  const dump = JSON.parse(readFileSync(ROOT + file, 'utf8'));

  for (const c of dump.courses) {
    const r = match(c, rules);
    if (!r) continue;
    const ts = evaluate(r, c);
    const want = ref[r.course_code];
    const where = `${label}/${r.course_code}`;
    if (!want) { bad.push(`no python result for ${where}`); continue; }

    for (const f of ['settled_pct', 'earned_pct', 'floor', 'ceiling', 'on_pace']) {
      cmp(where, f, ts[f], want[f]);
    }
    for (const f of ['floor_letter', 'ceiling_letter', 'on_pace_letter']) {
      checks++;
      if (ts[f] !== want[f]) bad.push(`${where}.${f}: ts=${ts[f]} py=${want[f]}`);
    }
    cmp(where, 'need_A', ts.needed_for('A'), want.need_A);
    cmp(where, 'need_B', ts.needed_for('B'), want.need_B);
    cmp(where, 'slack_A', ts.slack_for('A'), want.slack_A);
    checks++;
    if (ts.warnings.length !== want.warnings) {
      bad.push(`${where}.warnings: ts=${ts.warnings.length} py=${want.warnings}`);
    }
    for (const rate of [0, 0.5, 0.7, 0.9, 1.0]) {
      cmp(where, `project@${rate}`, project(ts, rate),
          want.project[String(Math.round(rate * 100))]);
    }
    for (const g of ts.groups) {
      const pg = want.groups[g.name];
      if (!pg) { bad.push(`${where}: python has no group ${g.name}`); continue; }
      cmp(where, `${g.name}.weight`, g.weight, pg[0]);
      cmp(where, `${g.name}.scored`, g.scored_count, pg[1]);
      cmp(where, `${g.name}.fraction`, g.earned_fraction, pg[2]);
      cmp(where, `${g.name}.settled`, g.settled_weight, pg[3]);
      cmp(where, `${g.name}.remaining`, g.remaining_weight, pg[4]);
    }
  }
}

console.log(`${checks} values compared across ${datasets.length} datasets`);
if (bad.length) {
  bad.slice(0, 25).forEach((b) => console.log('  MISMATCH ' + b));
  if (bad.length > 25) console.log(`  ...and ${bad.length - 25} more`);
  process.exit(1);
}
console.log('PARITY OK — the TypeScript engine matches the Python engine exactly');
