import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { LoadError } from '@/components/ui/LoadError';
import { formatDate, SUBJECTS } from '@/lib/utils';
import type { RevisionSession } from '@/types';

function heureFin(session: RevisionSession): string | null {
  if (!session.time) return null;
  const [h, m] = session.time.split(':').map(Number);
  const total = h * 60 + m + session.duration;
  if (total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function SessionCard({ session }: { session: RevisionSession }) {
  const fin = heureFin(session);
  const matiere = SUBJECTS[session.subject] ?? session.subject;

  return (
    <li className="px-3 py-2.5 rounded-xl glass">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{session.title}</span>
        <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 font-semibold">
          {matiere}
        </span>
      </div>

      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
        {session.time ? (
          <>
            {session.time}
            {fin && ` — ${fin}`} · {session.duration} min
          </>
        ) : (
          'Toute la journée'
        )}
        {session.location && ` · ${session.location}`}
      </p>

      {session.description && (
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1.5 whitespace-pre-wrap">
          {session.description}
        </p>
      )}
    </li>
  );
}

/** Page élève : les prochaines sessions de révision, groupées par jour. */
export default function Revisions() {
  const [sessions, setSessions] = useState<RevisionSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await api.getRevisionSessions(true));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="text-center text-sm text-gray-500 py-8">Chargement...</div>;
  }

  if (loadError) {
    return <LoadError onRetry={load} />;
  }

  // Groupement par jour : une ligne par session deviendrait vite illisible dès
  // qu'il y a trois sessions le même jour.
  const parJour = new Map<string, RevisionSession[]>();
  for (const s of sessions) {
    const liste = parJour.get(s.date) ?? [];
    liste.push(s);
    parJour.set(s.date, liste);
  }

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">Sessions de révision</h1>

      {sessions.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">
          Aucune session prévue pour le moment.
        </p>
      ) : (
        [...parJour.entries()].map(([jour, liste]) => (
          <section key={jour}>
            <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              {formatDate(jour)}
            </h2>
            <ul className="space-y-1.5">
              {liste.map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
