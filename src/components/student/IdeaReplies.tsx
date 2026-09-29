import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { generateFingerprint, getRelativeTime } from '@/lib/utils';
import { useFirstNamePrompt } from '@/hooks/useFirstNamePrompt';
import type { IdeaReply } from '@/types';

/**
 * Fil de discussion sous une idée.
 *
 * Tout le monde peut lire et répondre. Seul l'auteur d'une réponse peut la
 * supprimer, identifié par son fingerprint — comme dans le chat, pour éviter
 * qu'un élève efface les mots des autres.
 */
export function IdeaReplies({ ideaId, onCountChange }: { ideaId: number; onCountChange?: (n: number) => void }) {
  const [replies, setReplies] = useState<IdeaReply[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { ensure, dialog } = useFirstNamePrompt();
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getIdeaReplies(ideaId);
      setReplies(data);
      onCountChange?.(data.filter((r) => !r.deleted_at).length);
    } catch {
      // Le fil est secondaire : son échec ne doit pas casser la carte de l'idée.
      setReplies([]);
    } finally {
      setLoading(false);
    }
  }, [ideaId, onCountChange]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const send = async () => {
    if (!draft.trim()) return;
    const author = await ensure('Pour répondre, il me faut ton prénom.');
    if (!author) return;

    setSending(true);
    setError('');
    try {
      await api.createIdeaReply(ideaId, {
        content: draft.trim(),
        author_name: author,
        fingerprint: generateFingerprint(),
      });
      setDraft('');
      await load();
      // Le fil vient d'être rechargé : on ramène la vue sur le dernier message.
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    } catch (err: any) {
      setError(err.message || "L'envoi a échoué. Réessaie.");
    } finally {
      setSending(false);
    }
  };

  const remove = async (reply: IdeaReply) => {
    if (!window.confirm('Supprimer ta réponse ?')) return;
    try {
      await api.deleteIdeaReply(reply.id, generateFingerprint());
      await load();
    } catch (err: any) {
      setError(err.message || 'Suppression impossible');
    }
  };

  const live = replies.filter((r) => !r.deleted_at).length;

  return (
    <div className="mt-2 border-t border-gray-200/60 dark:border-white/10 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
        aria-expanded={open}
      >
        {open ? 'Masquer' : 'Répondre'}
        {live > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-[10px]">
            {live}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {loading && <p className="text-[11px] text-gray-500">Chargement…</p>}

          {!loading && replies.length === 0 && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Aucune réponse. Lance la discussion.
            </p>
          )}

          <ul className="space-y-2">
            {replies.map((r) => (
              <li key={r.id} className="text-[11px] leading-relaxed">
                <span className="font-bold">{r.author_name || 'Élève'}</span>{' '}
                <span className="text-gray-400">{getRelativeTime(r.created_at)}</span>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{r.content}</p>
              </li>
            ))}
          </ul>
          <div ref={endRef} />

          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ta réponse…"
              maxLength={1000}
              className="flex-1 px-3 py-2 rounded-xl glass text-xs outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim() || sending}
              className="px-3 py-2 rounded-xl bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600 transition-all disabled:opacity-50"
            >
              {sending ? '...' : 'Envoyer'}
            </button>
          </div>

          {error && <p className="text-[11px] text-red-500">{error}</p>}

          {/* Suppression réservée à l'auteur : la liste ne montre que ses
              propres réponses grâce au fingerprint envoyé à l'API. */}
          {replies.some((r) => !r.deleted_at) && (
            <details className="text-[10px] text-gray-500 dark:text-gray-400">
              <summary className="cursor-pointer hover:underline">Gérer mes réponses</summary>
              <ul className="mt-1 space-y-1">
                {replies
                  .filter((r) => !r.deleted_at)
                  .map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {r.content.slice(0, 40)}
                      </span>
                      <button
                        type="button"
                        onClick={() => remove(r)}
                        className="text-red-500 hover:underline shrink-0"
                      >
                        Supprimer
                      </button>
                    </li>
                  ))}
              </ul>
            </details>
          )}

          {dialog}
        </div>
      )}
    </div>
  );
}
