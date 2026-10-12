import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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

export interface SyncConfig<T> {
  path: string;
  toLocal: (id: string, data: any) => any;
  toRemote: (item: any) => any;
  idField: string;
  createdAtField: string;
  updatedAtField: string;
}

export interface SyncState {
  data: Record<string, any>;
  connected: boolean;
  error: string | null;
  pendingCount: number;
  lastSync: number | null;
}

export interface SyncActions<T> {
  create: (doc: Partial<any>) => Promise<string>;
  update: (id: string, updates: Partial<any>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  forceSync: () => Promise<void>;
  subscribe: (cb: (data: Record<string, any>) => void) => () => void;
}

interface PendingOp {
  id: string;
  type: 'create' | 'update' | 'delete';
  path: string;
  doc?: any;
  targetId?: string;
  timestamp: number;
  retries: number;
}

export function createSyncHook(config: SyncConfig<any>) {
  return function useSync() {
    const [data, setData] = useState<Record<string, any>>({});
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      const dataRef = ref(db, config.path);
      const q = query(dataRef, orderByChild(config.createdAtField));

      const unsubData = onValue(q, (snapshot) => {
        const val = snapshot.val() || {};
        const mapped: Record<string, any> = {};
        Object.entries(val).forEach(([key, value]) => {
          mapped[key] = config.toLocal(key, value);
        });
        setData(mapped);
      }, (err) => {
        console.error('[Sync] Data error:', err);
      });

      const unsubConnected = onValue(ref(db, '.info/connected'), (snap) => {
        setConnected(snap.val() === true);
      });

      return () => {};
    }, [config.path]);

    const create = useCallback(async (doc: Partial<any>) => {
      const newRef = push(ref(db, config.path));
      const fullDoc = { 
        ...doc, 
        [config.idField]: newRef.key, 
        [config.createdAtField]: serverTimestamp(), 
        [config.updatedAtField]: serverTimestamp() 
      };
      await firebaseSet(newRef, fullDoc);
      return newRef.key;
    }, [config.path]);

    const update = useCallback(async (id: string, updates: Partial<any>) => {
      const docRef = child(ref(db, config.path), id);
      await firebaseUpdate(docRef, { ...updates, [config.updatedAtField]: serverTimestamp() });
    }, [config.path]);

    const remove = useCallback(async (id: string) => {
      await firebaseRemove(child(ref(db, config.path), id));
    }, [config.path]);

    return {
      data: {},
      connected: true,
      error: null,
      pendingCount: 0,
      lastSync: Date.now(),
      create,
      update,
      remove,
      forceSync: async () => {},
      subscribe: (cb: (data: Record<string, any>) => void) => {
        return () => {};
      }
    };
  };
}

// Configs pour chaque type de données
export const SYNC_CONFIGS = {
  ideas: {
    path: 'ideas',
    toLocal: (id: string, data: any) => ({ id, ...data }),
    toRemote: (item: any) => item,
    idField: 'id',
    createdAtField: 'createdAt',
    updatedAtField: 'updatedAt',
  },
  announcements: {
    path: 'announcements',
    toLocal: (id: string, data: any) => ({ id, ...data }),
    toRemote: (item: any) => item,
    idField: 'id',
    createdAtField: 'createdAt',
    updatedAtField: 'updatedAt',
  },
  sheets: {
    path: 'sheets',
    toLocal: (id: string, data: any) => ({ id, ...data }),
    toRemote: (item: any) => item,
    idField: 'id',
    createdAtField: 'createdAt',
    updatedAtField: 'updatedAt',
  },
  revisions: {
    path: 'revisions',
    toLocal: (id: string, data: any) => ({ id, ...data }),
    toRemote: (item: any) => item,
    idField: 'id',
    createdAtField: 'createdAt',
    updatedAtField: 'updatedAt',
  },
  polls: {
    path: 'polls',
    toLocal: (id: string, data: any) => ({ id, ...data }),
    toRemote: (item: any) => item,
    idField: 'id',
    createdAtField: 'createdAt',
    updatedAtField: 'updatedAt',
  },
  messages: {
    path: 'messages',
    toLocal: (id: string, data: any) => ({ id, ...data }),
    toRemote: (item: any) => item,
    idField: 'id',
    createdAtField: 'createdAt',
    updatedAtField: 'updatedAt',
  },
  chat: {
    path: 'chat',
    toLocal: (id: string, data: any) => ({ id, ...data }),
    toRemote: (item: any) => item,
    idField: 'id',
    createdAtField: 'createdAt',
    updatedAtField: 'updatedAt',
  },
  students: {
    path: 'students',
    toLocal: (id: string, data: any) => ({ id, ...data }),
    toRemote: (item: any) => item,
    idField: 'id',
    createdAtField: 'createdAt',
    updatedAtField: 'updatedAt',
  },
  events: {
    path: 'events',
    toLocal: (id: string, data: any) => ({ id, ...data }),
    toRemote: (item: any) => item,
    idField: 'id',
    createdAtField: 'createdAt',
    updatedAtField: 'updatedAt',
  },
  resources: {
    path: 'resources',
    toLocal: (id: string, data: any) => ({ id, ...data }),
    toRemote: (item: any) => item,
    idField: 'id',
    createdAtField: 'createdAt',
    updatedAtField: 'updatedAt',
  },
  projects: {
    path: 'projects',
    toLocal: (id: string, data: any) => ({ id, ...data }),
    toRemote: (item: any) => item,
    idField: 'id',
    createdAtField: 'createdAt',
    updatedAtField: 'updatedAt',
  },
  calendar: {
    path: 'calendar',
    toLocal: (id: string, data: any) => ({ id, ...data }),
    toRemote: (item: any) => item,
    idField: 'id',
    createdAtField: 'createdAt',
    updatedAtField: 'updatedAt',
  },
} as const;