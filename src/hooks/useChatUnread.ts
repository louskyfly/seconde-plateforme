import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { generateFingerprint, setAppBadge } from '@/lib/utils';

/** Pastille « non lu » sur l'icône du chat + sur l'icône de l'application. */
export function useChatUnread(enabled = true, pollMs = 10000): number {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    const check = () => {
      api
        .getChatUnread(generateFingerprint())
        .then((data) => {
          if (mounted) setUnread(data.unread);
        })
        .catch(() => {});
    };

    check();
    const id = setInterval(check, pollMs);

    /*
     * Le compteur ne se rafraîchissait qu'avec le timer de 10 s : en revenant
     * sur l'onglet juste après avoir lu ses messages, la pastille restait
     * affichée et l'élève croyait qu'il avait encore des messages à lire.
     * On réinterroge donc immédiatement au retour sur la page.
     */
    const onWake = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);

    return () => {
      mounted = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [enabled, pollMs]);

  /* Reprend le nombre de non-lus sur l'icône de l'application (PWA installée) */
  useEffect(() => {
    setAppBadge(unread);
  }, [unread]);

  return unread;
}
