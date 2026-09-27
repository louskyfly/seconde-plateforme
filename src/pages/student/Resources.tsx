import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { SUBJECTS } from '@/lib/utils';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import type { Resource } from '@/types';

const ALL_SUBJECTS = Object.keys(SUBJECTS);

export default function Resources() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getResources();
      setResources(data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
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

  const filtered = filter ? resources.filter((r) => r.subject === filter) : resources;

  return (
    <div className="animate-fadeIn">
      <h1 className="text-2xl font-bold mb-5">Ressources</h1>

      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setFilter(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            filter === null
              ? 'bg-indigo-500 text-white'
              : 'glass text-gray-600 dark:text-gray-400'
          }`}
        >
          Tout
        </button>
        {ALL_SUBJECTS.map((sub) => (
          <button
            key={sub}
            onClick={() => setFilter(filter === sub ? null : sub)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filter === sub
                ? 'bg-indigo-500 text-white'
                : 'glass text-gray-600 dark:text-gray-400'
            }`}
          >
            {SUBJECTS[sub]}
          </button>
        ))}
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card animate-pulse">
              <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700 mb-3" />
              <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-700 mb-2" />
              <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="glass-card text-center py-10">
          <p className="text-3xl mb-3">📚</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Aucune ressource disponible pour le moment
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((resource) => {
            const subjectLabel = SUBJECTS[resource.subject] || resource.subject;
            return (
              <div key={resource.id} className="glass-card">
                <span className="inline-block px-1.5 py-0.5 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold mb-2">
                  {subjectLabel}
                </span>
                <h3 className="font-bold text-sm mb-1">{resource.title}</h3>
                {resource.description && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                    {resource.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  {resource.link_url && (
                    <a
                      href={resource.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="glass-button text-xs px-3 py-1.5"
                    >
                      🔗 Ouvrir le lien
                    </a>
                  )}
                  {resource.file_url && (
                    <a
                      href={resource.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="glass-button text-xs px-3 py-1.5"
                    >
                      📎 Fichier
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
