import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/**
 * Nombre d'idées en attente d'étude, pour la pastille rouge sur « Idées ».
 *
 * Côté délégué uniquement : c'est lui qui doit les voir arriver. Le comptage se
 * fait sur `getStats`, déjà chargé par le tableau de bord, donc l'appel est
 * léger et revient à chaque ouverture de l'onglet.
 */
export function usePendingIdeas(enabled = true, pollMs = 30000): number {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    const check = () => {
      api
        .getStats()
        .then((s) => {
          if (mounted) setPending(s.newIdeas ?? 0);
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
