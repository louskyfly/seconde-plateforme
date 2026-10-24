import { ref, get, update as firebaseUpdate, serverTimestamp } from 'firebase/database';
import { db, FB, clean } from './firebase';

/** Valeurs par défaut quand rien n'est encore enregistré dans Firebase. */
export const DEFAULT_SETTINGS = {
  id: 1,
  className: 'Seconde 9',
  delegateName: 'Lucas',
  delegateLinkToken: '7xK4p',
  passwordHash: '$2a$10$dev',
  accentColor: '#3b82f6',
  homeInfo: '',
  seasonTheme: 'aucun',
  maintenanceMode: false,
  maintenanceMessage: null as string | null,
};

export type SharedSettings = typeof DEFAULT_SETTINGS & {
  homeImage?: string;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: any;
};

export function withDefaults(value: Partial<SharedSettings> | null | undefined): SharedSettings {
  return { ...DEFAULT_SETTINGS, ...(value || {}) } as SharedSettings;
}

/** Lecture ponctuelle des réglages partagés (connexion admin, etc.). */
export async function getSharedSettings(): Promise<SharedSettings> {
  const snap = await get(ref(db, FB.settings));
  return withDefaults(snap.val());
}

/** Met à jour uniquement les champs fournis (pas d'écrasement des autres). */
export async function saveSharedSettings(updates: Partial<SharedSettings>) {
  const { id, createdAt, updatedAt, ...rest } = updates as any;
  await firebaseUpdate(ref(db, FB.settings), clean({ ...rest, updatedAt: serverTimestamp() }));
}
