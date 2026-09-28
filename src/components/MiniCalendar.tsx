import { useMemo, useState } from 'react';
import type { Event } from '@/types';

const WEEKDAYS = ['L', 'M', 'J', 'V', 'S', 'D', 'D'];
const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** Clef de jour au format AAAA-MM-JJ, en heure locale (indispensable pour comparer). */
function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Petit calendrier mensuel avec une pastille sur les jours ayant au moins un
 * événement. Les dates sont formatées en heure locale partout : le serveur
 * renvoyant de l'UTC, une conversion en UTC décalerait la pastille d'un jour.
 */
export function useEventDays(events: Event[]): Set<string> {
  return useMemo(() => {
    const days = new Set<string>();
    for (const event of events) {
      const d = new Date(event.date);
      if (!Number.isNaN(d.getTime())) days.add(dayKey(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    return days;
  }, [events]);
}

interface MiniCalendarProps {
  events: Event[];
  /** Date sélectionnée : elle est surlignée dans la grille. */
  selected?: Date;
  onSelectDay?: (date: Date) => void;
  compact?: boolean;
}

export function MiniCalendar({ events, selected, onSelectDay, compact = false }: MiniCalendarProps) {
  const today = new Date();
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const eventDays = useEventDays(events);

  // Grille de 6 semaines : les jours du mois Neighbor, complétés au début et
  // à la fin, comme un vrai calendrier papier.
  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    // getDay() : 0 = dimanche, la grille française commence le lundi.
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(view.getFullYear(), view.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return {
        date,
        inMonth: date.getMonth() === view.getMonth(),
        hasEvent: eventDays.has(dayKey(date.getFullYear(), date.getMonth(), date.getDate())),
        isToday:
          date.getDate() === today.getDate() &&
          date.getMonth() === today.getMonth() &&
          date.getFullYear() === today.getFullYear(),
      };
    });
  }, [view, eventDays, today]);

  const shift = (delta: number) => setView(new Date(view.getFullYear(), view.getMonth() + delta, 1));
  const sameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

  const cell = compact ? 'h-7 text-[11px]' : 'h-9 text-xs';

  return (
    <div className="glass-card p-3">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="w-7 h-7 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/50 flex items-center justify-center"
          aria-label="Mois précédent"
        >
          ‹
        </button>
        <p className="text-sm font-bold capitalize">
          {MONTHS[view.getMonth()]} {view.getFullYear()}
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          className="w-7 h-7 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/50 flex items-center justify-center"
          aria-label="Mois suivant"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map((label, i) => (
          <span
            key={i}
            className={`${cell} flex items-center justify-center text-[10px] font-semibold text-gray-400 dark:text-gray-500`}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map(({ date, inMonth, hasEvent, isToday }) => {
          const isSelected = selected ? sameDay(date, selected) : false;
          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onSelectDay?.(date)}
              disabled={!onSelectDay}
              aria-label={`${date.getDate()} ${MONTHS[date.getMonth()]}${hasEvent ? ', événement' : ''}`}
              className={`${cell} relative flex flex-col items-center justify-center rounded-lg transition-colors ${
                inMonth ? 'text-gray-700 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'
              } ${isSelected ? 'bg-indigo-500 text-white font-bold' : ''} ${
                isToday && !isSelected ? 'ring-1 ring-indigo-400 font-bold' : ''
              } ${onSelectDay ? 'hover:bg-indigo-500/15 cursor-pointer' : 'cursor-default'}`}
            >
              <span>{date.getDate()}</span>
              {hasEvent && (
                <span
                  className={`absolute bottom-0.5 w-1 h-1 rounded-full ${
                    isSelected ? 'bg-white' : 'bg-indigo-500'
                  }`}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      {eventDays.size > 0 && (
        <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500 text-center">
          {eventDays.size} jour(s) avec un événement
        </p>
      )}
    </div>
  );
}
