import session from 'express-session';
import type { SessionData } from 'express-session';
import { pool } from './pg.js';

const TABLE = 'sessions';

export class PostgresSessionStore extends session.Store {
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initializeTable();
    this.startCleanup();
  }

  private async initializeTable(): Promise<void> {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${TABLE} (
          sid VARCHAR NOT NULL PRIMARY KEY,
          sess JSON NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON ${TABLE}(expires_at)`);
    } catch (err) {
      console.error('Failed to initialize sessions table:', err);
    }
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        await pool.query(`DELETE FROM ${TABLE} WHERE expires_at <= NOW()`);
      } catch {
        // cleanup is opportunistic
      }
    }, 15 * 60 * 1000); // every 15 minutes
  }

  override get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void {
    pool.query(
      `SELECT sess, expires_at FROM ${TABLE} WHERE sid = $1`,
      [sid]
    ).then((result) => {
      if (!result.rows[0]) {
        callback(null, null);
        return;
      }
      const row = result.rows[0];
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        pool.query(`DELETE FROM ${TABLE} WHERE sid = $1`, [sid]).then(() => {
          callback(null, null);
        }).catch((err) => callback(err));
        return;
      }
      try {
        const sessionData = typeof row.sess === 'string' ? JSON.parse(row.sess) : row.sess;
        callback(null, sessionData as SessionData);
      } catch (err) {
        callback(err);
      }
    }).catch((err) => callback(err));
  }

  override set(sid: string, sessionData: SessionData, callback?: (err?: unknown) => void): void {
    const maxAge = sessionData.cookie?.maxAge ?? 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + maxAge);
    
    pool.query(
      `INSERT INTO ${TABLE} (sid, sess, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expires_at = EXCLUDED.expires_at`,
      [sid, JSON.stringify(sessionData), expiresAt]
    ).then(() => {
      callback?.();
    }).catch((err) => {
      callback?.(err);
    });
  }

  override destroy(sid: string, callback?: (err?: unknown) => void): void {
    pool.query(`DELETE FROM ${TABLE} WHERE sid = $1`, [sid]).then(() => {
      callback?.();
    }).catch((err) => callback?.(err));
  }

  override touch(sid: string, sessionData: SessionData, callback?: (err?: unknown) => void): void {
    const maxAge = sessionData.cookie?.maxAge ?? 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + maxAge);
    
    pool.query(
      `UPDATE ${TABLE} SET sess = $1, expires_at = $2 WHERE sid = $3`,
      [JSON.stringify(sessionData), expiresAt, sid]
    ).then(() => {
      callback?.();
    }).catch((err) => callback?.(err));
  }

  async clearAll(): Promise<void> {
    await pool.query(`DELETE FROM ${TABLE}`);
  }

  async length(): Promise<number> {
    const result = await pool.query(`SELECT COUNT(*) AS count FROM ${TABLE}`);
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}