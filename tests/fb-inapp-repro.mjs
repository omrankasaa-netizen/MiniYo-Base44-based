// Repro for the Facebook / Instagram in-app WebView "stuck loading" bug.
//
// Simulates the blocked-storage environment of the FB in-app browser:
//   - WebKit engine (same as iOS)
//   - Facebook iOS user-agent (FBAN/FBIOS)
//   - localStorage / sessionStorage / document.cookie getters that throw
//     SecurityError on any access (matching the WebView's privacy partitioning)
//
// Serves the built app from ./dist and asserts the homepage FULLY renders
// (real content, not the ~149-char blank/error shell).
//
// Usage: node tests/fb-inapp-repro.mjs
// Requires: a production build in ./dist (npm run build) and Playwright WebKit.

import { webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const FB_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.0.0;FBBV/1;FBDV/iPhone15,2]';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml',
};

// Minimal static server with SPA history fallback (mirrors server/index.js).
function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      // Stub the app's own API so the SPA boots against realistic JSON instead
      // of the SPA-fallback HTML (which would break array-shaped responses).
      if (urlPath.startsWith('/api/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(urlPath.startsWith('/api/auth/me') ? 'null' : '[]');
        return;
      }
      let filePath = join(DIST, urlPath === '/' ? 'index.html' : urlPath);
      try {
        if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html');
      } catch {
        filePath = join(DIST, 'index.html'); // SPA fallback
      }
      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// Init script injected before any app code runs: make every storage surface
// throw SecurityError, exactly like the FB in-app WebView under lockdown.
const BLOCK_STORAGE = `
  (function () {
    var boom = function () { throw new DOMException('The operation is insecure.', 'SecurityError'); };
    var throwingStorage = new Proxy({}, {
      get: function () { return boom; },
      set: function () { boom(); },
    });
    try {
      Object.defineProperty(window, 'localStorage', { configurable: true, get: boom });
      Object.defineProperty(window, 'sessionStorage', { configurable: true, get: boom });
    } catch (e) {}
    try {
      Object.defineProperty(document, 'cookie', {
        configurable: true, get: boom, set: boom,
      });
    } catch (e) {}
    // Keep a reference so lint doesn't flag the unused proxy.
    window.__throwingStorage = throwingStorage;
  })();
`;

async function run() {
  const { server, port } = await startServer();
  const browser = await webkit.launch();
  const context = await browser.newContext({ userAgent: FB_UA });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  await page.addInitScript(BLOCK_STORAGE);

  await page.goto(`http://127.0.0.1:${port}/?fbclid=TEST123`, { waitUntil: 'networkidle' });
  // Give React a moment to mount / crash.
  await page.waitForTimeout(1500);

  const rootText = (await page.locator('#root').innerText().catch(() => '')) || '';
  const bodyLen = rootText.trim().length;
  const hasErrorShell =
    rootText.includes('Something went wrong') || rootText.includes('unexpected error');

  console.log('User-Agent   :', FB_UA.slice(0, 60) + '...');
  console.log('#root length :', bodyLen, 'chars');
  console.log('Error shell  :', hasErrorShell);
  console.log('Console errs :', consoleErrors.length);
  if (consoleErrors.length) console.log('  ', consoleErrors.slice(0, 5).join('\n   '));

  await browser.close();
  server.close();

  // Pass criteria: real content rendered, no error boundary shell, no
  // SecurityError bubbling to the console.
  const securityError = consoleErrors.some((e) => /SecurityError|operation is insecure/i.test(e));
  const ok = bodyLen > 300 && !hasErrorShell && !securityError;
  console.log('\nRESULT       :', ok ? 'PASS ✅ homepage rendered under blocked storage' : 'FAIL ❌ app did not render');
  process.exit(ok ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); });
