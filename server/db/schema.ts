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
  delegate_replied_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS idea_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idea_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  author_name TEXT NOT NULL,
  fingerprint TEXT,
  deleted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_idea_replies_idea ON idea_replies(idea_id, id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'autre',
  anonymous INTEGER DEFAULT 0,
  author_name TEXT,
  status TEXT DEFAULT 'nouveau',
  fingerprint TEXT,
  delegate_reply TEXT,
  replied_at DATETIME,
  response_read_at DATETIME,
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
  position INTEGER,
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

-- Sessions de révision planifiées par le délégué.
--
-- Volontairement séparées de la table events : une session de révision a une
-- durée, un lieu et des fiches à travailler, ce qui n'a pas de sens dans le
-- calendrier général. La date est un jour, pas une date-heure : une session
-- commence à l'heure indiquée et finit duration minutes plus tard.
CREATE TABLE IF NOT EXISTS revision_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'autre',
  date TEXT NOT NULL,
  time TEXT,
  duration INTEGER NOT NULL DEFAULT 60,
  location TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_by_fingerprint TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_revision_sessions_date ON revision_sessions(date);

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

-- Visites quotidiennes, pour les statistiques demandées par le délégué.
--
-- L'identité est l'empreinte appareil (voter_fp) déjà utilisée ailleurs, ce qui
-- permet de distinguer « 12 élèves présents » de « 40 ouvertures de page ».
-- Elle est stockée hachée et non en clair : la route des visites s'en charge,
-- donc la base ne contient pas d'identifiant réutilisable ailleurs.
--
-- Une seule ligne par empreinte et par jour : recharger dix fois la page ne
-- gonfle pas le compteur, et le total reste lisible. Les lignes de plus de
-- 90 jours sont supprimées à l'écriture.
--
-- Ni adresse IP ni user-agent ne sont conservés : l'IP serait une donnée
-- personnelle, et le user-agent n'a jamais été affiché.
CREATE TABLE IF NOT EXISTS visits (
  fingerprint TEXT NOT NULL,
  day TEXT NOT NULL,
  page TEXT,
  first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  hits INTEGER DEFAULT 1,
  PRIMARY KEY (fingerprint, day)
);

CREATE INDEX IF NOT EXISTS idx_visits_day ON visits(day);

-- Élèves de la classe. Sert au tableau demandé dans l'onglet Projets, et aux
-- groupes de travail (un élève appartient à au plus un groupe validé).
-- La date d'anniversaire est stockée en MM-JJ : l'année n'a aucune utilité ici.
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birthday TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Anniversaires saisis par les élèves eux-mêmes via leur empreinte (voter_fp).
-- Une ligne par élève : l'empreinte est la clé. Le format est MM-JJ (sans année).
-- Le prénom est stocké pour l'animation collective (pas de nom de famille).
CREATE TABLE IF NOT EXISTS birthdays (
  fingerprint TEXT PRIMARY KEY,
  date_mmdd TEXT NOT NULL,
  first_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_private INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'en_attente',
  created_by_fingerprint TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  validated_at DATETIME,
  validated_by TEXT
);

-- Membres d'un groupe.
--
-- student_id est facultatif : un élève tape les noms de son groupe, il n'est
-- pas obligé de les prendre dans le tableau. Un nom tapé est rattaché à une
-- fiche du tableau dès que c'est possible, mais si l'élève n'y figure pas, le
-- membre existe quand même. C'est pourquoi member_name porte le nom tel que
-- tapé, et member_key sa forme normalisée (minuscules, sans accents) qui sert
-- à repérer les doublons.
--
-- student_id n'est pas NULL dans les tables créées avant ce changement : la
-- migration assouplirLesMembresDeGroupe reconstruit la table pour le rendre
-- facultatif.
CREATE TABLE IF NOT EXISTS student_group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  student_id INTEGER,
  member_name TEXT,
  member_key TEXT,
  added_by_fingerprint TEXT,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES student_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Un même élève ne peut pas figurer deux fois dans un groupe, et un même nom
-- non plus. Les index partiels laissent passer les membres sans fiche.
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_member_student
  ON student_group_members(group_id, student_id) WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_member_key
  ON student_group_members(group_id, member_key);

-- Un élève ne peut appartenir qu'à un seul groupe VALIDÉ : c'est ce qui rend le
-- tableau cohérent, sans qu'un même nom apparaisse dans deux équipes.
--
-- Cette table est la source de vérité de cette règle : une ligne par élève
-- validé. La clé primaire sur student_id fait office de verrou, et la clé
-- étrangère sur group_id nettoie tout automatiquement quand un groupe disparaît.
-- Les groupes en attente restent, eux, libres de se chevaucher.
CREATE TABLE IF NOT EXISTS student_group_validated (
  student_id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES student_groups(id) ON DELETE CASCADE
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

-- Réactions rapides : pouce, rire, cœur. Réservées aux élèves (le délégué ne
-- réagit pas, il répond), d'où l'absence de contrainte sur le sender.
CREATE TABLE IF NOT EXISTS chat_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  reaction TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, reaction, user_id),
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES chat_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_msg ON chat_reactions(message_id);

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

/**
 * Rend `student_id` facultatif dans `student_group_members`.
 *
 * Un élève tape les noms de son groupe au lieu de les choisir dans le tableau,
 * donc un membre n'a pas toujours de fiche élève. SQLite ne sait pas retirer
 * une contrainte `NOT NULL` : il faut reconstruire la table. C'est fait une
 * seule fois — la présence de `member_key` sert de témoin — et dans une
 * transaction, pour qu'une base déjà déployée ne reste pas à moitié convertie.
 */
function assouplirLesMembresDeGroupe(db: Database.Database): void {
  const colonnes = db.prepare('PRAGMA table_info(student_group_members)').all() as {
    name: string;
  }[];
  if (colonnes.some((c) => c.name === 'member_key')) return;

  const existante = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'student_group_members'`)
    .get();
  // Base neuve : le `CREATE TABLE` de SCHEMA_SQL vient de la créer correctement.
  if (!existante) return;

  db.transaction(() => {
    db.exec(`
      CREATE TABLE student_group_members_souple (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        student_id INTEGER,
        member_name TEXT,
        member_key TEXT,
        added_by_fingerprint TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES student_groups(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      );

      INSERT INTO student_group_members_souple
        (group_id, student_id, member_name, member_key, added_by_fingerprint, added_at)
      SELECT m.group_id,
             m.student_id,
             TRIM(s.first_name || ' ' || s.last_name),
             lower(TRIM(s.first_name || ' ' || s.last_name)),
             m.added_by_fingerprint,
             m.added_at
      FROM student_group_members m
      LEFT JOIN students s ON s.id = m.student_id;

      DROP TABLE student_group_members;
      ALTER TABLE student_group_members_souple RENAME TO student_group_members;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_group_member_student
        ON student_group_members(group_id, student_id) WHERE student_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_group_member_key
        ON student_group_members(group_id, member_key);
    `);
  })();
}

export function initDatabase(db: Database.Database): void {
  // Avant `SCHEMA_SQL`, et non après : le schéma déclare un index sur
  // `member_key`, colonne que les bases anciennes n'ont pas. Appliqué en
  // premier, cet index échouerait sur une base déployée avant ce changement.
  assouplirLesMembresDeGroupe(db);
  db.exec(SCHEMA_SQL);
  ensureColumn(db, 'announcements', 'image', 'TEXT');
  ensureColumn(db, 'settings', 'home_image', 'TEXT');
  // Thème de saison (aucun / halloween / noel) activable dans les paramètres
  // du délégué : décore l'ensemble de l'application.
  ensureColumn(db, 'settings', 'season_theme', "TEXT DEFAULT 'aucun'");
  // Fil d'arbitrage : permet à l'élève de retrouver ses propres messages et
  // la réponse du délégué. Le modèle d'identité reste le fingerprint client,
  // identique au reste de l'application.
  ensureColumn(db, 'messages', 'fingerprint', 'TEXT');
  ensureColumn(db, 'messages', 'delegate_reply', 'TEXT');
  ensureColumn(db, 'messages', 'replied_at', 'DATETIME');
  // Date à laquelle l'élève a ouvert la réponse du délégué. Alimente le
  // compteur « messages à lire » de l'accueil : sans cette colonne, rien ne
  // distinguait une réponse jamais ouverte d'une réponse déjà lue.
  ensureColumn(db, 'messages', 'response_read_at', 'DATETIME');
  // Ordre d'affichage des options de sondage, indispensable pour renommer une
  // option sans la déplacer. Les lignes existantes retombent sur leur id.
  ensureColumn(db, 'poll_options', 'position', 'INTEGER');
  db.prepare('UPDATE poll_options SET position = id WHERE position IS NULL').run();
  // Colonnes d'arbitrage des idées ajoutées après la création de la table.
  // Le schéma les déclare pour les bases neuves, mais `CREATE TABLE IF NOT
  // EXISTS` ne touche pas une table déjà existante : sans ces appels, les
  // routes qui répondent ou transmettent une idée échoueraient sur une base
  // déployée avant leur ajout.
  ensureColumn(db, 'ideas', 'delegate_response', 'TEXT');
  ensureColumn(db, 'ideas', 'delegate_replied_at', 'DATETIME');
  // Signataire d'un groupe créé par un élève. Le serveur s'en sert pour
  // savoir quel groupe privé lui appartient et qui a le droit de le modifier.
  ensureColumn(db, 'student_groups', 'created_by_fingerprint', 'TEXT');
  // Signataire d'une session de révision créée par un élève. Les élèves
  // pratiquent entre eux, donc une session n'est pas réservée au délégué : sans
  // cette colonne, rien ne distinguait une session d'un élève d'une session
  // officielle, et personne ne pouvait savoir laquelle il avait le droit de
  // modifier ou de supprimer.
  ensureColumn(db, 'revision_sessions', 'created_by_fingerprint', 'TEXT');
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