import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// Configuration web Firebase : ces valeurs sont publiques par conception
// (elles identifient le projet, elles ne donnent aucun droit).
// La sécurité repose sur database.rules.json.
const firebaseConfig = {
  apiKey: 'AIzaSyDQo9oaIHxOcvPsDxy_7Sx4wCPApvNRBcE',
  authDomain: 'sync-3626f.firebaseapp.com',
  databaseURL: 'https://sync-3626f-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'sync-3626f',
  storageBucket: 'sync-3626f.firebasestorage.app',
  messagingSenderId: '566444076930',
  appId: '1:566444076930:web:37a75e45c043763931a99b',
};

export const DATABASE_URL = firebaseConfig.databaseURL;

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

/** Chemins utilisés dans la Realtime Database (un seul endroit pour les lister). */
export const FB = {
  ideas: 'ideas',
  settings: 'settings',
  polls: 'polls',
  pollVotes: 'pollVotes',
  events: 'events',
  revisions: 'revisions',
  sheets: 'sheets',
  sheetFiles: 'sheetFiles',
  students: 'students',
  studentGroups: 'studentGroups',
  messages: 'messages',
  chatUsers: 'chatUsers',
  chatMessages: 'chatMessages',
  chatReactions: 'chatReactions',
  adminLog: 'adminLog',
  meta: 'meta',
} as const;

/** Toutes les collections sauvegardées / restaurées par l'admin. */
export const BACKUP_PATHS = [
  FB.ideas, FB.settings, FB.polls, FB.pollVotes, FB.events, FB.revisions,
  FB.sheets, FB.sheetFiles, FB.students, FB.studentGroups, FB.messages,
  FB.chatUsers, FB.chatMessages, FB.chatReactions, FB.adminLog,
] as const;

/**
 * Firebase refuse les valeurs `undefined` : on les retire (récursivement)
 * avant chaque écriture.
 */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = clean(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Compte les enfants d'un chemin sans télécharger leur contenu
 * (API REST `shallow=true`), pratique pour les statistiques.
 */
export async function countChildren(path: string): Promise<number> {
  try {
    const res = await fetch(`${DATABASE_URL}/${path}.json?shallow=true`);
    if (!res.ok) return 0;
    const json = await res.json();
    return json && typeof json === 'object' ? Object.keys(json).length : 0;
  } catch {
    return 0;
  }
}
