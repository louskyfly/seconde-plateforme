import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

/**
 * Vraies notifications sur l'écran de l'iPad (Web Push), 100 % gratuit :
 * - l'appareil s'abonne avec la clé publique VAPID ci-dessous et l'abonnement
 *   est rangé dans Firebase (`pushSubs`) ;
 * - un robot GitHub Actions (.github/workflows/push-notifications.yml) surveille
 *   les nouveautés et envoie la notification, même site fermé.
 *
 * Sur iPad/iPhone (iPadOS 16.4+), Apple n'autorise les notifications que si le
 * site a été ajouté à l'écran d'accueil et ouvert depuis l'icône.
 */
export const VAPID_PUBLIC_KEY =
  'BBV2uv63gwvTZrDnqDHkytVOvKhfNWOcqqQRH4MHyLyWnOvhY-1vnQeNdg5qDRi4wXXUIZD7-GWmMR54WoM5efY';

type PushStatus = 'unsupported' | 'needs-install' | 'default' | 'granted' | 'denied' | 'busy';

const DISMISS_KEY = 'push_banner_dismissed';

function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray.buffer as ArrayBuffer;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
  );
}

function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function initial(): PushStatus {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'default';
}

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>(initial);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  const ensureSubscribed = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(VAPID_PUBLIC_KEY),
      });
    }
    await api.subscribePush(sub.toJSON() as any);
    setStatus('granted');
  }, []);

  // Déjà autorisé : on renouvelle l'abonnement à chaque ouverture (il peut changer).
  useEffect(() => {
    if (status !== 'granted') return;
    ensureSubscribed().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enable = useCallback(async () => {
    if (!pushSupported()) return;
    setStatus('busy');
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await ensureSubscribed();
      } else {
        setStatus(permission === 'denied' ? 'denied' : 'default');
      }
    } catch {
      setStatus(Notification.permission === 'granted' ? 'granted' : 'default');
    }
  }, [ensureSubscribed]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* stockage indisponible */
    }
    setDismissed(true);
  }, []);

  const supported = status !== 'unsupported' && status !== 'needs-install';
  const hasSubscribed = status === 'granted';
  const shouldAsk = !dismissed && (status === 'default' || status === 'busy' || status === 'needs-install');

  return { supported, status, hasSubscribed, shouldAsk, enable, dismiss };
}
