import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getRelativeTime, SUBJECTS } from '@/lib/utils';
import type { Sheet } from '@/types';

const ALL_SUBJECTS = Object.keys(SUBJECTS);
const PAGE_SIZE = 24;

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
    : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

export default function ManageSheets() {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [subject, setSubject] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      setLoading(true);
      setError('');
      try {
        const data = await api.getSheets({ subject, q: query || null, page: targetPage, status });
        setSheets((prev) => (append ? [...prev, ...data.items] : data.items));
        setTotal(data.total);
        setHasMore(data.has_more);
        setPage(data.page);
      } catch (err: any) {
        setError(err.message || 'Chargement impossible');
      } finally {
        setLoading(false);
      }
    },
    [subject, query, status]
  );

  useEffect(() => {
    load(1, false);
  }, [load]);

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(''), 3500);
  };

  const toggleStatus = async (sheet: Sheet) => {
    const next = sheet.status === 'active' ? 'hidden' : 'active';
    const ok = window.confirm(
      next === 'hidden'
        ? `Masquer la fiche « ${sheet.title} » ?\nLes élèves ne la verront plus, le fichier est conservé.`
        : `Remettre en ligne la fiche « ${sheet.title} » ?`
    );
    if (!ok) return;
    try {
      await api.setSheetStatus(sheet.id, next);
      setSheets((prev) => prev.map((s) => (s.id === sheet.id ? { ...s, status: next } : s)));
      flash(next === 'hidden' ? '✅ Fiche masquée' : '✅ Fiche remise en ligne');
    } catch (err: any) {
      setError(err.message || 'Action impossible');
    }
  };

  const remove = async (sheet: Sheet) => {
    const ok = window.confirm(
      `Supprimer définitivement la fiche « ${sheet.title} » ?\n\n` +
        `Auteur : ${sheet.author_name || 'inconnu'}\n` +
        `Matière : ${SUBJECTS[sheet.subject] || sheet.subject}\n` +
        `Publiée : ${getRelativeTime(sheet.created_at)}\n\n` +
        `Le fichier associé sera effacé. Cette action est irréversible.`
    );
    if (!ok) return;
    try {
      await api.deleteSheet(sheet.id);
      setSheets((prev) => prev.filter((s) => s.id !== sheet.id));
      setTotal((t) => Math.max(0, t - 1));
      flash('✅ Fiche et fichier supprimés');
    } catch (err: any) {
      setError(err.message || 'Suppression impossible');
    }
  };

  return (
    <div className="animate-fadeIn">
      <h1 className="text-2xl font-bold mb-1">Gestion des fiches</h1>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        {total} fiche{total > 1 ? 's' : ''} déposée{total > 1 ? 's' : ''} par les élèves
      </p>

      {notice && (
        <div className="glass-card border-green-300/40 text-green-600 dark:text-green-400 text-xs py-2 px-3 mb-3">
          {notice}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher (titre, description, auteur)..."
        className="w-full px-4 py-2.5 rounded-xl glass text-sm mb-3 outline-none focus:ring-2 focus:ring-indigo-500/40"
      />

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={() => setStatus(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold ${status === null ? 'bg-indigo-500 text-white' : 'glass text-gray-600 dark:text-gray-400'}`}
        >
          En ligne + masquées
        </button>
        <button
          onClick={() => setStatus(status === 'active' ? null : 'active')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold ${status === 'active' ? 'bg-indigo-500 text-white' : 'glass text-gray-600 dark:text-gray-400'}`}
        >
          En ligne
        </button>
        <button
          onClick={() => setStatus(status === 'hidden' ? null : 'hidden')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold ${status === 'hidden' ? 'bg-indigo-500 text-white' : 'glass text-gray-600 dark:text-gray-400'}`}
        >
          Masquées
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setSubject(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold ${subject === null ? 'bg-indigo-500 text-white' : 'glass text-gray-600 dark:text-gray-400'}`}
        >
          Toutes les matières
        </button>
        {ALL_SUBJECTS.map((sub) => (
          <button
            key={sub}
            onClick={() => setSubject(subject === sub ? null : sub)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${subject === sub ? 'bg-indigo-500 text-white' : 'glass text-gray-600 dark:text-gray-400'}`}
          >
            {SUBJECTS[sub]}
          </button>
        ))}
      </div>

      {error && (
        <div className="glass-card border-red-300/40 text-red-600 dark:text-red-400 text-sm mb-4">{error}</div>
      )}

      {loading && sheets.length === 0 && (
        <div className="glass-card animate-pulse h-40" />
      )}

      {!loading && sheets.length === 0 && !error && (
        <div className="glass-card text-center py-10">
          <p className="text-3xl mb-3">📝</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Aucune fiche déposée pour le moment.</p>
        </div>
      )}

      {sheets.length > 0 && (
        <div className="space-y-3">
          {sheets.map((sheet) => (
            <div key={sheet.id} className="glass-card flex flex-col sm:flex-row gap-3">
              <div className="sm:w-28 h-24 sm:h-auto flex-shrink-0 rounded-xl overflow-hidden bg-indigo-500/10 flex items-center justify-center">
                {sheet.kind === 'image' ? (
                  <img
                    src={api.sheetFileUrl(sheet.id, true)}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl">📄</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">
                    {SUBJECTS[sheet.subject] || sheet.subject}
                    {sheet.class_level ? ` · ${sheet.class_level}` : ''}
                  </span>
                  {sheet.status === 'hidden' && (
                    <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500 text-[10px] font-bold">
                      Masquée
                    </span>
                  )}
                </div>

                <h3 className="font-bold text-sm mt-1 break-words">{sheet.title}</h3>
                {sheet.description && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">{sheet.description}</p>
                )}
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                  {sheet.author_name || 'Anonyme'} · {getRelativeTime(sheet.created_at)}
                  {sheet.file_size > 0 ? ` · ${formatSize(sheet.file_size)}` : ''}
                </p>

                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <a
                    href={api.sheetFileUrl(sheet.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-500 hover:underline"
                  >
                    {sheet.kind === 'image' ? '🔍 Voir le fichier' : '⬇️ Télécharger'}
                  </a>
                  <button onClick={() => toggleStatus(sheet)} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">
                    {sheet.status === 'active' ? '🚫 Masquer' : '✅ Remettre en ligne'}
                  </button>
                  <button onClick={() => remove(sheet)} className="text-xs text-red-500 hover:underline">
                    🗑️ Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="text-center mt-5">
          <button onClick={() => load(page + 1, true)} disabled={loading} className="glass-button text-sm px-4 py-2">
            {loading ? 'Chargement...' : 'Charger plus'}
          </button>
        </div>
      )}
    </div>
  );
}
