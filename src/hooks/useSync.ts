import { useEffect, useRef, useState, useCallback } from 'react';

type SyncMessage = 
  | { type: 'subscribe'; collections: string[] }
  | { type: 'create'; collection: string; doc: any; id: string }
  | { type: 'update'; collection: string; doc: any; id: string }
  | { type: 'delete'; collection: string; id: string }
  | { type: 'sync'; collection: string }
  | { type: 'ack'; id: string; doc: any }
  | { type: 'sync'; collection: string; docs: any[]; seq: number }
  | { type: 'error'; message: string };

type PendingOp = {
  id: string;
  type: 'create' | 'update' | 'delete';
  collection: string;
  doc?: any;
  targetId?: string;
  timestamp: number;
  retries: number;
};

export function useSync(collection: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<PendingOp[]>([]);
  const connectedRef = useRef(false);
  const retryTimeoutRef = useRef<number>();
  const [isConnected, setIsConnected] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const listenersRef = useRef<Set<(docs: any[]) => void>>(new Set());

  // URL du serveur de sync (à configurer via variable d'env)
  const SYNC_URL = (import.meta as any).env?.VITE_SYNC_URL || 'wss://seconde-platform-sync.onrender.com';

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    const ws = new WebSocket(SYNC_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[Sync] Connected to', SYNC_URL);
      connectedRef.current = true;
      setIsConnected(true);
      
      // Abonne à la collection
      ws.send(JSON.stringify({ 
        type: 'subscribe', 
        collections: [collection] 
      }));
      
      // Traite la queue d'attente
      flushPending();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (e) {
        console.error('[Sync] Parse error:', e);
      }
    };

    ws.onclose = () => {
      console.log('[Sync] Disconnected');
      connectedRef.current = false;
      setIsConnected(false);
      wsRef.current = null;
      
      // Reconnecte avec backoff exponentiel
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('[Sync] Error:', err);
    };
  }, [collection]);

  const handleMessage = (msg: SyncMessage) => {
    switch (msg.type) {
      case 'sync': {
        if ('docs' in msg && msg.docs) {
          // Sync complet reçu
          listenersRef.current.forEach(cb => cb(msg.docs));
          setLastSync(msg.seq);
        }
        break;
      }
      case 'create':
      case 'update': {
        if (msg.collection === collection) {
          notifyListeners();
        }
        break;
      }
      case 'delete': {
        if (msg.collection === collection) {
          notifyListeners();
        }
        break;
      }
      case 'ack': {
        // Confirme qu'une opération en attente a été traitée
        pendingRef.current = pendingRef.current.filter(p => p.id !== msg.id);
        break;
      }
      case 'error':
        console.error('[Sync] Server error:', msg.message);
        break;
    }
  };

  const notifyListeners = () => {
    // Les données locales sont la source de vérité
    // On notifie pour rafraîchir l'UI
    listenersRef.current.forEach(cb => cb([])); // trigger refresh
  };

  const flushPending = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const pending = [...pendingRef.current].sort((a, b) => a.timestamp - b.timestamp);
    for (const op of pending) {
      if (op.retries > 5) {
        console.error('[Sync] Max retries reached for', op);
        pendingRef.current = pendingRef.current.filter(p => p.id !== op.id);
        continue;
      }
      const payload: any = { type: op.type, collection, id: op.id };
      if (op.type !== 'delete') {
        payload.doc = op.doc;
      } else {
        payload.id = op.targetId;
      }
      ws.send(JSON.stringify(payload));
      op.retries++;
    }
  };

  const scheduleReconnect = () => {
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    const delay = Math.min(1000 * Math.pow(2, (retryTimeoutRef.current ? 1 : 0)), 30000);
    retryTimeoutRef.current = window.setTimeout(() => {
      connect();
    }, delay);
  };

  // API publique
  const subscribe = useCallback((cb: (docs: any[]) => void) => {
    listenersRef.current.add(cb);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);

  const create = useCallback(async (doc: any) => {
    const id = crypto.randomUUID();
    const op: PendingOp = { id, type: 'create', collection, doc: { ...doc, id }, timestamp: Date.now(), retries: 0 };
    pendingRef.current.push(op);
    
    if (connectedRef.current) flushPending();
    return id;
  }, [collection]);

  const update = useCallback(async (id: string, doc: Partial<any>) => {
    const opId = crypto.randomUUID();
    const op: PendingOp = { id: opId, type: 'update', collection, doc: { ...doc, id }, timestamp: Date.now(), retries: 0 };
    pendingRef.current.push(op);
    
    if (connectedRef.current) flushPending();
  }, [collection]);

  const remove = useCallback(async (id: string) => {
    const opId = crypto.randomUUID();
    const op: PendingOp = { id: opId, type: 'delete', collection, targetId: id, timestamp: Date.now(), retries: 0 };
    pendingRef.current.push(op);
    
    if (connectedRef.current) flushPending();
  }, [collection]);

  const forceSync = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'sync', collection }));
    }
  }, [collection]);

  // Connexion initiale
  useEffect(() => {
    connect();
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    isConnected,
    lastSync,
    create,
    update,
    remove,
    forceSync,
    subscribe,
    pendingCount: pendingRef.current.length
  };
}