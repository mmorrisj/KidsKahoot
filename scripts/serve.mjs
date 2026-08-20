/**
 * The development server behind `npm start`.
 *
 * This exists for one reason: browsers cache ES modules, and a plain static
 * server lets them. Pull a change, reload, and you can still be looking at the
 * previous version of the app with no hint that anything is stale — which is a
 * genuinely confusing way to lose an afternoon. Everything here is served
 * `no-store`, so a reload always shows what is on disk.
 *
 * No dependencies, to keep `npm install` optional for anyone who just wants to
 * play the game.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = path.join(ROOT, requested);

  // Never serve anything outside the project, however the path is spelled.
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain' });
      res.end(err.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      // The whole point of this file.
      'cache-control': 'no-store, must-revalidate',
    });
    res.end(body);
  });
});

server.listen(PORT, () => {
  process.stdout.write(`Kids Quiz Quest running at http://localhost:${PORT}\n`
    + 'Serving with no-store, so a reload always shows the current files.\n');
});
