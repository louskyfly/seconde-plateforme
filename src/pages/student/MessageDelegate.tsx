import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { CATEGORIES_MESSAGE, generateFingerprint, getRelativeTime } from '@/lib/utils';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import type { Message } from '@/types';

const CATEGORIES = Object.keys(CATEGORIES_MESSAGE);
const STATUS_LABELS: Record<string, string> = {
  nouveau: 'En attente de lecture',
  lu: 'Lu par le délégué',
  traite: 'En cours de traitement',
  repondu: 'Répondu',
  cloture: 'Clos',
};

export default function MessageDelegate() {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('question');
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadError, setLoadError] = useState('');
  const timerRef = useRef<number | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    return () => {
      cancelled.current = true;
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  // L'élève pouvait envoyer un message mais n'avait aucun moyen de savoir si
  // le délégué l'avait lu ou répondu : la réponse disparaissait définitivement.
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setLoadError('');
    try {
      const data = await api.getMyMessages(generateFingerprint());
      if (!cancelled.current) setHistory(data);
    } catch (err: any) {
      if (!cancelled.current) setLoadError(err.message || 'Erreur de chargement');
    } finally {
      if (!cancelled.current) setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Permet à l'élève de voir une réponse du délégué sans recharger la page.
  useAutoRefresh(loadHistory);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.sendMessage({
        content: content.trim(),
        category,
        anonymous: anonymous ? 1 : 0,
        fingerprint: generateFingerprint(),
      });
      setContent('');
      setCategory('question');
      setAnonymous(false);
      setSent(true);
      timerRef.current = window.setTimeout(() => setSent(false), 5000);
      loadHistory();
    } catch {
      setError("Erreur lors de l'envoi. Réessaie.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      <h1 className="text-2xl font-bold mb-2">Parler au délégué</h1>

      <div className="glass-card mb-5">
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          Cet espace permet de contacter le délégué de classe de manière simple et rapide.
          Tu peux poser une question, signaler un problème ou partager une information.
        </p>
      </div>

      <div className="glass-card mb-5 border-l-4 border-l-amber-400 dark:border-l-amber-500">
        <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed font-medium">
          ⚠️ Cet espace permet de contacter le délégué, mais ne remplace pas un adulte de confiance.
          En cas de situation urgente ou grave, contacte directement un professeur ou le conseiller principal.
        </p>
      </div>

      {sent && (
        <div className="glass-card mb-5 border-l-4 border-l-green-400 text-green-700 dark:text-green-400 text-sm animate-slideUp">
          ✅ Message envoyé avec succès !
        </div>
      )}

      {error && (
        <div className="glass-card mb-5 border-l-4 border-l-red-400 text-red-700 dark:text-red-400 text-sm animate-slideUp">
          ❌ {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="msg-category" className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Catégorie
          </label>
          <select
            id="msg-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="glass-input"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORIES_MESSAGE[cat]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="msg-content" className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Message *
          </label>
          <textarea
            id="msg-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Écris ton message ici..."
            className="glass-input min-h-[140px] resize-y"
            rows={6}
            maxLength={1000}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 text-right mt-1">
            {content.length}/1000
          </p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            className="w-4 h-4 rounded accent-indigo-500"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">Rester anonyme</span>
        </label>

        <button
          onClick={handleSubmit}
          disabled={!content.trim() || sending}
          className="glass-button-primary w-full disabled:opacity-50"
        >
          {sending ? 'Envoi...' : 'Envoyer le message'}
        </button>
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-bold">Mes messages</h2>
          <button
            onClick={loadHistory}
            disabled={loadingHistory}
            className="glass-button text-xs px-3 py-2 disabled:opacity-50"
          >
            {loadingHistory ? 'Actualisation...' : 'Actualiser'}
          </button>
        </div>

        {loadError && (
          <div className="glass-card border-l-4 border-l-amber-400 text-sm text-amber-700 dark:text-amber-400 mb-3">
            ⚠️ {loadError}
          </div>
        )}

        {!loadingHistory && history.length === 0 && !loadError && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tu n'as encore envoyé aucun message. Tes échanges avec le délégué apparaîtront ici.
          </p>
        )}

        <div className="space-y-3">
          {history.map((msg) => (
            <article key={msg.id} className="glass-card">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {CATEGORIES_MESSAGE[msg.category] || msg.category} · envoyé{' '}
                  {getRelativeTime(msg.created_at)}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  {STATUS_LABELS[msg.status] || msg.status}
                </span>
              </div>

              <p className="mt-2 text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words">
                {msg.content}
              </p>

              {msg.delegate_reply ? (
                <div className="mt-3 ml-2 pl-3 border-l-2 border-indigo-400 bg-indigo-500/5 rounded-r-lg py-2 pr-3">
                  <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
                    {msg.delegate_name || 'Le délégué'} a répondu
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words">
                    {msg.delegate_reply}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                  Pas encore de réponse.
                </p>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
