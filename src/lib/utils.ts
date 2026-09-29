/**
 * Les horodatages du serveur (SQLite) sont enregistrés en UTC mais SANS
 * fuseau : "2026-09-27 14:32:05". Or `new Date("2026-09-27 14:32:05")` est
 * interprété en heure LOCALE par le navigateur : en France (UTC+2) un message
 * envoyé à l'instant s'affichait « il y a 2h ». On interprète donc explicitement
 * ces chaînes sans fuseau comme de l'UTC.
 */
export function parseServerDate(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  // Fuseau déjà explicite (ISO "Z" ou "+02:00") : on ne touche à rien.
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(dateStr.trim())) return new Date(dateStr);
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return new Date(dateStr);
  const [, year, month, day, hour, minute, second] = m;
  // Date seule ("2026-10-15") : minuit local, pour éviter un décalage de jour.
  if (hour === undefined) return new Date(+year, +month - 1, +day);
  return new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +(second || 0)));
}

export function formatDate(dateStr: string): string {
  const date = parseServerDate(dateStr);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateTime(dateStr: string): string {
  const date = parseServerDate(dateStr);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = parseServerDate(dateStr);
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes}min`;
  if (hours < 24) return `Il y a ${hours}h`;
  if (days < 7) return `Il y a ${days}j`;
  return formatDate(dateStr);
}

/** Pastille numérique sur l'icône de l'application (PWA installée). */
export function setAppBadge(count: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0 && typeof nav.setAppBadge === 'function') {
      nav.setAppBadge(count).catch(() => {});
    } else if (count <= 0 && typeof nav.clearAppBadge === 'function') {
      nav.clearAppBadge().catch(() => {});
    }
  } catch {
    /* Badging API non supportée : la pastille dans l'application reste visible */
  }
}

export function generateFingerprint(): string {
  let fp = localStorage.getItem('voter_fp');
  if (!fp) {
    fp = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('voter_fp', fp);
  }
  return fp;
}

const FIRST_NAME_KEY = 'student_first_name';

/**
 * Prénom de l'élève, demandé uniquement au moment où il publie.
 *
 * Choix explicite : le prénom n'est pas demandé à la première connexion, mais
 * il est obligatoire dès qu'on publie quelque chose sous son nom (idée,
 * message au délégué). Le prénom est la seule identité affichée : ni nom de
 * famille, ni classe, ni email.
 */
export function getFirstName(): string {
  return localStorage.getItem(FIRST_NAME_KEY) || '';
}

export function setFirstName(value: string): void {
  const name = value.trim();
  if (name) {
    localStorage.setItem(FIRST_NAME_KEY, name);
  } else {
    localStorage.removeItem(FIRST_NAME_KEY);
  }
}

/**
 * Nettoie un prénom saisi : on ne garde que des lettres, des espaces, des
 * apostrophes et des traits d'union, et on refuse les espaces au milieu
 * (« Jean Pierre » ne peut pas être un prénom).
 */
export function cleanFirstName(value: string): string {
  return value
    .replace(/[^\p{L}\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
}

export function isValidFirstName(value: string): boolean {
  const name = cleanFirstName(value);
  if (name.length < 2 || name.length > 30) return false;
  return !name.includes(' ');
}

export const CATEGORIES_ANNOUNCEMENT: Record<string, string> = {
  scolarite: '📚 Scolarite',
  organisation: '📅 Organisation',
  lycee: '🏫 Lycée',
  evenement: '🎉 Événement',
  important: '⚠️ Important',
  general: 'ℹ️ Général',
};

export const CATEGORIES_IDEA: Record<string, string> = {
  classe: 'Classe',
  organisation: 'Organisation',
  activites: 'Activités',
  environnement: 'Environnement',
  lycee: 'Lycée',
  autre: 'Autre',
};

export const CATEGORIES_MESSAGE: Record<string, string> = {
  question: 'Question',
  idee: 'Idée',
  organisation: 'Organisation',
  probleme: 'Problème',
  autre: 'Autre',
};

export const EVENT_CATEGORIES: Record<string, string> = {
  controle: '📝 Contrôle',
  devoir: '📖 Devoir',
  sortie: '🚌 Sortie',
  evenement: '🎉 Événement',
  reunion: '🤝 Réunion',
  autre: '📌 Autre',
};

export const SUBJECTS: Record<string, string> = {
  francais: 'Français',
  maths: 'Mathématiques',
  histoire: 'Histoire-Géo',
  svt: 'SVT',
  physique: 'Physique-Chimie',
  anglais: 'Anglais',
  autre: 'Autre',
};

export const IDEA_STATUSES: Record<string, { label: string; color: string }> = {
  a_etudier: { label: 'À étudier', color: 'bg-yellow-400' },
  en_discussion: { label: 'En discussion', color: 'bg-blue-400' },
  transmise: { label: 'Transmise', color: 'bg-purple-400' },
  realisee: { label: 'Réalisée', color: 'bg-green-400' },
  non_retenue: { label: 'Non retenue', color: 'bg-red-400' },
};

export const MESSAGE_STATUSES: Record<string, string> = {
  nouveau: 'Nouveau',
  lu: 'Lu',
  traite: 'Traité',
};

export const PROJECT_STATUSES: Record<string, { label: string; color: string }> = {
  en_preparation: { label: 'En préparation', color: 'bg-yellow-400' },
  en_cours: { label: 'En cours', color: 'bg-blue-400' },
  termine: { label: 'Terminé', color: 'bg-green-400' },
};
