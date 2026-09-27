import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { generateFingerprint } from '@/lib/utils';

/**
 * Nombre de sondages actifs auxquels l'élève n'a pas encore répondu.
 * Alimente la pastille sur l'icône « Sondages ».
 */
export function usePendingPolls(enabled = true, pollMs = 30000): number {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    const check = () => {
      api
        .getPolls(generateFingerprint())
        .then((data) => {
          if (mounted) setPending(data.filter((p) => p.active === 1 && !p.has_voted).length);
        })
        .catch(() => {});
    };

    check();
    const id = setInterval(check, pollMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      mounted = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [enabled, pollMs]);

  return pending;
}
