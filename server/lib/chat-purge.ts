import db from '../db/index.js';
import { logAdminAction } from './maintenance.js';

/** Les messages de discussion disparaissent au bout de deux jours. */
export const RETENTION_DAYS = 2;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Purge automatique des messages de chat Trop vieux.
 *
 * Deux jours, comme demandé. Le calcul se fait en JS plutôt qu'en SQL pour que
 * la limite soit explicite et testable : `datetime('now', '-2 days')` dépendait
 * de l'interprétation UTC de SQLite, ce qui décalait la purge d'un jour selon
 * l'heure.
 *
 * La purge est réelle (DELETE) et non logique : c'est le but, libérer l'espace
 * de la base, qui est de taille limitée sur le plan gratuit.
 */
export function purgeExpiredChatMessages(now = Date.now()): number {
  const cutoff = new Date(now - RETENTION_DAYS * ONE_DAY_MS).toISOString().slice(0, 19).replace('T', ' ');

  const result = db
    .prepare('DELETE FROM chat_messages WHERE created_at < ?')
    .run(cutoff);

  const deleted = result.changes;
  if (deleted > 0) {
    logAdminAction(
      db,
      'chat_purge',
      'chat_message',
      null,
      `Purge automatique : ${deleted} message(s) de plus de ${RETENTION_DAYS} jours`
    );
    console.log(`Purge du chat : ${deleted} message(s) supprimé(s)`);
  }
  return deleted;
}

/**
 * Lance la purge au démarrage puis une fois par jour.
 *
 * Au démarrage elle est indispensable : sur Render, l'instance s'éteint et
 * redémarre souvent, et c'est précisément à ces moments que les vieux messages
 * doivent disparaître.
 */
export function startChatPurge(): void {
  const run = () => {
    try {
      purgeExpiredChatMessages();
    } catch (err) {
      console.error('Purge du chat impossible:', err);
    }
  };

  run();
  setInterval(run, 6 * 60 * 60 * 1000).unref?.();
}
