import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pool, query, queryOne, execute, transaction, close } from './pg.js';
import { initDatabase } from './schema.js';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DB_PATH = './data/seconde.db';
const RENDER_DISK_PATH = '/var/data';

let dbType: 'postgres' | 'sqlite' = 'sqlite';
let dbPathValue = DEFAULT_DB_PATH;
export let isPersistentStorage = false;

function hasPostgresConfig(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.PGHOST);
}

function candidatePaths(): string[] {
  const candidates: string[] = [];
  const configured = process.env.DB_PATH?.trim();
  if (configured) candidates.push(path.resolve(configured));
  if (process.env.RENDER) candidates.push(path.join(RENDER_DISK_PATH, 'seconde.db'));
  candidates.push(path.resolve(DEFAULT_DB_PATH));
  return [...new Set(candidates)];
}

async function initializePostgres(): Promise<void> {
  await pool.query('SELECT 1');
  const { POSTGRES_SCHEMA } = await import('./postgres-schema.js');
  await pool.query(POSTGRES_SCHEMA);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      expires_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
  console.log('PostgreSQL connected and schema initialized');
}

function initializeSqlite(): { dbPath: string; durable: boolean } {
  const candidates = candidatePaths();
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      fs.mkdirSync(path.dirname(candidate), { recursive: true });
      return {
        dbPath: candidate,
        durable: !process.env.RENDER || candidate.startsWith(RENDER_DISK_PATH),
      };
    } catch (err) {
      lastError = err as Error;
    }
  }

  throw new Error(
    `Impossible d'ouvrir la base de données.\nDernière erreur: ${lastError?.message}`
  );
}

export async function initializeDatabase(): Promise<void> {
  if (hasPostgresConfig()) {
    try {
      await initializePostgres();
      isPersistentStorage = true;
      return;
    } catch (err) {
      throw new Error(`Connexion PostgreSQL impossible : ${(err as Error).message}`);
    }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL ou SUPABASE_DB_URL est obligatoire en production pour garantir la persistance des données.');
  }

  const sqlite = initializeSqlite();
  isPersistentStorage = sqlite.durable;
  console.log(`Using SQLite database: ${sqlite.dbPath} (persistent: ${sqlite.durable})`);
}

export function isPostgres(): boolean {
  return hasPostgresConfig();
}

export function isSqlite(): boolean {
  return !isPostgres();
}

export function getDbPath(): string {
  return DEFAULT_DB_PATH;
}

// Export async pool and helpers
export { pool, query, queryOne, execute, transaction, close };

// Synchronous database for SQLite mode (better-sqlite3)
let _sqliteDb: any = null;

function getSyncDb(): any {
  const usePostgres = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.PGHOST;
  if (usePostgres) {
    throw new Error('Synchronous database API not available with PostgreSQL. Use async helpers (query, execute, etc.) instead.');
  }

  if (!_sqliteDb) {
    const Database = require('better-sqlite3');
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
        fs.mkdirSync(path.dirname(candidate), { recursive: true });
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
  return _sqliteDb;
}

// Synchronous database instance for SQLite mode (better-sqlite3)
const syncDb = new Proxy({}, {
  get(_target: any, prop: string | symbol) {
    if (prop === 'then' || prop === 'catch' || prop === Symbol.toPrimitive || prop === Symbol.asyncIterator) {
      return undefined;
    }
    return (...args: any[]) => {
      const db = getSyncDb();
      const method = db[prop];
      if (typeof method === 'function') {
        return method.apply(db, args);
      }
      return db[prop];
    };
  }
}) as any;

export default syncDb;