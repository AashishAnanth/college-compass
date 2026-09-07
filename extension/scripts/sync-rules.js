/* Builds src/engine/rules.json, which the extension bundles.
 *
 * Your own course rules live in ../engine/rules and are gitignored: they name
 * real courses and carry real Canvas group ids. If none are present — a fresh
 * clone, or CI — fall back to the committed example so the build still works.
 */
const fs = require('fs');
const path = require('path');

const personal = path.resolve(__dirname, '../../engine/rules');
const out = path.resolve(__dirname, '../src/engine/rules.json');
const fallback = path.resolve(__dirname, '../src/engine/rules.default.json');

let rules = [];
if (fs.existsSync(personal)) {
  rules = fs.readdirSync(personal)
    .filter((f) => f.endsWith('.json') && f !== 'example.json')
    .map((f) => JSON.parse(fs.readFileSync(path.join(personal, f), 'utf8')));
}

if (rules.length) {
  fs.writeFileSync(out, JSON.stringify(rules, null, 1));
  console.log(`rules.json <- ${rules.length} course(s) from engine/rules`);
} else {
  fs.copyFileSync(fallback, out);
  console.log('rules.json <- example (no personal rules found)');
}
