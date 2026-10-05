/**
 * Async version of initDatabase for PostgreSQL.
 * Uses the async helpers (query, execute, queryOne) from ./index.js
 */
export async function initDatabaseAsync(): Promise<void> {
  // Schema is already applied in initializePostgres() via POSTGRES_SCHEMA
  // Just run the column checks and seed birthdays
  await ensureColumnAsync('announcements', 'image', 'TEXT');
  await ensureColumnAsync('settings', 'home_image', 'TEXT');
  await ensureColumnAsync('settings', 'season_theme', "TEXT DEFAULT 'aucun'");
  await ensureColumnAsync('messages', 'fingerprint', 'TEXT');
  await ensureColumnAsync('messages', 'delegate_reply', 'TEXT');
  await ensureColumnAsync('messages', 'replied_at', 'TIMESTAMP');
  await ensureColumnAsync('messages', 'response_read_at', 'TIMESTAMP');
  await ensureColumnAsync('poll_options', 'position', 'INTEGER');
  await execute('UPDATE poll_options SET position = id WHERE position IS NULL');
  await ensureColumnAsync('ideas', 'delegate_response', 'TEXT');
  await ensureColumnAsync('ideas', 'delegate_replied_at', 'TIMESTAMP');
  await ensureColumnAsync('student_groups', 'created_by_fingerprint', 'TEXT');
  await ensureColumnAsync('revision_sessions', 'created_by_fingerprint', 'TEXT');
  await ensureColumnAsync('chat_conversations', 'group_id', 'INTEGER');
  await ensureColumnAsync('chat_conversations', 'closed', 'INTEGER DEFAULT 0');
  await seedBirthdaysAsync();
}

/**
 * Async version of ensureDefaultChatGroup for PostgreSQL.
 */
