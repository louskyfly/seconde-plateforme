const Database = require('better-sqlite3');
const pg = require('pg');
const { Pool } = pg;
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SOURCE_DB_PATH = process.env.SOURCE_DB_PATH || './data/seconde.db';
const sourceIsJson = path.extname(SOURCE_DB_PATH).toLowerCase() === '.json';

async function migrate() {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Set DATABASE_URL or SUPABASE_DB_URL to the target PostgreSQL database.');
  }

  console.log('Starting migration from SQLite to PostgreSQL...');
  console.log('Source DB:', SOURCE_DB_PATH);

  if (!fs.existsSync(SOURCE_DB_PATH)) {
    console.error('Source database not found:', SOURCE_DB_PATH);
    process.exit(1);
  }

  let sqlite;
  let jsonData;
  if (sourceIsJson) {
    jsonData = JSON.parse(fs.readFileSync(SOURCE_DB_PATH, 'utf8'));
    if (!jsonData || typeof jsonData !== 'object' || Array.isArray(jsonData)) {
      throw new Error('JSON backup must contain an object keyed by table name.');
    }
  } else {
    sqlite = new Database(SOURCE_DB_PATH, { readonly: true });
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const tables = [
    'settings',
    'announcements',
    'ideas',
    'idea_replies',
    'messages',
    'polls',
    'poll_options',
    'poll_votes',
    'events',
    'revision_sessions',
    'resources',
    'projects',
    'visits',
    'students',
    'birthdays',
    'student_groups',
    'student_group_members',
    'student_group_validated',
    'admin_login_attempts',
    'push_subscriptions',
    'announcement_reactions',
    'maintenance_log',
    'admin_log',
    'chat_users',
    'chat_conversations',
    'chat_members',
    'chat_messages',
    'chat_reactions',
    'sheets',
    'sessions',
  ];

  try {
    const { POSTGRES_SCHEMA } = await import('../../dist/server/db/postgres-schema.js');
    await pool.query(POSTGRES_SCHEMA);

    if (jsonData) {
      const knownTables = new Set(tables);
      const unsupportedTables = Object.entries(jsonData)
        .filter(([table, rows]) => !knownTables.has(table) && Array.isArray(rows) && rows.length > 0)
        .map(([table]) => table);
      if (unsupportedTables.length > 0) {
        throw new Error(`Backup contains unsupported tables: ${unsupportedTables.join(', ')}`);
      }
    }

    const migrationErrors = [];
    for (const table of tables) {
      console.log(`\nMigrating table: ${table}...`);

      let columns;
      let rows;
      if (sourceIsJson) {
        rows = jsonData[table];
        if (!Array.isArray(rows)) {
          console.log(`  Table ${table} doesn't exist in source, skipping`);
          continue;
        }
        columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        if (rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
          throw new Error(`Invalid rows in JSON table ${table}`);
        }
      } else {
        const sourceColumns = sqlite.prepare(`PRAGMA table_info(${table})`).all();
        if (sourceColumns.length === 0) {
          console.log(`  Table ${table} doesn't exist in source, skipping`);
          continue;
        }
        columns = sourceColumns.map((column) => column.name);
        rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      }

      console.log(`  Found ${rows.length} rows`);

      if (rows.length === 0 || columns.length === 0) {
        continue;
      }

      if (columns.some((column) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column))) {
        throw new Error(`Invalid column name in table ${table}`);
      }
      const columnNames = columns.map((column) => `"${column}"`).join(', ');
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (const row of rows) {
          const values = columns.map((column) => row[column]);
          await client.query(`INSERT INTO ${table} (${columnNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
        }

        await client.query('COMMIT');
        console.log(`  Inserted ${rows.length} rows`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  Error migrating ${table}:`, err.message);
        migrationErrors.push(table);
      } finally {
        client.release();
      }
    }

    for (const table of tables) {
      const result = await pool.query('SELECT pg_get_serial_sequence($1, $2) AS sequence', [table, 'id']);
      const sequence = result.rows[0]?.sequence;
      if (!sequence) continue;

      const maxResult = await pool.query(`SELECT MAX(id) AS max_id FROM ${table}`);
      const maxId = maxResult.rows[0]?.max_id;
      await pool.query('SELECT setval($1::regclass, $2, $3)', [sequence, maxId ?? 1, maxId !== null]);
    }

    if (migrationErrors.length > 0) {
      throw new Error(`Migration failed for: ${migrationErrors.join(', ')}`);
    }
    console.log('\n=== Migration completed ===');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    sqlite?.close();
    await pool.end();
  }
}

migrate();