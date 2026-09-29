/**
 * Prénom d'un élève.
 *
 * Règle du site : seule l'identité affichée est le prénom. Ni nom de famille,
 * ni classe, ni email ne doivent fuiter quand un élève publie.
 *
 * Ces fonctions sont le pendant serveur de `src/lib/utils.ts` : la validation
 * est refaite côté API, car le client peut être contourné.
 */

/** Ne garde que lettres, espaces, apostrophes et traits d'union. */
export function cleanFirstName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[^\p{L}\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
}

/**
 * Un prénom valide : 2 à 30 caractères, et surtout **un seul mot**. C'est ce qui
 * empêche d'écrire « Jean Dupont » là où seul le prénom est attendu.
 */
export function isValidFirstName(value: string): boolean {
  if (value.length < 2 || value.length > 30) return false;
  return !value.includes(' ');
}
