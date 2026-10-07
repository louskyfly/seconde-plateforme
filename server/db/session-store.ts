import session from 'express-session';
import type { SessionData } from 'express-session';
import type Database from 'better-sqlite3';
import { pool } from './pg.js';

/**
 * Store de session adossé à SQLite.
 *
 * `express-session` utilise `MemoryStore` par défaut : les sessions vivent dans
 * la mémoire du processus. Sur Render, qui redémarre régulièrement (plan
 * gratuit), chaque redémarrage vidait toutes les sessions et le délégué se
 * retrouvait déconnecté au milieu de sa saisie — ses enregistrements
 * échouaient ensuite sur un 401 incompréhensible. Stocker les sessions dans la
 * base résout le problème et fonctionne aussi avec plusieurs instances.
 */
const TABLE = 'sessions';

export class SqliteSessionStore extends session.Store {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    super();
    this.db = db;

    db.exec(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (
         sid TEXT PRIMARY KEY,
         data TEXT NOT NULL,
         expires_at INTEGER NOT NULL
       )`
    );
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON ${TABLE}(expires_at)`);
    this.cleanupExpired();
  }

  private cleanupExpired(): void {
    try {
      this.db.prepare(`DELETE FROM ${TABLE} WHERE expires_at <= ?`).run(Date.now());
    } catch {
      /* le nettoyage est opportuniste : son échec n'empêche pas les sessions */
    }
  }

  override get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void {
    try {
      const row = this.db
        .prepare(`SELECT data, expires_at FROM ${TABLE} WHERE sid = ?`)
        .get(sid) as { data: string; expires_at: number } | undefined;

      if (!row) {
        callback(null, null);
        return;
      }
      if (row.expires_at <= Date.now()) {
        this.db.prepare(`DELETE FROM ${TABLE} WHERE sid = ?`).run(sid);
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.data) as SessionData);
    } catch (err) {
      callback(err);
    }
  }

  override set(sid: string, sessionData: SessionData, callback?: (err?: unknown) => void): void {
    try {
      // 24 h par défaut, cohérent avec le `maxAge` du cookie.
      const maxAge = sessionData.cookie?.maxAge ?? 24 * 60 * 60 * 1000;
      this.db
        .prepare(
          `INSERT INTO ${TABLE} (sid, data, expires_at) VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`
        )
        .run(sid, JSON.stringify(sessionData), Date.now() + maxAge);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  override destroy(sid: string, callback?: (err?: unknown) => void): void {
    try {
      this.db.prepare(`DELETE FROM ${TABLE} WHERE sid = ?`).run(sid);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  override touch(sid: string, sessionData: SessionData, callback?: (err?: unknown) => void): void {
    try {
      const maxAge = sessionData.cookie?.maxAge ?? 24 * 60 * 60 * 1000;
      this.db
        .prepare(`UPDATE ${TABLE} SET data = ?, expires_at = ? WHERE sid = ?`)
        .run(JSON.stringify(sessionData), Date.now() + maxAge, sid);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  /** Purge immédiate : utile aux tests et après un changement de mot de passe. */
  clearAll(): void {
    this.db.prepare(`DELETE FROM ${TABLE}`).run();
  }

  get size(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM ${TABLE}`).get() as { count: number };
    return row.count;
  }
}

export class PostgresSessionStore extends session.Store {
  override get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void {
    void pool
      .query<{ data: SessionData; expires_at: string | number }>(
        'SELECT data, expires_at FROM sessions WHERE sid = $1',
        [sid]
      )
      .then(async (result) => {
        const row = result.rows[0];
        if (!row || Number(row.expires_at) <= Date.now()) {
          if (row) await pool.query('DELETE FROM sessions WHERE sid = $1', [sid]);
          callback(null, null);
          return;
        }
        callback(null, row.data);
      })
      .catch((err) => callback(err));
  }

  override set(sid: string, sessionData: SessionData, callback?: (err?: unknown) => void): void {
    const maxAge = sessionData.cookie?.maxAge ?? 24 * 60 * 60 * 1000;
    void pool
      .query(
        `INSERT INTO sessions (sid, data, expires_at) VALUES ($1, $2::jsonb, $3)
         ON CONFLICT(sid) DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at`,
        [sid, JSON.stringify(sessionData), Date.now() + maxAge]
      )
      .then(() => callback?.())
      .catch((err) => callback?.(err));
  }

  override destroy(sid: string, callback?: (err?: unknown) => void): void {
    void pool
      .query('DELETE FROM sessions WHERE sid = $1', [sid])
      .then(() => callback?.())
      .catch((err) => callback?.(err));
  }

  override touch(sid: string, sessionData: SessionData, callback?: (err?: unknown) => void): void {
    const maxAge = sessionData.cookie?.maxAge ?? 24 * 60 * 60 * 1000;
    void pool
      .query('UPDATE sessions SET data = $1::jsonb, expires_at = $2 WHERE sid = $3', [
        JSON.stringify(sessionData),
        Date.now() + maxAge,
        sid,
      ])
      .then(() => callback?.())
      .catch((err) => callback?.(err));
  }
}

export { session as expressSession };
