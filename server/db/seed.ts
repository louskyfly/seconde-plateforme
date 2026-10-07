import bcrypt from 'bcryptjs';
import type Database from 'better-sqlite3';
import database, { execute, queryOne } from './index.js';

const DEFAULT_ADMIN_PASSWORD = 'delegue2026';
const DEFAULT_ADMIN_LINK_TOKEN = '7xK4p';
const BCRYPT_ROUNDS = 10;

interface SeedOptions {
  className?: string;
  delegateName?: string;
  adminPassword?: string;
  adminLinkToken?: string;
  accentColor?: string;
  homeInfo?: string;
}

export function seedDatabase(db: Database.Database = database, options: SeedOptions = {}): void {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM settings').get() as { count: number };
  if (count > 0) return;

  const password = options.adminPassword ?? process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
  const linkToken = options.adminLinkToken ?? process.env.ADMIN_LINK_TOKEN ?? DEFAULT_ADMIN_LINK_TOKEN;
  const className = options.className ?? process.env.CLASS_NAME ?? 'Seconde 9';
  const delegateName = options.delegateName ?? process.env.DELEGATE_NAME ?? 'Lucas';
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);

  db.prepare(
    `INSERT INTO settings (id, class_name, delegate_name, delegate_link_token, password_hash, accent_color, home_info)
     VALUES (1, @className, @delegateName, @linkToken, @passwordHash, @accentColor, @homeInfo)`
  ).run({
    className,
    delegateName,
    linkToken,
    passwordHash,
    accentColor: options.accentColor ?? '#3b5ba6',
    homeInfo: options.homeInfo ?? '',
  });
}

export async function seedDatabaseAsync(options: SeedOptions = {}): Promise<void> {
  const existing = await queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM settings');
  if ((existing?.count ?? 0) > 0) return;

  const password = options.adminPassword ?? process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
  const linkToken = options.adminLinkToken ?? process.env.ADMIN_LINK_TOKEN ?? DEFAULT_ADMIN_LINK_TOKEN;
  const className = options.className ?? process.env.CLASS_NAME ?? 'Seconde 9';
  const delegateName = options.delegateName ?? process.env.DELEGATE_NAME ?? 'Lucas';
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await execute(
    `INSERT INTO settings (id, class_name, delegate_name, delegate_link_token, password_hash, accent_color, home_info)
     VALUES (1, $1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
    [className, delegateName, linkToken, passwordHash, options.accentColor ?? '#3b5ba6', options.homeInfo ?? '']
  );
}