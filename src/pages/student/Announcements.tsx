import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { getRelativeTime, CATEGORIES_ANNOUNCEMENT, generateFingerprint } from '@/lib/utils';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { LoadError } from '@/components/ui/LoadError';
import type { Announcement } from '@/types';

const ALL_CATEGORIES = Object.keys(CATEGORIES_ANNOUNCEMENT);

const REACTIONS = [
  { key: 'vu', emoji: '👍', label: "J'ai vu" },
  { key: 'jaime', emoji: '❤️', label: "J'aime" },
  { key: 'question', emoji: '❓', label: 'Question' },
  { key: 'important', emoji: '⚠️', label: 'À retenir' },
];

export default function Announcements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getAnnouncements(generateFingerprint());
      setAnnouncements(
        data
          .filter((a) => a.published)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      );
      setLoadError(false);
    } catch {
      // Une erreur ne doit pas se lire comme « aucune information ».
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useAutoRefresh(load);

  const filtered = activeCategory
    ? announcements.filter((a) => a.category === activeCategory)
    : announcements;

  const toggle = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const react = useCallback(async (a: Announcement, key: string) => {
    const fingerprint = generateFingerprint();
    setAnnouncements((prev) =>
      prev.map((x) => {
        if (x.id !== a.id) return x;
        const reactions = { ...(x.reactions || {}) };
        const mine = new Set(x.my_reactions || []);
        if (mine.has(key)) {
          mine.delete(key);
          reactions[key] = Math.max(0, (reactions[key] || 0) - 1);
          if (reactions[key] === 0) delete reactions[key];
        } else {
          mine.add(key);
          reactions[key] = (reactions[key] || 0) + 1;
        }
        return { ...x, reactions, my_reactions: [...mine] };
      })
    );
    try {
      const res = await api.reactToAnnouncement(a.id, key, fingerprint);
      setAnnouncements((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, reactions: res.reactions, my_reactions: res.my_reactions } : x))
      );
    } catch {
      setAnnouncements((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, reactions: a.reactions, my_reactions: a.my_reactions } : x))
      );
    }
  }, []);

  return (
    <div className="animate-fadeIn">
      <h1 className="text-2xl font-bold mb-4">Informations</h1>

      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            activeCategory === null
              ? 'bg-indigo-500 text-white'
              : 'glass text-gray-600 dark:text-gray-400'
          }`}
        >
          Tout
        </button>
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeCategory === cat
                ? 'bg-indigo-500 text-white'
                : 'glass text-gray-600 dark:text-gray-400'
            }`}
          >
            {CATEGORIES_ANNOUNCEMENT[cat]}
          </button>
        ))}
      </div>

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

      {!loading && loadError && <LoadError onRetry={load} />}

      {!loading && !loadError && filtered.length === 0 && (
        <div className="glass-card text-center py-10">
          <p className="text-3xl mb-3">📭</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Aucune information pour le moment
          </p>
        </div>
      )}

      {!loading && !loadError && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((a) => {
            const isImportant = a.importance === 'important' || a.category === 'important';
            return (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                onClick={() => toggle(a.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle(a.id);
                  }
                }}
                className={`glass-card w-full cursor-pointer text-left transition-all ${
                  isImportant
                    ? 'border-l-4 border-l-amber-400 dark:border-l-amber-500'
                    : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-bold text-sm">{a.title}</h3>
                      {isImportant && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-600 dark:text-amber-400">
                          Important
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{getRelativeTime(a.created_at)}</span>
                      <span>·</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[10px] font-medium">
                        {CATEGORIES_ANNOUNCEMENT[a.category] || a.category}
                      </span>
                      {a.author && (
                        <>
                          <span>·</span>
                          <span>{a.author}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-gray-400 text-sm flex-shrink-0 mt-1">
                    {expandedId === a.id ? '▾' : '▸'}
                  </span>
                </div>

                {a.image && (
                  <img
                    src={a.image}
                    alt=""
                    className="mt-3 w-full max-h-72 object-cover rounded-2xl"
                  />
                )}

                {expandedId === a.id && (
                  <div className="mt-3 pt-3 border-t border-white/10 dark:border-gray-700/20 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {a.description}
                    {a.attachment_url && (
                      <a
                        href={a.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mt-2 text-indigo-500 underline text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        📎 Pièce jointe
                      </a>
                    )}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                  {REACTIONS.map((r) => {
                    const count = a.reactions?.[r.key] || 0;
                    const active = (a.my_reactions || []).includes(r.key);
                    return (
                      <button
                        key={r.key}
                        type="button"
                        title={r.label}
                        onClick={() => react(a, r.key)}
                        className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-all active:scale-95 ${
                          active
                            ? 'bg-indigo-500/25 text-indigo-600 ring-1 ring-indigo-500/40 dark:text-indigo-300'
                            : 'glass text-gray-500 hover:bg-gray-100/50 dark:text-gray-400 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <span>{r.emoji}</span>
                        {count > 0 && <span>{count}</span>}
                      </button>
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
