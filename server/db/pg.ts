import pg from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getConfig() {
  if (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) {
    const url = new URL(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL!);
    return {
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      database: url.pathname.slice(1),
      user: url.username,
      password: url.password,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  }

  return {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'seconde',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 20,
  };
}

const config = getConfig();
export const pool = new Pool(config);

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function transformRow<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[toCamelCase(key)] = value;
  }
  return result as T;
}

function transformRows<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((row): T => transformRow<T>(row));
}

export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return transformRows<T>(result.rows);
  } finally {
    client.release();
  }
}

export async function queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

export async function execute(sql: string, params: unknown[] = []): Promise<{ rowCount: number; lastInsertId: number | bigint }> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return {
      rowCount: result.rowCount ?? 0,
      lastInsertId: result.rows[0]?.id ?? 0,
    };
  } finally {
    client.release();
  }
}

export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function close(): Promise<void> {
  await pool.end();
}