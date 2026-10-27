// Runs every tests/*.test.mjs file in turn. `npm test -- node` skips the browser tests.
// Each test file exports `tests`: an array of [name, async fn]. Browser test files also
// export `browser = true` and get a Playwright page (see tests/harness.mjs), once for each
// of their `pages` (default: dev.html and, when it has been built, index.html).

import { readdirSync, existsSync } from 'node:fs';
import { withPage } from './harness.mjs';

const onlyNode = process.argv.includes('node');
let failed = 0;
let passed = 0;
for (const file of readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.test.mjs')).sort()) {
  const mod = await import(`./${file}`);
  if (mod.browser && onlyNode) continue;
  const run = (label) => async (page) => {
    for (const [name, fn] of mod.tests) {
      try {
        await fn(page);
        passed++;
        console.log(`  ok    ${label}: ${name}`);
      } catch (e) {
        failed++;
        console.log(`  FAIL  ${label}: ${name}\n        ${e.stack?.split('\n').slice(0, 3).join('\n        ')}`);
      }
    }
  };
  if (!mod.browser) await run(file)();
  else for (const page of (mod.pages ?? ['dev.html', 'index.html']).filter((p) => existsSync(new URL(`../${p.replace(/^\/\/[^/]+\//, '').split('?')[0]}`, import.meta.url)))) await withPage(page, run(`${file} on ${page}`));
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
