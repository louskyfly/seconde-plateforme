import { useEffect, useState, useCallback } from 'react';
import { 
  ref, 
  onValue, 
  push, 
  set as firebaseSet, 
  update as firebaseUpdate, 
  remove as firebaseRemove, 
  query, 
  orderByChild, 
  serverTimestamp, 
  child 
} from 'firebase/database';
import { db } from '../lib/firebase';

export interface Idea {
  id?: string;
  title: string;
  description: string;
  authorName: string | null;
  anonymous: boolean;
  fingerprint: string | null;
  status: 'a_etudier' | 'en_discussion' | 'transmise' | 'realisee' | 'non_retenue';
  createdAt?: number;
  updatedAt?: number;
}

export function useFirebaseSync(path: string) {
  const [data, setData] = useState<Record<string, any>>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dataRef = ref(db, path);
    const q = query(dataRef, orderByChild('createdAt'));

    const unsubData = onValue(q, (snapshot) => {
      const val = snapshot.val() || {};
      setData(val);
      setError(null);
    }, (err) => {
      console.error('[Firebase] Data error:', err);
      setError(err.message);
    });

    const unsubConnected = onValue(ref(db, '.info/connected'), (snap) => {
      setConnected(snap.val() === true);
    });

    return () => {
      // onValue returns unsubscribe function
    };
  }, [path]);

  const create = useCallback(async (doc: Partial<any>) => {
    const newRef = push(ref(db, path));
    const fullDoc = { ...doc, id: newRef.key, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    await firebaseSet(newRef, fullDoc);
    return newRef.key;
  }, [path]);

  const update = useCallback(async (id: string, updates: Partial<any>) => {
    const docRef = child(ref(db, path), id);
    await firebaseUpdate(docRef, { ...updates, updatedAt: serverTimestamp() });
  }, [path]);

  const remove = useCallback(async (id: string) => {
    const docRef = child(ref(db, path), id);
    await firebaseRemove(docRef);
  }, [path]);

  const forceSync = useCallback(() => {
    // Firebase gère la sync automatiquement
  }, []);

  return {
    data,
    connected,
    error,
    create,
    update,
    remove,
    forceSync,
    subscribe: (cb: (docs: any[]) => void) => {
      return () => {};
    }
  };
}