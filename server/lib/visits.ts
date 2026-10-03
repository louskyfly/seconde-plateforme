import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { execute } from '../db/index.js';

/** Combien de temps on garde les visites. Aligné sur la borne du graphique. */
export const VISIT_RETENTION_DAYS = 90;

/**
 * Plafond d'ouvertures comptées pour un même appareil et un même jour.
 *
 * Le nombre d'élèves distincts reste juste, lui : il dépend du nombre de lignes,
 * pas de `hits`. Ce plafond protège seulement le total d'ouvertures, qu'un appel
 * en boucle pouvait gonfler indéfiniment.
 */
export const MAX_HITS_PER_DAY = 200;

/**
 * Hache l'empreinte avant de l'écrire.
 *
 * L'empreinte sert déjà à reconnaître un appareil partout ailleurs dans
 * l'application, et c'est elle qui était stockée ici. La hacher change deux
 * choses : la base ne contient plus d'identifiant directement réutilisable, et le
 * délégué ne peut pas remonter d'une ligne de visite jusqu'à un message ou à un
 * vote du même élève.
 *
 * HMAC et non simple SHA-256 : le secret du serveur entre dans le calcul, donc
 * même si la base fuit, recomposer les condensats depuis une liste d'appareils
 * connue ne donne rien.
 */
export function hacherEmpreinte(fingerprint: string): string {
  const secret = process.env.SESSION_SECRET?.trim() || 'seconde-plateforme';
  return crypto.createHmac('sha256', secret).update(fingerprint).digest('hex').slice(0, 32);
}

/**
 * Supprime les visites au-delà de la durée de conservation.
 *
 * Appelée à chaque écriture : le DELETE est indexé sur `day` et la table ne
 * contient qu'une ligne par appareil et par jour, donc il reste negligeable. Le
 * faire systématiquement, plutôt qu'une fois par jour, évite un état caché dans
 * le module — c'est ce qui rend cette purge vérifiable par un test.
 */
export function purgerVisitesAnciennes(db: Database.Database): number {
  return db.prepare(`DELETE FROM visits WHERE day < date('now', ?)`).run(`-${VISIT_RETENTION_DAYS} days`)
    .changes;
}

export async function purgerVisitesAnciennesAsync(): Promise<number> {
  const result = await execute(`DELETE FROM visits WHERE day < CURRENT_DATE - INTERVAL '${VISIT_RETENTION_DAYS} days'`);
  return result.rowCount ?? 0;
}
