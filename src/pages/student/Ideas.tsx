import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { getRelativeTime, CATEGORIES_IDEA, IDEA_STATUSES } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import type { Idea } from '@/types';

const CATEGORIES = Object.keys(CATEGORIES_IDEA);

export default function Ideas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCat, setFormCat] = useState('classe');
  const [formAnon, setFormAnon] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchIdeas = useCallback(() => {
    api
      .getIdeas()
      .then((data) =>
        setIdeas(data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  const resetForm = () => {
    setFormTitle('');
    setFormDesc('');
    setFormCat('classe');
    setFormAnon(false);
  };

  const handleSubmit = async () => {
    if (!formTitle.trim()) return;
    setSubmitting(true);
    try {
      await api.createIdea({
        title: formTitle.trim(),
        description: formDesc.trim(),
        category: formCat,
        anonymous: formAnon ? 1 : 0,
      });
      resetForm();
      setModalOpen(false);
      setSuccessMsg('Votre idée a été envoyée !');
      fetchIdeas();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = filter ? ideas.filter((i) => i.category === filter) : ideas;

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Boîte à idées</h1>
        <button onClick={() => setModalOpen(true)} className="glass-button-primary text-sm">
          Proposer une idée
        </button>
      </div>

      {successMsg && (
        <div className="glass-card mb-4 border-l-4 border-l-green-400 text-green-700 dark:text-green-400 text-sm animate-slideUp">
          ✅ {successMsg}
        </div>
      )}

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
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(filter === cat ? null : cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filter === cat
                ? 'bg-indigo-500 text-white'
                : 'glass text-gray-600 dark:text-gray-400'
            }`}
          >
            {CATEGORIES_IDEA[cat]}
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

      {!loading && filtered.length === 0 && (
        <div className="glass-card text-center py-10">
          <p className="text-3xl mb-3">💡</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Aucune idée pour le moment. Sois le premier !
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((idea) => {
            const status = IDEA_STATUSES[idea.status];
            return (
              <div key={idea.id} className="glass-card">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm">{idea.title}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[10px] font-medium">
                        {CATEGORIES_IDEA[idea.category] || idea.category}
                      </span>
                      {status && (
                        <span className="flex items-center gap-1 text-[10px] font-medium">
                          <span className={`w-2 h-2 rounded-full ${status.color}`} />
                          {status.label}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">
                        {getRelativeTime(idea.created_at)}
                      </span>
                      {idea.anonymous === 1 && (
                        <span className="text-[10px] text-gray-400">Anonyme</span>
                      )}
                    </div>
                  </div>
                </div>

                {idea.description && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap mb-2">
                    {idea.description}
                  </p>
                )}

                {idea.delegate_response && (
                  <div className="mt-2 p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-200/50 dark:border-indigo-700/30">
                    <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                      Réponse du délégué
                    </p>
                    <p className="text-xs text-gray-700 dark:text-gray-300">
                      {idea.delegate_response}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Proposer une idée">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              Titre *
            </label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Résumé de ton idée"
              className="glass-input"
              maxLength={100}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              Description
            </label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="Décris ton idée en détail..."
              className="glass-input min-h-[100px] resize-y"
              rows={4}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              Catégorie
            </label>
            <select
              value={formCat}
              onChange={(e) => setFormCat(e.target.value)}
              className="glass-input"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORIES_IDEA[cat]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formAnon}
              onChange={(e) => setFormAnon(e.target.checked)}
              className="w-4 h-4 rounded accent-indigo-500"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Rester anonyme</span>
          </label>
          <button
            onClick={handleSubmit}
            disabled={!formTitle.trim() || submitting}
            className="glass-button-primary w-full disabled:opacity-50"
          >
            {submitting ? 'Envoi...' : 'Envoyer mon idée'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