export async function ensureDefaultChatGroupAsync(): Promise<void> {
  const settings = await queryOne<{ class_name: string; delegate_name: string }>(
    'SELECT class_name, delegate_name FROM settings WHERE id = 1'
  );

  const delegateName = settings?.delegate_name || 'Délégué';
  const className = settings?.class_name || 'La classe';

  let delegate = await queryOne<{ id: number }>(`SELECT id FROM chat_users WHERE kind = 'delegate'`);
  if (!delegate) {
    const inserted = await execute(
      `INSERT INTO chat_users (display_name, kind, fingerprint) VALUES ($1, 'delegate', NULL) RETURNING id`,
      [delegateName]
    );
    delegate = { id: inserted.lastInsertId as number };
  } else {
    await execute('UPDATE chat_users SET display_name = $1 WHERE id = $2', [delegateName, delegate.id]);
  }

  let conversation = await queryOne<{ id: number }>(`SELECT id FROM chat_conversations WHERE is_group = 1 LIMIT 1`);
  if (!conversation) {
    const inserted = await execute(
      `INSERT INTO chat_conversations (title, is_group, created_by) VALUES ($1, 1, $2) RETURNING id`,
      [`${className} — Groupe`, delegate!.id]
    );
    conversation = { id: inserted.lastInsertId as number };
  }

  await execute(
    `INSERT INTO chat_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [conversation!.id, delegate!.id]
  );
}

/**
 * Async version of seedBirthdays for PostgreSQL.
 */
async function seedBirthdaysAsync(): Promise<void> {
  const count = await queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM birthdays');
  if ((count?.n ?? 0) > 0) return;

  // Liste extraite de data/anniversaires/classe-_-seconde-09.xlsx
  const eleves: { nom: string; prenom: string; date_mmdd: string }[] = [
    { nom: 'ABILY', prenom: 'Alyssa', date_mmdd: '05-17' },
    { nom: 'AGULHON', prenom: 'Louise', date_mmdd: '11-05' },
    { nom: 'AHYOUD', prenom: 'Lina', date_mmdd: '08-25' },
    { nom: 'ANGEVIN', prenom: 'Victor', date_mmdd: '06-21' },
    { nom: 'AVIAS', prenom: 'Nina', date_mmdd: '02-21' },
    { nom: 'AZOULAY LAGA', prenom: 'Charlie', date_mmdd: '12-09' },
    { nom: 'BACONNIER', prenom: 'Nathanaël', date_mmdd: '08-25' },
    { nom: 'BALDÉ', prenom: 'Camélia', date_mmdd: '02-03' },
    { nom: 'BEDOUX-DIEBOLT', prenom: 'Rodrigue', date_mmdd: '11-05' },
    { nom: 'BEDOUX-DIEBOLT', prenom: 'Salome', date_mmdd: '11-05' },
    { nom: 'BOGALE', prenom: 'Abigail', date_mmdd: '06-02' },
    { nom: 'BOISSIN', prenom: 'Nais', date_mmdd: '01-29' },
    { nom: 'BOUCHER', prenom: 'Lucas', date_mmdd: '03-17' },
    { nom: 'BOUYER', prenom: 'Noélie', date_mmdd: '03-12' },
    { nom: 'BRINGAY', prenom: 'Louise', date_mmdd: '10-22' },
    { nom: 'CHASTAN', prenom: 'Guilhem', date_mmdd: '06-25' },
    { nom: 'COADOU', prenom: 'Noé', date_mmdd: '02-06' },
    { nom: 'DECOBECQ', prenom: 'Leyla', date_mmdd: '04-09' },
    { nom: 'EDOUARD', prenom: 'Agathe', date_mmdd: '01-09' },
    { nom: 'EL HANK EZ-ZAIDI', prenom: 'Malak', date_mmdd: '05-03' },
    { nom: 'EL IDRISSI', prenom: 'Dina', date_mmdd: '05-05' },
    { nom: 'GANDER', prenom: 'David', date_mmdd: '01-23' },
    { nom: 'GOMIS', prenom: 'Paul', date_mmdd: '10-15' },
    { nom: 'HERNANDEZ', prenom: 'Mathéo', date_mmdd: '08-16' },
    { nom: 'LEFORT', prenom: 'Solal', date_mmdd: '04-03' },
    { nom: 'LEVY', prenom: 'Charlotte', date_mmdd: '04-13' },
    { nom: 'MALILE', prenom: 'Sirine', date_mmdd: '02-19' },
    { nom: 'MARTIN', prenom: 'Ruben', date_mmdd: '10-05' },
    { nom: 'MAZOUNI', prenom: 'Majda', date_mmdd: '05-27' },
    { nom: 'OJO', prenom: 'Mayomikun', date_mmdd: '11-30' },
    { nom: 'PIRONE', prenom: 'Lucas', date_mmdd: '12-03' },
    { nom: 'RAMEAU', prenom: 'Adèle', date_mmdd: '08-23' },
    { nom: 'SANCHEZ', prenom: 'Lucas', date_mmdd: '09-23' },
    { nom: 'TORCHEUX', prenom: 'Laurelle', date_mmdd: '10-12' },
    { nom: 'VERDELHAN', prenom: 'Manon', date_mmdd: '02-18' },
  ];

  // Empreinte déterministe = hash simple du nom complet (pour reproductibilité)
  function fingerprintFor(nom: string, prenom: string): string {
    const str = `${prenom.toLowerCase()}-${nom.toLowerCase()}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return 'birthday-' + Math.abs(hash).toString(36).padStart(12, '0');
  }

  for (const e of eleves) {
    const fp = fingerprintFor(e.nom, e.prenom);
    await execute(
      `INSERT INTO birthdays (fingerprint, date_mmdd, first_name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [fp, e.date_mmdd, e.prenom]
    );
  }
  console.log(`[seed] ${eleves.length} anniversaires injectés`);
}

async function ensureColumnAsync(table: string, column: string, definition: string): Promise<void> {
  const columns = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  if (columns.length === 0) {
    await execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}