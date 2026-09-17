import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { CATEGORIES_MESSAGE } from '@/lib/utils';

const CATEGORIES = Object.keys(CATEGORIES_MESSAGE);

export default function MessageDelegate() {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('question');
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.sendMessage({
        content: content.trim(),
        category,
        anonymous: anonymous ? 1 : 0,
      });
      setContent('');
      setCategory('question');
      setAnonymous(false);
      setSent(true);
      timerRef.current = window.setTimeout(() => setSent(false), 5000);
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
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Catégorie
          </label>
          <select
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
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Message *
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Écris ton message ici..."
            className="glass-input min-h-[140px] resize-y"
            rows={6}
          />
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
    </div>
  );
}
