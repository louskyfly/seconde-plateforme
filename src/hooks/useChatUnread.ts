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
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [enabled, pollMs]);

  /* Reprend le nombre de non-lus sur l'icône de l'application (PWA installée) */
  useEffect(() => {
    if (!enabled) return;
    setAppBadge(unread);
  }, [unread, enabled]);

  return unread;
}
