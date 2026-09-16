import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import type { Poll, PollOption } from '@/types';
import { formatDate } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';

interface PollFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function PollForm({ isOpen, onClose, onSaved }: PollFormProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setQuestion('');
    setOptions(['', '']);
    setAllowMultiple(false);
    setShowResults(true);
    setAnonymous(false);
    setError('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const addOption = () => setOptions([...options, '']);
  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== idx));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.createPoll({
        question,
        options: options.map((o) => o.trim()).filter(Boolean),
        allow_multiple: allowMultiple ? 1 : 0,
        show_results: showResults ? 1 : 0,
        anonymous: anonymous ? 1 : 0,
      });
      reset();
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const valid = question.trim() && options.filter((o) => o.trim()).length >= 2;

  return (
    <Modal isOpen={isOpen} onClose={close} title="Créer un sondage">
      <form onSubmit={submit} className="space-y-4">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Question du sondage"
          className="glass-input"
          required
        />

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Options</p>
          {options.map((opt, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                value={opt}
                onChange={(e) =>
                  setOptions(options.map((o, i) => (i === idx ? e.target.value : o)))
                }
                placeholder={`Option ${idx + 1}`}
                className="glass-input"
              />
              <button
                type="button"
                onClick={() => removeOption(idx)}
                disabled={options.length <= 2}
                className="glass-button w-11 px-0 text-red-500 disabled:opacity-40 disabled:pointer-events-none"
                aria-label={`Supprimer l'option ${idx + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className="glass-button w-full text-sm text-indigo-600 dark:text-indigo-400"
          >
            + Ajouter une option
          </button>
        </div>

        <div className="space-y-2">
          {[
            { label: 'Choix multiple', checked: allowMultiple, set: setAllowMultiple },
            { label: 'Afficher les résultats', checked: showResults, set: setShowResults },
            { label: 'Sondage anonyme', checked: anonymous, set: setAnonymous },
          ].map(({ label, checked, set }) => (
            <label key={label} className="flex items-center gap-3 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => set(e.target.checked)}
                className="w-5 h-5 accent-indigo-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
            </label>
          ))}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={busy || !valid}
          className="glass-button-primary w-full disabled:opacity-50"
        >
          {busy ? 'Création...' : 'Créer le sondage'}
        </button>
      </form>
    </Modal>
  );
}

interface ConfirmDialogProps {
  poll: Poll | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDialog({ poll, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <Modal isOpen={!!poll} onClose={onCancel} title="Supprimer le sondage">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
        Voulez-vous vraiment supprimer ce sondage ? Cette action est irréversible.
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

export function ManagePolls() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [toDelete, setToDelete] = useState<Poll | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    api.getPolls()
      .then(setPolls)
      .catch((err: any) => setError(err.message || 'Erreur'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const active = polls.filter((p) => p.active === 1);
  const closed = polls.filter((p) => p.active === 0);

  const toggleActive = async (poll: Poll) => {
    setBusyId(poll.id);
    try {
      await api.updatePoll(poll.id, { active: poll.active === 1 ? 0 : 1 });
      load();
    } catch (err: any) {
      setError(err.message || 'Erreur');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await api.deletePoll(toDelete.id);
      setToDelete(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Erreur');
    }
  };

  const maxVotes = (options: PollOption[] | undefined) =>
    Math.max(1, ...(options || []).map((o) => o.vote_count || 0));
  const totalVotes = (options: PollOption[] | undefined) =>
    (options || []).reduce((acc, o) => acc + (o.vote_count || 0), 0);

  const PollCard = ({ poll }: { poll: Poll }) => (
    <div className="glass-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h3 className="font-semibold flex-1 min-w-0">{poll.question}</h3>
        <span
          className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${
            poll.active === 1
              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
              : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          {poll.active === 1 ? 'Actif' : 'Clôturé'}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {(poll.options || []).map((o) => {
          const votes = o.vote_count || 0;
          return (
            <div key={o.id}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-700 dark:text-gray-300">{o.text}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{votes} voix</span>
              </div>
              <div className="h-2 rounded-full bg-gray-200/70 dark:bg-gray-700/70 overflow-hidden">
                {poll.show_results === 1 && (
                  <div
                    className="h-full rounded-full bg-indigo-500/80 transition-all"
                    style={{ width: `${votes === 0 ? 0 : Math.max(6, (votes / maxVotes(poll.options)) * 100)}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap mt-4">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {totalVotes(poll.options)} vote(s) · créé le {formatDate(poll.created_at)}
        </span>
        <div className="flex gap-2">
          <button
            disabled={busyId === poll.id}
            onClick={() => toggleActive(poll)}
            className={`glass-button text-xs px-3 py-2 ${
              poll.active === 1 ? '' : 'bg-green-500/20 text-green-600 dark:text-green-400'
            }`}
          >
            {poll.active === 1 ? 'Clôturer' : 'Rouvrir'}
          </button>
          <button
            onClick={() => setToDelete(poll)}
            className="glass-button text-xs px-3 py-2 bg-red-500/90 text-white border-red-400/30"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Sondages</h1>
        <button onClick={() => setShowCreate(true)} className="glass-button-primary text-sm">
          + Créer un sondage
        </button>
      </div>

      {error && (
        <div className="glass-card border-red-300/40 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : polls.length === 0 ? (
        <div className="glass-card text-center py-12">
          <div className="text-4xl mb-3">🗳️</div>
          <p className="text-gray-500 dark:text-gray-400">Aucun sondage</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Sondages actifs
              </h2>
              <div className="space-y-3">
                {active.map((p) => <PollCard key={p.id} poll={p} />)}
              </div>
            </section>
          )}
          {closed.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Sondages clôturés
              </h2>
              <div className="space-y-3 opacity-90">
                {closed.map((p) => <PollCard key={p.id} poll={p} />)}
              </div>
            </section>
          )}
        </>
      )}

      <PollForm
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={load}
      />
      <ConfirmDialog
        poll={toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default ManagePolls;