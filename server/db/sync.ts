/**
 * Synchronous better-sqlite3 database instance for routes not yet migrated.
 * Only works with SQLite (not PostgreSQL).
 * 
 * Usage:
 *   import db from '../../db/sync.js';
 *   const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
 *   const rows = db.prepare('SELECT * FROM users').all();
 *   db.prepare('INSERT INTO users (name) VALUES (?)').run('John');
 * 
 * For PostgreSQL, use async helpers from '../db/index.js':
 *   import { query, execute } from '../../db/index.js';
 *   const rows = await query('SELECT * FROM users WHERE id = ?', [id]);
 */

function getSyncDbInternal(): any {
  const usePostgres = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.PGHOST;
  if (usePostgres) {
    throw new Error('Synchronous database API not available with PostgreSQL. Use async helpers (query, execute, etc.) from "../db/index.js" instead.');
  }

  const { default: Database } = require('better-sqlite3');
  const fs = require('fs');
  const path = require('path');
  
  const DEFAULT_DB_PATH = './data/seconde.db';
  const RENDER_DISK_PATH = '/var/data';
  
  function candidatePaths(): string[] {
    const candidates: string[] = [];
    const configured = process.env.DB_PATH?.trim();
    if (configured) candidates.push(path.resolve(configured));
    if (process.env.RENDER) candidates.push(path.join(RENDER_DISK_PATH, 'seconde.db'));
    candidates.push(path.resolve(DEFAULT_DB_PATH));
    return [...new Set(candidates)];
  }

  const candidates = candidatePaths();
  for (const candidate of candidates) {
    try {
      const fs = require('fs');
      fs.mkdirSync(path.dirname(candidate), { recursive: true });
      const { default: Database } = require('better-sqlite3');
      const db = new Database(candidate);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      return db;
    } catch {
      continue;
    }
  }
  throw new Error('Impossible d\'ouvrir la base de données SQLite');
}

/**
 * Synchronous better-sqlite3 database instance for routes not yet migrated.
 * Only works with SQLite (not PostgreSQL).
 * 
 * Usage:
 *   import db from '../../db/sync.js';
 *   const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
 *   const rows = db.prepare('SELECT * FROM users').all();
 *   db.prepare('INSERT INTO users (name) VALUES (?)').run('John');
 * 
 * For PostgreSQL, use async helpers from '../db/index.js':
 *   import { query, execute } from '../../db/index.js';
 *   const rows = await query('SELECT * FROM users WHERE id = ?', [id]);
 */

export default new Proxy({}, {
  get(_target: any, prop: string | symbol) {
    if (prop === 'then' || prop === 'catch' || prop === Symbol.toPrimitive || prop === Symbol.asyncIterator) {
      return undefined;
    }
    return (...args: any[]) => {
      const db = getSyncDbInternal();
      const method = db[prop];
      if (typeof method === 'function') {
        return method.apply(db, args);
      }
      return db[prop];
    };
  }
}) as any;