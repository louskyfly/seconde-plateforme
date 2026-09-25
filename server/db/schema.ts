import Database from 'better-sqlite3';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  class_name TEXT DEFAULT 'Seconde 9',
  delegate_name TEXT DEFAULT 'Lucas',
  delegate_link_token TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  accent_color TEXT DEFAULT '#3b5ba6',
  home_info TEXT DEFAULT '',
  home_image TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  importance TEXT NOT NULL DEFAULT 'normal',
  author TEXT DEFAULT 'Délégué',
  attachment_url TEXT,
  image TEXT,
  published INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'classe',
  anonymous INTEGER DEFAULT 0,
  author_name TEXT,
  status TEXT DEFAULT 'a_etudier',
  delegate_response TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'autre',
  anonymous INTEGER DEFAULT 0,
  author_name TEXT,
  status TEXT DEFAULT 'nouveau',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  allow_multiple INTEGER DEFAULT 0,
  show_results INTEGER DEFAULT 1,
  anonymous INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME
);

CREATE TABLE IF NOT EXISTS poll_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  option_id INTEGER NOT NULL,
  voter_fingerprint TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'evenement',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  subject TEXT NOT NULL DEFAULT 'autre',
  file_url TEXT,
  link_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'en_preparation',
  date TEXT,
  image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  success INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcement_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  announcement_id INTEGER NOT NULL,
  reaction TEXT NOT NULL,
  reactor_fingerprint TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(announcement_id, reaction, reactor_fingerprint),
  FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS maintenance_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  active INTEGER NOT NULL,
  message TEXT,
  activated_by TEXT,
  activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deactivated_by TEXT,
  deactivated_at DATETIME
);

CREATE TABLE IF NOT EXISTS admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  detail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'student',
  fingerprint TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  is_group INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_members (
  conversation_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_read_message_id INTEGER DEFAULT 0,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES chat_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  content TEXT DEFAULT '',
  image TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  deleted_by TEXT,
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES chat_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'autre',
  class_level TEXT,
  description TEXT DEFAULT '',
  author_name TEXT,
  author_fingerprint TEXT,
  file_data TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size INTEGER DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'image',
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sheets_subject ON sheets(subject);
CREATE INDEX IF NOT EXISTS idx_sheets_created ON sheets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_chat_users_fp ON chat_users(fingerprint);
`;

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (c) => c.name
  );
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function initDatabase(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
  ensureColumn(db, 'announcements', 'image', 'TEXT');
  ensureColumn(db, 'settings', 'home_image', 'TEXT');
}

/**
 * Crée le groupe de classe unique et le compte du délégué.
 * Le modèle (conversations + membres) reste prêt pour des conversations privées plus tard.
 */
export function ensureDefaultChatGroup(db: Database.Database): void {
  const settings = db.prepare('SELECT class_name, delegate_name FROM settings WHERE id = 1').get() as
    | { class_name: string; delegate_name: string }
    | undefined;

  const delegateName = settings?.delegate_name || 'Délégué';
  const className = settings?.class_name || 'La classe';

  let delegate = db.prepare(`SELECT id FROM chat_users WHERE kind = 'delegate'`).get() as
    | { id: number }
    | undefined;
  if (!delegate) {
    const inserted = db
      .prepare(`INSERT INTO chat_users (display_name, kind, fingerprint) VALUES (?, 'delegate', NULL)`)
      .run(delegateName);
    delegate = { id: Number(inserted.lastInsertRowid) };
  } else {
    db.prepare('UPDATE chat_users SET display_name = ? WHERE id = ?').run(delegateName, delegate.id);
  }

  let conversation = db.prepare(`SELECT id FROM chat_conversations WHERE is_group = 1 LIMIT 1`).get() as
    | { id: number }
    | undefined;
  if (!conversation) {
    const inserted = db
      .prepare(`INSERT INTO chat_conversations (title, is_group, created_by) VALUES (?, 1, ?)`)
      .run(`${className} — Groupe`, delegate!.id);
    conversation = { id: Number(inserted.lastInsertRowid) };
  }

  db.prepare(
    `INSERT OR IGNORE INTO chat_members (conversation_id, user_id) VALUES (?, ?)`
  ).run(conversation!.id, delegate!.id);
}