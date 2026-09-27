import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatDate, EVENT_CATEGORIES } from '@/lib/utils';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import type { Event } from '@/types';

export default function Calendar() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getEvents();
      setEvents(data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    } catch {
      /* on garde les données déjà affichées */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useAutoRefresh(load);

  const now = new Date();

  const grouped = useMemo(() => {
    const map = new Map<string, Event[]>();
    events.forEach((e) => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(e);
    });
    return map;
  }, [events]);

  return (
    <div className="animate-fadeIn">
      <h1 className="text-2xl font-bold mb-5">Calendrier</h1>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-card animate-pulse">
              <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700 mb-3" />
              <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      )}

      {!loading && events.length === 0 && (
        <div className="glass-card text-center py-10">
          <p className="text-3xl mb-3">📅</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Aucun événement prévu pour le moment
          </p>
        </div>
      )}

      {!loading && (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([key, groupEvents]) => {
            const d = new Date(groupEvents[0].date);
            const monthLabel = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
            return (
              <div key={key}>
                <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 capitalize">
                  {monthLabel}
                </h2>
                <div className="space-y-3">
                  {groupEvents.map((event) => {
                    const eventDate = new Date(event.date);
                    const isPast = eventDate < now;
                    const cat = EVENT_CATEGORIES[event.category];
                    return (
                      <div
                        key={event.id}
                        className={`glass-card transition-all ${
                          isPast ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 flex flex-col items-center justify-center">
                            <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400 leading-none">
                              {eventDate.getDate()}
                            </span>
                            <span className="text-[9px] text-indigo-500 dark:text-indigo-400 uppercase font-medium">
                              {eventDate.toLocaleDateString('fr-FR', { month: 'short' })}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-sm">{event.title}</h3>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {cat && (
                                <span className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[10px] font-medium">
                                  {cat}
                                </span>
                              )}
                              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                {formatDate(event.date)}
                                {event.time ? ` à ${event.time}` : ''}
                              </span>
                            </div>
                            {event.description && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 whitespace-pre-wrap">
                                {event.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
