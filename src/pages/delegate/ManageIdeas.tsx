import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { Idea } from '@/types';
import { formatDate, IDEA_STATUSES, CATEGORIES_IDEA } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';

interface ConfirmDialogProps {
  idea: Idea | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDialog({ idea, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <Modal isOpen={!!idea} onClose={onCancel} title="Supprimer l'idée">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
        Voulez-vous vraiment supprimer cette idée ? Cette action est irréversible.
      </p>
      <div className="flex gap-3">
        <button onClick={onCancel} className="glass-button flex-1">
          Annuler
        </button>
        <button
          onClick={onConfirm}
          className="glass-button flex-1 bg-red-500/90 text-white border-red-400/30 hover:bg-red-600/90"
        >
          Supprimer
        </button>
      </div>
    </Modal>
  );
}

interface ResponseModalProps {
  idea: Idea | null;
  onClose: () => void;
  onSaved: () => void;
}

function ResponseModal({ idea, onClose, onSaved }: ResponseModalProps) {
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setResponse(idea?.delegate_response || '');
    setError('');
  }, [idea]);

  const submit = async () => {
    if (!idea) return;
    setBusy(true);
    setError('');
    try {
      await api.updateIdea(idea.id, { delegate_response: response });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={!!idea} onClose={onClose} title="Réponse du délégué">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{idea?.title}</p>
        <textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Écrire une réponse au délégué..."
          rows={4}
          className="glass-input resize-none"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          disabled={busy}
          onClick={submit}
          className="glass-button-primary w-full"
        >
          {busy ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </Modal>
  );
}

export function ManageIdeas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [responseTarget, setResponseTarget] = useState<Idea | null>(null);
  const [toDelete, setToDelete] = useState<Idea | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  /** Confirmation éphémère affichée après un changement de statut. */
  const [flash, setFlash] = useState<{ id: number; text: string } | null>(null);

  const load = () => {
    setLoading(true);
    api.getIdeas()
      .then(setIdeas)
      .catch((err: any) => setError(err.message || 'Erreur'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    return ideas.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && i.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!i.title.toLowerCase().includes(q) && !i.description.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [ideas, statusFilter, categoryFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: ideas.length };
    for (const key of Object.keys(IDEA_STATUSES)) {
      c[key] = ideas.filter((i) => i.status === key).length;
    }
    return c;
  }, [ideas]);

  /**
   * Mise à jour optimiste : le statut change immédiatement à l'écran, puis on
   * confirme. Avant, on attendait un rechargement complet de la liste, ce qui
   * donnait l'impression que le menu n'avait rien fait (et pouvait écraser le
   * choix par un état plus ancien). En cas d'échec, on restaure la valeur
   * précédente et on affiche l'erreur.
   */
  const changeStatus = async (idea: Idea, status: string) => {
    if (status === idea.status) return;
    const previous = idea.status;
    setBusyId(idea.id);
    setError('');
    setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, status } : i)));
    setFlash({ id: idea.id, text: `Statut : ${IDEA_STATUSES[status]?.label ?? status}` });
    try {
      await api.updateIdea(idea.id, { status });
    } catch (err: any) {
      setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, status: previous } : i)));
      setError(err.message || 'Impossible de changer le statut');
      setFlash(null);
    } finally {
      setBusyId(null);
      window.setTimeout(() => setFlash((f) => (f?.id === idea.id ? null : f)), 2600);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await api.deleteIdea(toDelete.id);
      setToDelete(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Erreur');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Idées</h1>

      {error && (
        <div className="glass-card border-red-300/40 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Rechercher une idée..."
          className="glass-input"
        />
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="glass-input w-auto"
          >
            <option value="all">Tous les statuts</option>
            {Object.entries(IDEA_STATUSES).map(([key, v]) => (
              <option key={key} value={key}>
                {v.label} ({counts[key] || 0})
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="glass-input w-auto"
          >
            <option value="all">Toutes les catégories</option>
            {Object.entries(CATEGORIES_IDEA).map(([key, v]) => (
              <option key={key} value={key}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-[3px] border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card text-center py-12">
          <div className="text-4xl mb-3">💡</div>
          <p className="text-gray-500 dark:text-gray-400">Aucune idée</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((i) => {
            const statusMeta = IDEA_STATUSES[i.status] || { label: i.status, color: 'bg-gray-400' };
            return (
              <div key={i.id} className="glass-card">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">{i.title}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {CATEGORIES_IDEA[i.category] || i.category} ·{' '}
                      {i.anonymous ? 'Anonyme' : i.author_name || 'Inconnu'} ·{' '}
                      {formatDate(i.created_at)}
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 whitespace-nowrap">
                    <span className={`w-2 h-2 rounded-full ${statusMeta.color}`} />
                    {statusMeta.label}
                  </span>
                </div>

                <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">{i.description}</p>

                {i.delegate_response && (
                  <div className="mt-3 p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40">
                    <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
                      Réponse du délégué
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{i.delegate_response}</p>
                  </div>
                )}

                {flash?.id === i.id && (
                  <p className="mt-3 text-xs font-medium text-green-600 dark:text-green-400">
                    ✓ {flash.text}
                  </p>
                )}

                <div className="flex gap-2 flex-wrap mt-4">
                  <label className="sr-only" htmlFor={`idea-status-${i.id}`}>
                    Statut de l'idée
                  </label>
                  <select
                    id={`idea-status-${i.id}`}
                    value={i.status}
                    disabled={busyId === i.id}
                    onChange={(e) => changeStatus(i, e.target.value)}
                    aria-label={`Statut de « ${i.title} »`}
                    className="glass-input w-auto text-sm disabled:opacity-60"
                  >
                    {Object.entries(IDEA_STATUSES).map(([key, v]) => (
                      <option key={key} value={key}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setResponseTarget(i)}
                    className="glass-button text-xs px-3 py-2"
                  >
                    ✍️ {i.delegate_response ? "Modifier la réponse" : 'Répondre'}
                  </button>
                  <button
                    onClick={() => setToDelete(i)}
                    className="glass-button text-xs px-3 py-2 bg-red-500/90 text-white border-red-400/30"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ResponseModal
        idea={responseTarget}
        onClose={() => setResponseTarget(null)}
        onSaved={load}
      />
      <ConfirmDialog
        idea={toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default ManageIdeas;