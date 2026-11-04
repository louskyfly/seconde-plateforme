import type { PollOption } from '@/types';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#a855f7', '#ef4444', '#84cc16'];

/**
 * Graphique en anneau des résultats d'un sondage.
 *
 * Dessiné en SVG (aucune librairie) : chaque option est un arc proportionnel,
 * avec une légende lisible et le total au centre. `pathLength=100` permet de
 * raisonner directement en pourcentages, ce qui évite les erreurs d'arrondi
 * dans le calcul des arcs.
 */
export function PollChart({
  options,
  total,
  size = 150,
}: {
  options: PollOption[] | undefined;
  total: number;
  size?: number;
}) {
  const list = options || [];
  let offset = 0;
  const slices = list.map((o, i) => {
    const value = o.vote_count || 0;
    const pct = total > 0 ? (value / total) * 100 : 0;
    const slice = {
      id: o.id,
      text: o.text,
      value,
      pct,
      color: COLORS[i % COLORS.length],
      offset,
    };
    offset += pct;
    return slice;
  });

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            className="text-gray-200/80 dark:text-gray-700/60"
          />
          {slices
            .filter((s) => s.pct > 0)
            .map((s) => (
              <circle
                key={s.id}
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={s.color}
                strokeWidth="12"
                pathLength={100}
                strokeDasharray={`${s.pct} ${100 - s.pct}`}
                strokeDashoffset={-s.offset}
                className="transition-all duration-700"
              />
            ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold leading-none">{total}</span>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            vote{total > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <ul className="min-w-[180px] flex-1 space-y-1.5">
        {slices.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200">{s.text}</span>
            <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-100">{s.value}</span>
            <span className="w-9 text-right tabular-nums text-gray-400 dark:text-gray-500">
              {Math.round(s.pct)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PollChart;
