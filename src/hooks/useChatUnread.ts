import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { generateFingerprint } from '@/lib/utils';

/** Pastille « non lu » sur l'icône du chat, rafraîchie en arrière-plan. */
export function useChatUnread(enabled = true, pollMs = 20000): number {
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

  return unread;
}
