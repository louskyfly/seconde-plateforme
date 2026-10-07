export const POSTGRES_SCHEMA = `
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  class_name TEXT DEFAULT 'Seconde 9',
  delegate_name TEXT DEFAULT 'Lucas',
  delegate_link_token TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  accent_color TEXT DEFAULT '#3b5ba6',
  home_info TEXT DEFAULT '',
  home_image TEXT,
  season_theme TEXT DEFAULT 'aucun',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  importance TEXT NOT NULL DEFAULT 'normal',
  author TEXT DEFAULT 'Délégué',
  attachment_url TEXT,
  image TEXT,
  published BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ideas
CREATE TABLE IF NOT EXISTS ideas (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'classe',
  anonymous BOOLEAN DEFAULT FALSE,
  author_name TEXT,
  status TEXT DEFAULT 'a_etudier',
  delegate_response TEXT,
  delegate_replied_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS idea_replies (
  id BIGSERIAL PRIMARY KEY,
  idea_id BIGINT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_name TEXT NOT NULL,
  fingerprint TEXT,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idea_replies_idea ON idea_replies(idea_id, id);

-- Messages (arbitrage)
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'autre',
  anonymous BOOLEAN DEFAULT FALSE,
  author_name TEXT,
  status TEXT DEFAULT 'nouveau',
  fingerprint TEXT,
  delegate_reply TEXT,
  replied_at TIMESTAMP WITH TIME ZONE,
  response_read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Polls
CREATE TABLE IF NOT EXISTS polls (
  id BIGSERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  allow_multiple BOOLEAN DEFAULT FALSE,
  show_results BOOLEAN DEFAULT TRUE,
  anonymous BOOLEAN DEFAULT TRUE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS poll_options (
  id BIGSERIAL PRIMARY KEY,
  poll_id BIGINT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  position INTEGER
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id BIGSERIAL PRIMARY KEY,
  poll_id BIGINT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id BIGINT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  voter_fingerprint TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Events (calendrier)
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'evenement',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Revision sessions
CREATE TABLE IF NOT EXISTS revision_sessions (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'autre',
  date TEXT NOT NULL,
  time TEXT,
  duration INTEGER NOT NULL DEFAULT 60,
  location TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_by_fingerprint TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revision_sessions_date ON revision_sessions(date);

-- Resources
CREATE TABLE IF NOT EXISTS resources (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  subject TEXT NOT NULL DEFAULT 'autre',
  file_url TEXT,
  link_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'en_preparation',
  date TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Visits
CREATE TABLE IF NOT EXISTS visits (
  fingerprint TEXT NOT NULL,
  day TEXT NOT NULL,
  page TEXT,
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  hits INTEGER DEFAULT 1,
  PRIMARY KEY (fingerprint, day)
);

CREATE INDEX IF NOT EXISTS idx_visits_day ON visits(day);

-- Students
CREATE TABLE IF NOT EXISTS students (
  id BIGSERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birthday TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Birthdays
CREATE TABLE IF NOT EXISTS birthdays (
  fingerprint TEXT PRIMARY KEY,
  date_mmdd TEXT NOT NULL,
  first_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Student groups
CREATE TABLE IF NOT EXISTS student_groups (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  is_private BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'en_attente',
  created_by_fingerprint TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validated_at TIMESTAMP WITH TIME ZONE,
  validated_by TEXT
);

CREATE TABLE IF NOT EXISTS student_group_members (
  id BIGSERIAL PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  member_name TEXT,
  member_key TEXT,
  added_by_fingerprint TEXT,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_member_student
  ON student_group_members(group_id, student_id) WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_member_key
  ON student_group_members(group_id, member_key);

CREATE TABLE IF NOT EXISTS student_group_validated (
  student_id BIGINT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  group_id BIGINT NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE
);

-- Admin login attempts
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip_address TEXT NOT NULL,
  attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  success BOOLEAN DEFAULT FALSE
);

-- Push subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Announcement reactions
CREATE TABLE IF NOT EXISTS announcement_reactions (
  id BIGSERIAL PRIMARY KEY,
  announcement_id BIGINT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  reactor_fingerprint TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(announcement_id, reaction, reactor_fingerprint)
);

-- Maintenance log
CREATE TABLE IF NOT EXISTS maintenance_log (
  id BIGSERIAL PRIMARY KEY,
  active BOOLEAN NOT NULL,
  message TEXT,
  activated_by TEXT,
  activated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deactivated_by TEXT,
  deactivated_at TIMESTAMP WITH TIME ZONE
);

-- Admin log
CREATE TABLE IF NOT EXISTS admin_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id BIGINT,
  detail TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat users
CREATE TABLE IF NOT EXISTS chat_users (
  id BIGSERIAL PRIMARY KEY,
  display_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'student',
  fingerprint TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
  id BIGSERIAL PRIMARY KEY,
  title TEXT,
  is_group BOOLEAN DEFAULT TRUE,
  created_by BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  group_id BIGINT REFERENCES student_groups(id) ON DELETE SET NULL,
  closed BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_group ON chat_conversations(group_id);

-- Chat members
CREATE TABLE IF NOT EXISTS chat_members (
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_read_message_id BIGINT DEFAULT 0,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id, id DESC);

-- Chat reactions
CREATE TABLE IF NOT EXISTS chat_reactions (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  user_id BIGINT NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, reaction, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_msg ON chat_reactions(message_id);

-- Sheets (fiches de révision)
CREATE TABLE IF NOT EXISTS sheets (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'autre',
  class_level TEXT,
  description TEXT DEFAULT '',
  author_name TEXT,
  author_fingerprint TEXT,
  file_data TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size BIGINT DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'image',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sheets_subject ON sheets(subject);
CREATE INDEX IF NOT EXISTS idx_sheets_created ON sheets(created_at DESC);

-- Session table for express-session
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`;