/**
 * Authentification Firebase (facultative, activée dès que le projet le permet).
 *
 * Deux profils :
 *  - élève : connexion anonyme, un uid stable par appareil ;
 *  - délégué : compte email + mot de passe, reconnu par le nœud `delegates`.
 *
 * Tant que les fournisseurs Firebase Auth ne sont pas activés dans la console,
 * `signInAnonymously` échoue : l'application retombe alors exactement sur son
 * fonctionnement historique (empreinte d'appareil + mot de passe local), sans
 * rien casser. C'est ce qui permet de livrer ce code avant la bascule.
 */
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  type User,
} from 'firebase/auth';
import { app } from './firebase';

const auth = getAuth(app);
/** Au-delà de ce délai, on n'attend plus Auth pour afficher l'application. */
const AUTH_TIMEOUT_MS = 4000;

let user: User | null = null;
let available: boolean | null = null;
let started = false;

let resolveReady: (value: boolean) => void = () => {};
/** Résolue quand on sait si Firebase Auth est utilisable (jamais rejetée). */
export const authReady: Promise<boolean> = new Promise((resolve) => {
  resolveReady = resolve;
});

function settle(value: boolean): void {
  if (available !== null) return;
  available = value;
  resolveReady(value);
}

/** Vrai quand Firebase Auth est actif (fournisseur anonyme autorisé). */
export function isAuthAvailable(): boolean {
  return available === true;
}

/** uid Firebase de l'appareil, ou null si Auth n'est pas disponible. */
export function currentUid(): string | null {
  return user?.uid ?? null;
}

export function currentEmail(): string | null {
  return user?.email ?? null;
}

export async function initAuth(): Promise<boolean> {
  if (started) return authReady;
  started = true;

  // Hors ligne, la requête peut rester en attente : l'application ne doit pas
  // rester bloquée sur l'écran de chargement pour autant.
  const timer = setTimeout(() => settle(false), AUTH_TIMEOUT_MS);

  try {
    const cred = await signInAnonymously(auth);
    user = cred.user;
    available = true;
    clearTimeout(timer);
    settle(true);
  } catch {
    clearTimeout(timer);
    settle(false);
    user = auth.currentUser;
  }

  onAuthStateChanged(auth, (u) => {
    user = u;
  });

  return authReady;
}

/** Connexion du délégué avec son compte email/mot de passe Firebase. */
export async function signInDelegate(email: string, password: string): Promise<string> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  user = cred.user;
  return cred.user.uid;
}

/** Création du compte délégué (première configuration). */
export async function createDelegateAccount(email: string, password: string): Promise<string> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  user = cred.user;
  return cred.user.uid;
}

export async function signOutAuth(): Promise<void> {
  try {
    await signOut(auth);
  } finally {
    user = null;
  }
}

/** Après déconnexion du délégué : repasse en élève anonyme si possible. */
export async function initAuthAfterLogout(): Promise<void> {
  try {
    const cred = await signInAnonymously(auth);
    user = cred.user;
  } catch {
    user = null;
  }
}

/** Change le mot de passe du compte Firebase du délégué. */
export async function changeAuthPassword(newPassword: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Session Firebase absente : reconnecte-toi.');
  await updatePassword(auth.currentUser, newPassword);
}

// Démarre immédiatement : les lectures/écritures attendent `authReady`.
void initAuth();
