import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase } from './schema.js';

const DEFAULT_DB_PATH = './data/seconde.db';
const RENDER_DISK_PATH = '/var/data';

/**
 * Emplacements candidats, du plus durable au moins durable.
 *
 * Sur Render, le système de fichiers du service est éphémère : tout ce qui est
 * écrit ailleurs que sur un disque persistant est détruit à chaque
 * redéploiement. `/var/data` est le point de montage standard d'un disque
 * persistant, il est donc tenté en premier.
 */
function candidatePaths(): string[] {
  const candidates: string[] = [];
  const configured = process.env.DB_PATH?.trim();
  if (configured) candidates.push(path.resolve(configured));
  if (process.env.RENDER) candidates.push(path.join(RENDER_DISK_PATH, 'seconde.db'));
  candidates.push(path.resolve(DEFAULT_DB_PATH));
  return [...new Set(candidates)];
}

function openDatabase(candidates: string[]): { db: Database.Database; dbPath: string; durable: boolean } {
  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      fs.mkdirSync(path.dirname(candidate), { recursive: true });
      const db = new Database(candidate);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      return {
        db,
        dbPath: candidate,
        // Seul un chemin explicitement durable compte : sur Render, un dossier
        // créé à la racine n'est pas forcément un disque.
        durable: !process.env.RENDER || candidate.startsWith(RENDER_DISK_PATH),
      };
    } catch (err) {
      failures.push(`${candidate} (${(err as Error).message})`);
    }
  }

  throw new Error(
    `Impossible d'ouvrir la base de données.\nEmplacements tentés :\n  - ${failures.join('\n  - ')}`
  );
}

const { db: database, dbPath, durable } = openDatabase(candidatePaths());

initDatabase(database);

/**
 * Indique si les données survivront à un redéploiement.
 *
 * Sur Render, la réponse est `false` tant qu'aucun disque persistant n'est
 * attaché : c'est le point de montage `/var/data` qui fait foi, pas la simple
 * présence d'un fichier.
 */
export const isPersistentStorage = durable;

if (isPersistentStorage) {
  console.log(`Base de données persistante : ${dbPath}`);
} else {
  console.warn(
    [
      '',
      '  ⚠️  STOCKAGE Éphémère : toutes les données seront perdues au prochain',
      '      redéploiement. Pour les rendre durables, attacher un disque persistant',
      '      monté sur /var/data dans le tableau de bord Render (plan payant).',
      `      Base actuelle : ${dbPath}`,
      "      En attendant, exporter la base depuis Paramètres > Sauvegarde des données.",
      '',
    ].join('\n')
  );
}

export { dbPath };
export default database;
