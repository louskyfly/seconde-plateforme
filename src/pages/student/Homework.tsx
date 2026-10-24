import { useState, useEffect, useMemo, useCallback } from 'react';
import { subscribeHomework } from '@/lib/api';
import { dayLabel, localDayKey, shortDate, subjectChipClass, updatedLabel } from '@/lib/homework';
import { LoadError } from '@/components/ui/LoadError';
import type { Homework as HomeworkData, HomeworkDay } from '@/types';

/**
 * Cahier de textes, en lecture seule. Les devoirs sont recopiés depuis
 * École Directe par une synchronisation externe ; le site ne fait que les
 * afficher, en temps réel.
 */
export default function Homework() {
  const [data, setData] = useState<HomeworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Fait avancer « il y a X » et le passage à minuit sans recharger la page.
  const [, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    return subscribeHomework(
      (h) => {
        setData(h);
        setLoadError(false);
        setLoading(false);
      },
      () => {
        setLoadError(true);
        setLoading(false);
      }
    );
  }, [attempt]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const today = localDayKey();
  const { upcoming, past } = useMemo(() => {
    const days = data?.days ?? [];
    return {
      upcoming: days.filter((d) => d.date >= today),
      past: days.filter((d) => d.date < today).reverse(),
    };
  }, [data, today]);

  const hasAny = upcoming.length + past.length > 0;
  const testsCount = upcoming.reduce((n, d) => n + d.items.filter((i) => i.is_test).length, 0);

  return (
    <div className="animate-fadeIn">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Devoirs</h1>
        {data && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {updatedLabel(data.updated_at)} · Source : {data.source}
          </p>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-card animate-pulse">
              <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700 mb-3" />
              <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-700 mb-2" />
              <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      )}

      {!loading && loadError && (
        <LoadError onRetry={retry}>
          Impossible de charger le cahier de textes. Les devoirs sont sûrement toujours là, ce
          n'est qu'un problème de réseau.
        </LoadError>
      )}

      {!loading && !loadError && !hasAny && (
        <div className="glass-card text-center py-10">
          <p className="text-3xl mb-3">📒</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Aucun devoir dans le cahier de textes pour le moment
          </p>
        </div>
      )}

      {!loading && !loadError && hasAny && (
        <div className="space-y-6">
          {testsCount > 0 && (
            <div className="glass-card flex items-center gap-3 py-3">
              <span className="text-2xl">📝</span>
              <p className="text-sm">
                <span className="font-bold">
                  {testsCount} contrôle{testsCount > 1 ? 's' : ''}
                </span>{' '}
                à venir
              </p>
            </div>
          )}

          {upcoming.length === 0 ? (
            <div className="glass-card text-center py-8">
              <p className="text-2xl mb-2">🎉</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Rien à faire pour les prochains jours</p>
            </div>
          ) : (
            upcoming.map((day) => <DaySection key={day.date} day={day} today={today} />)
          )}

          {past.length > 0 && (
            <details className="group">
              <summary className="glass-button text-xs px-4 py-2 inline-flex cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">▸ Jours passés ({past.length})</span>
                <span className="hidden group-open:inline">▾ Masquer les jours passés</span>
              </summary>
              <div className="space-y-6 mt-4 opacity-70">
                {past.map((day) => (
                  <DaySection key={day.date} day={day} today={today} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function DaySection({ day, today }: { day: HomeworkDay; today: string }) {
  return (
    <section>
      <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
        {dayLabel(day.date, today)}
      </h2>
      <div className="space-y-3">
        {day.items.map((item) => (
          <div key={item.id} className="glass-card">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${subjectChipClass(item.subject)}`}
              >
                {item.subject || 'Matière'}
              </span>
              {item.is_test && (
                <span className="inline-block px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold uppercase tracking-wide">
                  Contrôle
                </span>
              )}
              {item.teacher && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{item.teacher}</span>
              )}
            </div>
            {item.content ? (
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                {item.content}
              </p>
            ) : (
              <p className="text-sm italic text-gray-400 dark:text-gray-500">Pas de détail</p>
            )}
            {item.given_on && (
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
                Donné le {shortDate(item.given_on)}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
