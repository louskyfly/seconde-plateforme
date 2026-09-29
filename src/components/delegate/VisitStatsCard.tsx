import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { VisitStats } from '@/types';

/** « 29/09 » à partir de « 2026-09-29 ». */
function jourCourt(day: string): string {
  const [, mois, jour] = day.split('-');
  return `${jour}/${mois}`;
}

function heure(iso: string): string {
  // SQLite écrit « YYYY-MM-DD HH:MM:SS » en UTC. On préfère l'heure locale de
  // l'élève : `new Date` interprète correctement le suffixe Z une fois ajouté.
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime())
    ? iso.slice(11, 16)
    : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Statistiques de visites du délégué.
 *
 * Deux angles : le nombre d'élèves distincts par jour (le vrai indicateur) et,
 * pour aujourd'hui, la liste des appareils venus avec l'heure de passage. Les
 * empreintes ne sont jamais montrées en clair, seulement un libellé court.
 */
export function VisitStatsCard() {
  const [stats, setStats] = useState<VisitStats | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setStats(await api.getVisits(14));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="glass-card p-3">
        <p className="text-xs text-gray-500">Statistiques de visites indisponibles.</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="glass-card p-3">
        <p className="text-xs text-gray-500">Chargement des visites...</p>
      </div>
    );
  }

  // La semaine commençait par le jour le plus récent : on la remet dans l'ordre
  // naturel pour que le coup d'œil donne la tendance, pas le dernier jour.
  const jours = [...stats.days].reverse();
  const max = Math.max(1, ...jours.map((j) => j.visitors));

  // `jours` est dans l'ordre chronologique : le dernier est aujourd'hui, et le
  // premier est le plus ancien de la fenêtre.
  const aujourdHui = jours[jours.length - 1];
  const premier = jours[0];

  return (
    <div className="glass-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Visites</h3>
        <button
          type="button"
          onClick={load}
          className="px-2 py-1 rounded-lg glass text-[11px] font-semibold hover:bg-white/10"
        >
          Actualiser
        </button>
      </div>

      {aujourdHui ? (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-300">
            {aujourdHui.visitors}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            élève{aujourdHui.visitors > 1 ? 's' : ''} aujourd’hui
            {aujourdHui.hits > 0 && ` · ${aujourdHui.hits} ouverture${aujourdHui.hits > 1 ? 's' : ''}`}
          </span>
        </div>
      ) : (
        <p className="text-xs text-gray-500">Aucune visite enregistrée aujourd’hui.</p>
      )}

      {jours.length > 0 && (
        <div className="space-y-1">
          {jours.map((j) => (
            <div key={j.day} className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500 dark:text-gray-400 w-10">
                {jourCourt(j.day)}
              </span>
              <span
                className="h-2 rounded-full bg-indigo-500/70"
                style={{ width: `${Math.max(4, (j.visitors / max) * 100)}%` }}
              />
              <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
                {j.visitors}
              </span>
            </div>
          ))}
        </div>
      )}

      {stats.identites.length > 0 && (
        <details className="pt-1 border-t border-white/10">
          <summary className="text-[11px] text-gray-500 dark:text-gray-400 cursor-pointer">
            Qui est passé aujourd’hui ({stats.identites.length})
          </summary>
          <ul className="mt-1.5 space-y-1">
            {stats.identites.map((id, i) => (
              <li key={i} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono text-gray-600 dark:text-gray-300">{id.label}</span>
                <span className="text-gray-500 dark:text-gray-400 flex-1 truncate">
                  {id.page ?? '/'}
                </span>
                <span className="text-gray-400">
                  {heure(id.first_seen_at)} → {heure(id.last_seen_at)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {premier && premier.day !== aujourdHui?.day && (
        <p className="text-[10px] text-gray-400">
          Depuis le {jourCourt(premier.day)}.
        </p>
      )}
    </div>
  );
}
