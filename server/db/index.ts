import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase } from './schema.js';

const DEFAULT_DB_PATH = './data/seconde.db';

const dbPath = path.resolve(process.env.DB_PATH ?? DEFAULT_DB_PATH);
const dataDir = path.dirname(dbPath);

fs.mkdirSync(dataDir, { recursive: true });

const database = new Database(dbPath);

database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');

initDatabase(database);

export default database;