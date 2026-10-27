// Test helpers: a tiny static server for the repo and a headless Chromium page on it.
// WebGL runs on SwiftShader (software), so frame rates here say nothing about real devices.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((ok) => server.listen(0, () => ok(server)));
}

// Opens `page` (e.g. dev.html) and passes a Playwright page to `fn`. Console errors and
// page errors are collected on page.errors. `//host/page` opens it at that host name instead
// of localhost (still this server), to see the page as the live site would.
export async function withPage(file, fn, viewport = { width: 1280, height: 720 }) {
  const { chromium } = await import('playwright');
  const server = await serve();
  const [, host = 'localhost', path = file] = file.match(/^\/\/([^/]+)\/(.*)$/) ?? [];
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--host-resolver-rules=MAP ${host} 127.0.0.1`],
  });
  try {
    const page = await browser.newPage({ viewport });
    page.errors = [];
    page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
    page.on('pageerror', (e) => page.errors.push(e.message));
    await page.goto(`http://${host}:${server.address().port}/${path}`);
    await page.waitForFunction(() => window.doom && !document.getElementById('boot'), null, { timeout: 30000 });
    await fn(page);
  } finally {
    await browser.close();
    server.close();
  }
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
