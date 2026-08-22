/**
 * The game server: static files, the live-game WebSocket hub, and the
 * all-time leaderboard.
 *
 *   npm start                # http://localhost:8080
 *   PORT=9000 npm start      # pick a port
 *
 * Solo pass-the-device play still works from any static file server — this
 * server is only required for hosting games that other devices join, and for
 * the leaderboard that tracks players across games.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createHub } from './server/live.js';
import { createStatsStore } from './server/stats.js';
import { generateQuestions } from './src/lib/generator.js';
import { createRng, randomSeed } from './src/lib/rng.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);
const STATS_FILE = path.join(ROOT, 'data', 'kids-quiz-quest.db');

// ------------------------------------------------------------- static files

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

const stats = createStatsStore(STATS_FILE);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/stats') {
    res.writeHead(200, { 'content-type': MIME['.json'] });
    res.end(JSON.stringify({ players: stats.standings() }));
    return;
  }

  const wanted = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(ROOT, path.normalize(wanted));
  // path.normalize collapses any ../ tricks; anything outside the folder is a
  // 404, and so is the folder holding the leaderboard file.
  if (!file.startsWith(ROOT + path.sep)
    || file.startsWith(path.join(ROOT, 'data') + path.sep)
    || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
    // Browsers cache ES modules hard. Without this, pulling a change and
    // reloading can still show the previous version of the app with nothing to
    // say it is stale — which reads as a feature having silently gone missing.
    'cache-control': 'no-store, must-revalidate',
  });
  fs.createReadStream(file).pipe(res);
});

// ---------------------------------------------------------------- live games

const hub = createHub({
  makeQuestions: ({ topics, tiers, mapUse, count }) => generateQuestions({
    rng: createRng(randomSeed()),
    topics,
    tiers,
    mapUse,
    count,
  }),
  onFinished: (game) => stats.record(game),
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  const conn = hub.connect((message) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  });
  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    conn.handle(message);
  });
  ws.on('close', () => conn.close());
  ws.on('error', () => conn.close());
});

server.listen(PORT, () => {
  process.stdout.write(`Kids Quiz Quest at http://localhost:${PORT}\n`);
});
