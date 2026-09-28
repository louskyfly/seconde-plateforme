import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

type PushStatus = 'unsupported' | 'default' | 'granted' | 'denied' | 'busy';

/** Retourne un ArrayBuffer : c'est le type qu'attend `applicationServerKey`. */
function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

export function usePushNotifications() {
  const supported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  const initialStatus: PushStatus = !supported
    ? 'unsupported'
    : Notification.permission === 'granted'
    ? 'granted'
    : Notification.permission === 'denied'
    ? 'denied'
    : 'default';

  const [status, setStatus] = useState<PushStatus>(initialStatus);

  const ensureSubscribed = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        setStatus('granted');
        return;
      }
      const { publicKey } = await api.getPushVapidKey();
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(publicKey),
      });
      await api.subscribePush(subscription.toJSON());
      setStatus('granted');
    } catch {
      setStatus('unsupported');
    }
  }, []);

  useEffect(() => {
    if (!supported || status !== 'granted') return;
    void ensureSubscribed();
  }, [supported, status, ensureSubscribed]);

  const enable = useCallback(async () => {
    if (!supported) return;
    setStatus('busy');
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await ensureSubscribed();
      } else if (permission === 'denied') {
        setStatus('denied');
      } else {
        setStatus('default');
      }
    } catch {
      setStatus('unsupported');
    }
  }, [supported, ensureSubscribed]);

  const hasSubscribed = supported && (status === 'granted' || status === 'busy');
  const shouldAsk = supported && status === 'default';

  return { supported, status, hasSubscribed, shouldAsk, enable };
}