/**
 * Petits utilitaires d'affichage du cahier de textes (page Devoirs, agenda,
 * tableau de bord du délégué).
 */
import { getRelativeTime } from './utils';

/** Clé AAAA-MM-JJ du jour local (et non UTC : minuit à Paris reste « aujourd'hui »). */
export function localDayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** « Aujourd'hui », « Demain », sinon « lundi 26 octobre ». */
export function dayLabel(key: string, today: string = localDayKey()): string {
  if (key === today) return "Aujourd'hui";
  const tomorrow = new Date(dateFromKey(today));
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === localDayKey(tomorrow)) return 'Demain';
  const d = dateFromKey(key);
  const label = d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Date courte (« 21 oct. ») pour « donné le ». */
export function shortDate(key: string): string {
  return dateFromKey(key).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** « Mis à jour il y a 3h », « Mis à jour à l'instant », « Mis à jour le 12 octobre 2026 ». */
export function updatedLabel(updatedAt: number | null): string {
  if (!updatedAt) return 'Jamais synchronisé';
  const rel = getRelativeTime(new Date(updatedAt).toISOString());
  if (rel.startsWith('Il y a') || rel.startsWith("À l'instant")) {
    return `Mis à jour ${rel.charAt(0).toLowerCase()}${rel.slice(1)}`;
  }
  return `Mis à jour le ${rel}`;
}

/*
 * Couleur stable par matière. Classes Tailwind écrites en entier pour que le
 * compilateur les garde.
 */
const CHIP_COLORS = [
  'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300',
  'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300',
  'bg-sky-500/10 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  'bg-violet-500/10 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  'bg-teal-500/10 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
  'bg-orange-500/10 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
  'bg-fuchsia-500/10 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300',
  'bg-lime-500/15 text-lime-700 dark:bg-lime-500/20 dark:text-lime-300',
];

export function subjectChipClass(subject: string): string {
  const key = subject
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return CHIP_COLORS[hash % CHIP_COLORS.length];
}
