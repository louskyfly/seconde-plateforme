import { useEffect, useRef } from 'react';

/**
 * Rafraîchit une page quand l'élève la rouvre.
 *
 * Avant, chaque page ne chargeait ses données qu'une fois au montage : un
 * élève qui laissait l'application en arrière-plan voyait des données
 * périmées (annonces, événements, projets, fiches, résultats de sondage)
 * jusqu'au rechargement complet de l'onglet.
 *
 * `refresh` doit être stable (useCallback) pour éviter de boucler.
 */
export function useAutoRefresh(
  refresh: () => void | Promise<void>,
  options: { intervalMs?: number; enabled?: boolean } = {}
): void {
  const { intervalMs = 0, enabled = true } = options;
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      const result = refreshRef.current();
      if (result && typeof result.catch === 'function') {
        result.catch(() => {});
      }
    };

    const onWake = () => {
      if (document.visibilityState === 'visible') run();
    };

    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);

    const id = intervalMs > 0 ? window.setInterval(run, intervalMs) : null;

    return () => {
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
      if (id != null) window.clearInterval(id);
    };
  }, [enabled, intervalMs]);
}
