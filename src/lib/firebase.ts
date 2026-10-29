import { initializeApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';

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
export { app };
export const db = getDatabase(app);

// Tests en local uniquement : `VITE_FIREBASE_EMULATOR=127.0.0.1:9000 npm run build`
// branche le site sur l'émulateur Firebase au lieu de la vraie base.
const emulator = import.meta.env.VITE_FIREBASE_EMULATOR as string | undefined;
if (emulator) {
  const [host, port] = emulator.split(':');
  connectDatabaseEmulator(db, host, Number(port) || 9000);
}

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
