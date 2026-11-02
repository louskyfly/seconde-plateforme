import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import type { Poll, PollOption } from '@/types';
import { formatDate } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { PollChart } from '@/components/polls/PollChart';

interface PollFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Sondage en cours d'édition : le formulaire passe en mode modification. */
  editing?: Poll | null;
}

function PollForm({ isOpen, onClose, onSaved, editing }: PollFormProps) {
  const [question, setQuestion] = useState('');
  // On conserve l'identifiant de chaque option : sans lui, retirer une option
  // au milieu décalait les index et réassignait les votes des suivantes.
  const [options, setOptions] = useState<{ id?: string; text: string }[]>([{ text: '' }, { text: '' }]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isEdit = !!editing;

  const reset = () => {
    setQuestion('');
    setOptions([{ text: '' }, { text: '' }]);
    setAllowMultiple(false);
    setShowResults(true);
    setAnonymous(false);
    setError('');
  };

  // Un sondage à modifier est pré-rempli à l'ouverture du formulaire.
  useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (editing) {
      setQuestion(editing.question);
      setOptions((editing.options || []).map((o) => ({ id: o.id, text: o.text })));
      setAllowMultiple(editing.allow_multiple === 1);
      setShowResults(editing.show_results === 1);
      setAnonymous(editing.anonymous === 1);
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editing]);

  const close = () => {
    reset();
    onClose();
  };

  const addOption = () => setOptions([...options, { text: '' }]);
  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== idx));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing) {
        // Les identifiants d'options sont renvoyés : le serveur renomme les
        // options existantes et garde les votes déjà enregistrés.
        await api.updatePoll(editing.id, {
          question,
          options: options
            .map((o) => ({ id: o.id, text: o.text.trim() }))
            .filter((o) => o.text),
          allow_multiple: allowMultiple ? 1 : 0,
          show_results: showResults ? 1 : 0,
          anonymous: anonymous ? 1 : 0,
        });
      } else {
        await api.createPoll({
          question,
          options: options.map((o) => o.text.trim()).filter(Boolean),
          allow_multiple: allowMultiple ? 1 : 0,
          show_results: showResults ? 1 : 0,
          anonymous: anonymous ? 1 : 0,
        });
      }
      reset();
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const valid = question.trim() && options.filter((o) => o.text.trim()).length >= 2;

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={isEdit ? 'Modifier le sondage' : 'Créer un sondage'}
    >
      <form onSubmit={submit} className="space-y-4">
        {isEdit && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Les votes déjà enregistrés sont conservés. Tu peux renommer les options, en
            ajouter, ou retirer une option qui n'a encore reçu aucun vote.
          </p>
        )}
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
            <div key={opt.id ?? `new-${idx}`} className="flex gap-2">
              <input
                value={opt.text}
                onChange={(e) =>
                  setOptions(options.map((o, i) => (i === idx ? { ...o, text: e.target.value } : o)))
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
          {busy ? (isEdit ? 'Enregistrement...' : 'Création...') : isEdit ? 'Enregistrer' : 'Créer le sondage'}
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
  const [editing, setEditing] = useState<Poll | null>(null);
  const [toDelete, setToDelete] = useState<Poll | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState('');
  // Un seul panneau de simulation ouvert à la fois (état partagé).
  const [simFor, setSimFor] = useState<string | null>(null);
  const [simOption, setSimOption] = useState('');
  const [simCount, setSimCount] = useState(1);
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState('');

  const load = () => {
    setLoading(true);
    api.getPolls()
      .then(setPolls)
      .catch((err: any) => setError(err.message || 'Erreur'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Confirme que l'action a réussi : sans ça, l'interface secontentait de
  // recharger la liste et rien ne prouvait que l'enregistrement avait eu lieu.
  const notify = (message: string) => {
    setFlash(message);
    setTimeout(() => setFlash(''), 4000);
  };

  const active = polls.filter((p) => p.active === 1);
  const closed = polls.filter((p) => p.active === 0);

  const toggleActive = async (poll: Poll) => {
    setBusyId(poll.id);
    setError('');
    try {
      await api.updatePoll(poll.id, { active: poll.active === 1 ? 0 : 1 });
      notify(poll.active === 1 ? 'Sondage clôturé' : 'Sondage rouvert');
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
      notify('Sondage supprimé');
      load();
    } catch (err: any) {
      setError(err.message || 'Erreur');
    }
  };

  const totalVotes = (options: PollOption[] | undefined) =>
    (options || []).reduce((acc, o) => acc + (o.vote_count || 0), 0);

  const PollCard = ({ poll }: { poll: Poll }) => {
    const simOpen = simFor === poll.id;

    const optionText = (id: string) =>
      (poll.options || []).find((o) => o.id === id)?.text || id;

    const toggleSim = () => {
      if (simOpen) {
        setSimFor(null);
      } else {
        setSimFor(poll.id);
        setSimOption('');
        setSimCount(1);
        setSimError('');
      }
    };

    const simulate = async () => {
      if (!simOption || simBusy) return;
      setSimBusy(true);
      setSimError('');
      try {
        await api.simulateVotes(poll.id, [simOption], simCount);
        setSimFor(null);
        setSimCount(1);
        load();
        notify(`${simCount} vote${simCount > 1 ? 's' : ''} simulé${simCount > 1 ? 's' : ''} ajouté${simCount > 1 ? 's' : ''}`);
      } catch (err: any) {
        setSimError(err.message || 'Simulation impossible');
      } finally {
        setSimBusy(false);
      }
    };

    const clearSimulated = async () => {
      if (!window.confirm('Supprimer tous les votes simulés de ce sondage ?')) return;
      setSimBusy(true);
      setSimError('');
      try {
        const res = await api.clearSimulatedVotes(poll.id);
        load();
        notify(`${res.removed} vote(s) simulé(s) supprimé(s)`);
      } catch (err: any) {
        const msg = err.message || 'Suppression impossible';
        setSimError(
          msg.includes('refusée')
            ? "La base refuse la suppression : les règles Firebase doivent être mises à jour (voir SECURITY.md). Les votes simulés restent visibles en attendant."
            : msg
        );
      } finally {
        setSimBusy(false);
      }
    };

    return (
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

        <div className="mt-4">
          <PollChart
            options={poll.options}
            total={totalVotes(poll.options)}
            simulated={poll.simulated_votes}
          />
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap mt-4">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {poll.total_voters ?? 0} élève(s) · {totalVotes(poll.options)} vote(s)
            {poll.simulated_votes ? ` · dont ${poll.simulated_votes} simulé(s)` : ''} · créé le{' '}
            {formatDate(poll.created_at)}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setEditing(poll);
                setShowCreate(true);
              }}
              className="glass-button text-xs px-3 py-2"
              aria-label={`Modifier le sondage ${poll.question}`}
            >
              Modifier
            </button>
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

        {poll.voters && poll.voters.length > 0 && (
          <details className="mt-3 border-t border-white/10 dark:border-gray-700/30 pt-3">
            <summary className="cursor-pointer text-xs font-semibold text-gray-600 dark:text-gray-300">
              Qui a voté ({poll.voters.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {poll.voters.map((v, i) => (
                <li key={`${v.name}-${i}`} className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-medium text-gray-800 dark:text-gray-100">{v.name}</span>
                  {v.simulated && (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">
                      simulé
                    </span>
                  )}
                  <span className="ml-auto text-gray-500 dark:text-gray-400">
                    {v.option_ids.map(optionText).join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="mt-3 border-t border-white/10 dark:border-gray-700/30 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={toggleSim}
              className="glass-button text-xs px-3 py-2"
            >
              🧪 {simOpen ? 'Fermer la simulation' : 'Simuler des votes'}
            </button>
            {poll.simulated_votes ? (
              <button
                onClick={clearSimulated}
                disabled={simBusy}
                className="glass-button text-xs px-3 py-2 text-amber-700 dark:text-amber-300 disabled:opacity-50"
              >
                Effacer les {poll.simulated_votes} votes simulés
              </button>
            ) : null}
          </div>

          {simOpen && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-[11px] text-gray-500 dark:text-gray-400">
                Option
                <select
                  value={simOption}
                  onChange={(e) => setSimOption(e.target.value)}
                  className="glass-input mt-1 text-xs"
                >
                  <option value="">Choisir…</option>
                  {(poll.options || []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.text}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-gray-500 dark:text-gray-400">
                Nombre
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={simCount}
                  onChange={(e) => setSimCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                  className="glass-input mt-1 w-20 text-xs"
                />
              </label>
              <button
                onClick={simulate}
                disabled={!simOption || simBusy}
                className="glass-button-primary text-xs px-4 py-2 disabled:opacity-50"
              >
                {simBusy ? 'Ajout…' : 'Ajouter'}
              </button>
            </div>
          )}

          {simError && <p className="mt-2 text-[11px] text-red-500">{simError}</p>}
          <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
            Les votes simulés sont marqués « simulé » et peuvent être effacés sans toucher aux
            votes réels.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Sondages</h1>
        <button onClick={() => setShowCreate(true)} className="glass-button-primary text-sm">
          + Créer un sondage
        </button>
      </div>

      {flash && (
        <div
          role="status"
          className="glass-card border-l-4 border-l-green-400 text-green-700 dark:text-green-400 text-sm"
        >
          ✅ {flash}
        </div>
      )}

      {error && (
        <div className="glass-card border-red-300/40 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-[3px] border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
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
        editing={editing}
        onClose={() => {
          setShowCreate(false);
          setEditing(null);
        }}
        onSaved={() => {
          load();
          notify(editing ? 'Sondage modifié, les votes sont conservés' : 'Sondage créé');
        }}
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