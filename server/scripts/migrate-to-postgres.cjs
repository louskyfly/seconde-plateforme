const Database = require('better-sqlite3');
const pg = require('pg');
const { Pool } = pg;
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SOURCE_DB_PATH = process.env.SOURCE_DB_PATH || './data/seconde.db';

async function migrate() {
  console.log('Starting migration from SQLite to PostgreSQL...');
  console.log('Source DB:', SOURCE_DB_PATH);

  if (!fs.existsSync(SOURCE_DB_PATH)) {
    console.error('Source database not found:', SOURCE_DB_PATH);
    process.exit(1);
  }

  const sqlite = new Database(SOURCE_DB_PATH, { readonly: true });

  const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
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
    for (const table of tables) {
      console.log(`\nMigrating table: ${table}...`);

      const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all();
      if (columns.length === 0) {
        console.log(`  Table ${table} doesn't exist in source, skipping`);
        continue;
      }

      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      console.log(`  Found ${rows.length} rows`);

      if (rows.length === 0) {
        continue;
      }

      const columnNames = columns.map(c => c.name).join(', ');
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const insertSql = `INSERT INTO ${table} (${columnNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (const row of rows) {
          const values = Object.values(row);
          await client.query(`INSERT INTO ${table} (${columnNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
        }

        await client.query('COMMIT');
        console.log(`  Inserted ${rows.length} rows`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  Error migrating ${table}:`, err.message);
      } finally {
        client.release();
      }
    }

    console.log('\n=== Migration completed ===');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    sqlite.close();
    await pool.end();
  }
}

migrate();