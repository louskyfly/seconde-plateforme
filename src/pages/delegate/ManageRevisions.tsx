import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { LoadError } from '@/components/ui/LoadError';
import { formatDate, SUBJECTS } from '@/lib/utils';
import type { RevisionSession } from '@/types';

const DUREES = [30, 45, 60, 90, 120, 180];

const champ = 'px-2.5 py-1.5 rounded-lg glass text-xs outline-none focus:ring-2 focus:ring-indigo-500/40';

/** Formulaire de création / modification d'une session. */
function SessionForm({
  session,
  onSave,
  onCancel,
}: {
  session: RevisionSession | null;
  onSave: (data: Partial<RevisionSession>) => Promise<void>;
  onCancel: () => void;
}) {
  const [titre, setTitre] = useState(session?.title ?? '');
  const [matiere, setMatiere] = useState(session?.subject ?? 'francais');
  const [date, setDate] = useState(session?.date ?? '');
  const [heure, setHeure] = useState(session?.time ?? '');
  const [duree, setDuree] = useState(session?.duration ?? 60);
  const [lieu, setLieu] = useState(session?.location ?? '');
  const [description, setDescription] = useState(session?.description ?? '');
  const [erreur, setErreur] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (titre.trim().length < 2) {
      setErreur('Le titre est obligatoire.');
      return;
    }
    if (!date) {
      setErreur('La date est obligatoire.');
      return;
    }

    setBusy(true);
    setErreur('');
    try {
      await onSave({
        title: titre.trim(),
        subject: matiere,
        date,
        time: heure || null,
        duration: duree,
        location: lieu.trim(),
        description: description.trim(),
      });
    } catch (err: any) {
      setErreur(err.message || 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          className={`${champ} w-48`}
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Titre de la session"
          aria-label="Titre de la session"
        />
        <select
          className={champ}
          value={matiere}
          onChange={(e) => setMatiere(e.target.value)}
          aria-label="Matière"
        >
          {Object.entries(SUBJECTS).map(([cle, nom]) => (
            <option key={cle} value={cle}>
              {nom}
            </option>
          ))}
        </select>
        <input
          type="date"
          className={champ}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
        />
        <input
          type="time"
          className={champ}
          value={heure}
          onChange={(e) => setHeure(e.target.value)}
          aria-label="Heure"
        />
        <select
          className={champ}
          value={duree}
          onChange={(e) => setDuree(Number(e.target.value))}
          aria-label="Durée"
        >
          {DUREES.map((d) => (
            <option key={d} value={d}>
              {d} min
            </option>
          ))}
        </select>
        <input
          className={`${champ} w-36`}
          value={lieu}
          onChange={(e) => setLieu(e.target.value)}
          placeholder="Lieu"
          aria-label="Lieu"
        />
      </div>

      <textarea
        className={`${champ} w-full`}
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Fiches à travailler, matériel à prévoir..."
        aria-label="Description"
      />

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600 disabled:opacity-50"
        >
          {busy ? 'Enregistrement...' : session ? 'Modifier' : 'Créer la session'}
        </button>
        {session && (
          <button
            type="button"
            onClick={onCancel}
            className="px-2.5 py-1.5 rounded-lg glass text-xs font-semibold hover:bg-white/10"
          >
            Annuler
          </button>
        )}
        {erreur && <span className="text-[11px] text-red-500">{erreur}</span>}
      </div>
    </form>
  );
}

export default function ManageRevisions() {
  const [sessions, setSessions] = useState<RevisionSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [erreur, setErreur] = useState('');
  const [edition, setEdition] = useState<RevisionSession | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Le délégué voit aussi les sessions passées : il lui faut pouvoir les
      // supprimer, et savoir ce qui a déjà eu lieu.
      setSessions(await api.getRevisionSessions(false));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const enregistrer = async (data: Partial<RevisionSession>) => {
    setErreur('');
    try {
      if (edition) {
        await api.updateRevisionSession(edition.id, data);
        setEdition(null);
      } else {
        await api.createRevisionSession(data);
      }
      setSessions(await api.getRevisionSessions(false));
    } catch (err: any) {
      setErreur(err.message || 'Enregistrement impossible');
      throw err;
    }
  };

  const supprimer = async (session: RevisionSession) => {
    if (!window.confirm(`Supprimer la session « ${session.title} » ?`)) return;
    setErreur('');
    try {
      await api.deleteRevisionSession(session.id);
      if (edition?.id === session.id) setEdition(null);
      setSessions(await api.getRevisionSessions(false));
    } catch (err: any) {
      setErreur(err.message || 'Suppression impossible');
    }
  };

  if (loading) {
    return <div className="text-center text-sm text-gray-500 py-8">Chargement...</div>;
  }

  if (loadError) {
    return <LoadError onRetry={load} />;
  }

  const aujourdHui = new Date().toISOString().slice(0, 10);
  const aVenir = sessions.filter((s) => s.date >= aujourdHui);
  const passees = sessions.filter((s) => s.date < aujourdHui).reverse();

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">Sessions de révision</h1>

      {erreur && <p className="text-xs text-red-500">{erreur}</p>}

      <section className="p-3 rounded-xl glass">
        <SessionForm
          key={edition?.id ?? 'nouvelle'}
          session={edition}
          onSave={enregistrer}
          onCancel={() => setEdition(null)}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">
          À venir ({aVenir.length})
        </h2>
        {aVenir.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune session planifiée.</p>
        ) : (
          <ul className="space-y-1.5">
            {aVenir.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl glass">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{s.title}</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 font-semibold">
                  {SUBJECTS[s.subject] ?? s.subject}
                </span>
                <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-1 min-w-32">
                  {formatDate(s.date)}
                  {s.time ? ` · ${s.time}` : ''}
                  {s.location && ` · ${s.location}`}
                </span>
                <button
                  type="button"
                  onClick={() => setEdition(s)}
                  className="px-2 py-1 rounded-lg glass text-[11px] font-semibold hover:bg-white/10"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => supprimer(s)}
                  className="px-2 py-1 rounded-lg bg-red-500/80 text-white text-[11px] font-bold hover:bg-red-600"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {passees.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400">
            Passées ({passees.length})
          </h2>
          <ul className="space-y-1">
            {passees.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 dark:bg-white/10"
              >
                <span className="text-xs text-gray-500 dark:text-gray-400 line-through flex-1 min-w-32">
                  {s.title} · {formatDate(s.date)}
                </span>
                <button
                  type="button"
                  onClick={() => setEdition(s)}
                  className="px-2 py-1 rounded-lg glass text-[11px] font-semibold hover:bg-white/10"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => supprimer(s)}
                  className="px-2 py-1 rounded-lg bg-red-500/70 text-white text-[11px] font-bold hover:bg-red-600"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
