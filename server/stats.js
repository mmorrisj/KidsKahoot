/**
 * All-time player tracking, so scores mean something across evenings.
 *
 * Players are keyed by lowercased name — this is a family game on a home
 * network, so "the same kid types the same name" is the identity model.
 *
 * Storage is SQLite via node:sqlite (built into Node 22.5+, no dependency to
 * install). Every finished game appends one `games` row plus one `results` row
 * per player, and the leaderboard is computed by query — keeping the full
 * history means later features ("which questions does Maya keep missing?")
 * become new columns and queries rather than a storage rewrite.
 *
 * node:sqlite prints an ExperimentalWarning on Node 22; npm start silences
 * exactly that warning and nothing else.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Open (or create) the store. Pass ':memory:' in tests. */
export function createStatsStore(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS games (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      players   INTEGER NOT NULL,
      played_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS results (
      game_id      INTEGER NOT NULL REFERENCES games(id),
      player       TEXT NOT NULL,
      display_name TEXT NOT NULL,
      score        INTEGER NOT NULL,
      correct      INTEGER NOT NULL,
      wrong        INTEGER NOT NULL,
      best_streak  INTEGER NOT NULL,
      won          INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS results_by_player ON results(player, game_id);
  `);

  const insertGame = db.prepare(
    'INSERT INTO games (name, players, played_at) VALUES (?, ?, ?)');
  const insertResult = db.prepare(`
    INSERT INTO results (game_id, player, display_name, score, correct, wrong, best_streak, won)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  // Latest display_name wins, so a kid who fixes their capitalisation sees it stick.
  const standingsQuery = db.prepare(`
    SELECT
      (SELECT display_name FROM results r2
        WHERE r2.player = r.player ORDER BY r2.game_id DESC LIMIT 1) AS name,
      COUNT(*)         AS games,
      SUM(won)         AS wins,
      SUM(score)       AS totalPoints,
      SUM(correct)     AS correct,
      SUM(wrong)       AS wrong,
      MAX(best_streak) AS bestStreak,
      MAX(g.played_at) AS lastPlayed
    FROM results r JOIN games g ON g.id = r.game_id
    GROUP BY r.player
    ORDER BY totalPoints DESC, wins DESC, correct DESC
  `);

  return {
    /** Fold one finished game in and return the fresh leaderboard. */
    record({ scoreboard, name = 'Geography Quest', at = null }) {
      if (!scoreboard?.length) return this.standings();
      const top = Math.max(...scoreboard.map((p) => p.score));
      const { lastInsertRowid: gameId } = insertGame.run(name, scoreboard.length, at);
      for (const p of scoreboard) {
        // Solo games count for points but not wins — beating nobody is not a win.
        const won = scoreboard.length > 1 && p.score === top ? 1 : 0;
        insertResult.run(gameId, p.name.trim().toLowerCase(), p.name,
          p.score, p.correct, p.wrong, p.bestStreak, won);
      }
      return this.standings();
    },

    /** The leaderboard: every known player, most points first. */
    standings: () => standingsQuery.all(),

    close: () => db.close(),
  };
}
