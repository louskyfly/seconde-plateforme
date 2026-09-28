import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { dbPath, isPersistentStorage } from './index.js';

const BACKUP_DIR = path.join(path.dirname(dbPath), 'backups');
const BACKUP_PREFIX = 'seconde-';
const BACKUP_SUFFIX = '.db';
const KEEP_BACKUPS = 14;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isBackupFile(name: string): boolean {
  return name.startsWith(BACKUP_PREFIX) && name.endsWith(BACKUP_SUFFIX);
}

/**
 * Supprime les sauvegardes trop anciennes pour ne pas remplir le disque.
 * La plus récente est toujours conservée.
 */
function pruneOldBackups(): void {
  let files: string[];
  try {
    files = fs.readdirSync(BACKUP_DIR).filter(isBackupFile);
  } catch {
    return;
  }

  if (files.length <= KEEP_BACKUPS) return;

  const withTime = files
    .map((name) => ({ name, time: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  for (const stale of withTime.slice(KEEP_BACKUPS)) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, stale.name));
    } catch {
      /* une sauvegarde verrouillée n'est pas grave */
    }
  }
}

/**
 * Copie cohérente de la base. `better-sqlite3` utilise l'API de backup de
 * SQLite : la copie reste valide même si des écritures ont lieu pendant
 * l'opération, contrairement à un simple copier-coller du fichier.
 */
export async function createBackup(
  database: Database.Database,
  reason: 'auto' | 'manuel' = 'manuel'
): Promise<string> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tmp = path.join(BACKUP_DIR, `.tmp-${stamp}${BACKUP_SUFFIX}`);
  const target = path.join(BACKUP_DIR, `${BACKUP_PREFIX}${stamp}-${reason}${BACKUP_SUFFIX}`);

  await database.backup(tmp);
  fs.renameSync(tmp, target);
  pruneOldBackups();

  return target;
}

export function listBackups(): { file: string; date: string; size: number }[] {
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter(isBackupFile)
      .map((file) => {
        const stat = fs.statSync(path.join(BACKUP_DIR, file));
        return { file, date: stat.mtime.toISOString(), size: stat.size };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

export function startAutoBackup(database: Database.Database): void {
  const run = async () => {
    try {
      await createBackup(database, 'auto');
      console.log(`Sauvegarde automatique créée (${listBackups().length} conservée(s))`);
    } catch (err) {
      console.error('Sauvegarde automatique impossible:', err);
    }
  };

  // Première sauvegarde peu après le démarrage, puis une par jour.
  const firstDelay = 60 * 1000;
  setTimeout(() => {
    void run();
    setInterval(() => void run(), ONE_DAY_MS);
  }, firstDelay).unref?.();

  if (!isPersistentStorage) {
    console.warn(
      'Stockage éphémère : les sauvegardes automatiques sont perdues au redéploiement. Exporte la base depuis l\'espace délégué pour la conserver.'
    );
  }
}
