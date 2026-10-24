import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ref,
  onValue,
  push,
  set as firebaseSet,
  update as firebaseUpdate,
  remove as firebaseRemove,
  query,
  orderByChild,
  limitToLast,
  equalTo,
  serverTimestamp,
  child,
  type Query,
} from 'firebase/database';
import { db, clean } from '../lib/firebase';

export interface ListOptions {
  /** Champ utilisé pour trier côté serveur (par défaut createdAt). */
  orderBy?: string;
  /** Ne garder que les N derniers éléments (selon orderBy). */
  limitToLast?: number;
  /** Filtrer sur orderBy === valeur (nécessite un .indexOn dans les règles). */
  equalTo?: string | number | boolean | null;
  /** Ne pas écouter tant que false (ex : empreinte pas encore connue). */
  enabled?: boolean;
}

/** État de connexion à Firebase (pastille « Connecté / Hors ligne »). */
export function useFirebaseConnected() {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const unsub = onValue(ref(db, '.info/connected'), (snap) => setConnected(snap.val() === true));
    return () => unsub();
  }, []);
  return connected;
}

/**
 * Écoute en temps réel une collection Firebase (objet { id: doc }) et fournit
 * create / update / remove. Les données sont partagées entre tous les appareils.
 */
export function useFirebaseSync<T = any>(path: string, options: ListOptions = {}) {
  const { orderBy = 'createdAt', limitToLast: last, equalTo: eq, enabled = true } = options;
  const [data, setData] = useState<Record<string, T>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const connected = useFirebaseConnected();

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    const constraints = [orderByChild(orderBy)];
    if (eq !== undefined) constraints.push(equalTo(eq) as any);
    if (last) constraints.push(limitToLast(last) as any);
    const q: Query = query(ref(db, path), ...constraints);

    const unsub = onValue(
      q,
      (snapshot) => {
        setData((snapshot.val() as Record<string, T>) || {});
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`[Firebase] ${path}:`, err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [path, orderBy, last, eq, enabled]);

  /** Liste triée (createdAt décroissant par défaut), avec l'id injecté. */
  const items = useMemo(
    () =>
      Object.entries(data || {}).map(([id, value]) => ({ ...(value as any), id }) as T & { id: string }),
    [data]
  );

  const create = useCallback(
    async (doc: Partial<T> & Record<string, any>) => {
      const newRef = push(ref(db, path));
      await firebaseSet(
        newRef,
        clean({ ...doc, id: newRef.key, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      );
      return newRef.key as string;
    },
    [path]
  );

  const update = useCallback(
    async (id: string, updates: Partial<T> & Record<string, any>) => {
      await firebaseUpdate(child(ref(db, path), id), clean({ ...updates, updatedAt: serverTimestamp() }));
    },
    [path]
  );

  const remove = useCallback(
    async (id: string) => {
      await firebaseRemove(child(ref(db, path), id));
    },
    [path]
  );

  return { data, items, loading, connected, error, create, update, remove };
}

/** Écoute en temps réel une valeur unique (ex : settings). */
export function useFirebaseValue<T = any>(path: string, enabled = true) {
  const [value, setValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!enabled) return;
    const unsub = onValue(
      ref(db, path),
      (snap) => {
        setValue(snap.val() as T | null);
        setLoading(false);
      },
      (err) => {
        console.error(`[Firebase] ${path}:`, err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [path, enabled]);
  return { value, loading };
}
