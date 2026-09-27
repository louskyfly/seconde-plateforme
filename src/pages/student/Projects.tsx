import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatDate, PROJECT_STATUSES } from '@/lib/utils';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import type { Project } from '@/types';

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getProjects();
      setProjects(data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
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

  return (
    <div className="animate-fadeIn">
      <h1 className="text-2xl font-bold mb-5">Projets</h1>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-card animate-pulse">
              <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700 mb-3" />
              <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-700 mb-2" />
              <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="glass-card text-center py-10">
          <p className="text-3xl mb-3">🚀</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Aucun projet en cours pour le moment
          </p>
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {projects.map((project) => {
            const status = PROJECT_STATUSES[project.status];
            return (
              <div key={project.id} className="glass-card">
                {status && (
                  <span className="flex items-center gap-1.5 text-[10px] font-bold mb-2">
                    <span className={`w-2 h-2 rounded-full ${status.color}`} />
                    {status.label}
                  </span>
                )}
                <h3 className="font-bold text-sm mb-1">{project.name}</h3>
                {project.description && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3 whitespace-pre-wrap">
                    {project.description}
                  </p>
                )}
                {project.date && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2">
                    📅 {formatDate(project.date)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
