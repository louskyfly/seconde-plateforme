import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { ChatMemberInfo } from '@/types';

function dateCourte(iso: string): string {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString('fr-FR');
}

/**
 * Liste de tous les membres du chat, pour le délégué.
 *
 * C'est la réponse à « voir tous les membres » : chaque élève inscrit, son
 * arrivée, son dernier passage et son nombre de messages. Repliée par défaut
 * pour ne pas surcharger la page chat.
 */
export function ChatMembers() {
  const [members, setMembers] = useState<ChatMemberInfo[]>([]);
  const [error, setError] = useState(false);
  const [charge, setCharge] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await api.getChatMembers());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setCharge(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="glass-card p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
          Membres du chat{charge && !error ? ` (${members.length})` : ''}
        </h3>
        <button
          type="button"
          onClick={load}
          className="px-2 py-1 rounded-lg glass text-[11px] font-semibold hover:bg-white/10"
        >
          Actualiser
        </button>
      </div>

      {error && <p className="text-[11px] text-red-500 mt-2">Liste indisponible.</p>}

      {!error && charge && members.length === 0 && (
        <p className="text-[11px] text-gray-500 mt-2">Aucun élève inscrit au chat.</p>
      )}

      {!error && members.length > 0 && (
        <ul className="mt-2 space-y-1 max-h-64 overflow-y-auto">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-2 px-2 py-1.5 rounded-lg bg-white/5 dark:bg-white/10"
            >
              <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                {m.display_name}
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 flex-1">
                inscrit le {dateCourte(m.joined_at)}
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                {m.message_count} message{m.message_count > 1 ? 's' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
