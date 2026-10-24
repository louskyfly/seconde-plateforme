import { useEffect, useState } from 'react';
import { subscribeHomework } from '@/lib/api';
import { updatedLabel } from '@/lib/homework';
import type { Homework } from '@/types';

/**
 * État de la synchronisation du cahier de textes (lecture seule) : le délégué
 * voit d'un coup d'œil si les devoirs d'École Directe arrivent toujours.
 */
export function HomeworkSyncCard() {
  const [data, setData] = useState<Homework | null>(null);
  const [error, setError] = useState(false);
  const [, setTick] = useState(0);

  useEffect(
    () =>
      subscribeHomework(
        (h) => {
          setData(h);
          setError(false);
        },
        () => setError(true)
      ),
    []
  );

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  const count = data ? data.days.reduce((n, d) => n + d.items.length, 0) : 0;
  // Plus de 2 jours sans synchro : on le signale discrètement.
  const stale = !!data?.updated_at && Date.now() - data.updated_at > 2 * 86400000;

  return (
    <div className="glass-card flex items-center gap-3 py-3">
      <span className="text-2xl flex-shrink-0">📒</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          Cahier de textes : dernière synchro{' '}
          <span className={stale ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-300'}>
            {error
              ? 'indisponible'
              : !data
              ? '…'
              : data.updated_at
              ? new Date(data.updated_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
              : 'jamais'}
          </span>
        </p>
        {data && !error && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {updatedLabel(data.updated_at)} · {count} devoir{count > 1 ? 's' : ''} · Source : {data.source}
          </p>
        )}
      </div>
    </div>
  );
}
