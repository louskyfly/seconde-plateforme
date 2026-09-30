import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { LoadError } from '@/components/ui/LoadError';
import { formatDate, SUBJECTS, generateFingerprint } from '@/lib/utils';
import type { RevisionSession } from '@/types';

const DUREES = [30, 45, 60, 90, 120, 180];

const champ =
  'px-2.5 py-1.5 rounded-lg glass text-xs outline-none focus:ring-2 focus:ring-indigo-500/40';

function heureFin(session: RevisionSession): string | null {
  if (!session.time) return null;
  const [h, m] = session.time.split(':').map(Number);
  const total = h * 60 + m + session.duration;
  if (total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Formulaire de création d'une session.
 *
 * Le même formulaire sert à créer et à modifier : l'élève peut donc corriger
 * une session qu'il vient de proposer, tant qu'il en est l'auteur.
 */
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
          {busy ? 'Enregistrement...' : session ? 'Modifier' : 'Proposer la session'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2.5 py-1.5 rounded-lg glass text-xs font-semibold hover:bg-white/10"
        >
          Annuler
        </button>
        {erreur && <span className="text-[11px] text-red-500">{erreur}</span>}
      </div>
    </form>
  );
}

function SessionCard({
  session,
  onEdit,
  onDelete,
}: {
  session: RevisionSession;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const fin = heureFin(session);
  const matiere = SUBJECTS[session.subject] ?? session.subject;

  return (
    <li className="px-3 py-2.5 rounded-xl glass">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{session.title}</span>
        <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 font-semibold">
          {matiere}
        </span>
        {session.mine && (
          <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 font-semibold">
            Proposée par moi
          </span>
        )}
      </div>

      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
        {session.time ? (
          <>
            {session.time}
            {fin && ` — ${fin}`} · {session.duration} min
          </>
        ) : (
          'Toute la journée'
        )}
        {session.location && ` · ${session.location}`}
      </p>

      {session.description && (
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1.5 whitespace-pre-wrap">
          {session.description}
        </p>
      )}

      {session.peut_modifier && (
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={onEdit}
            className="px-2 py-1 rounded-lg glass text-[11px] font-semibold hover:bg-white/10"
          >
            Modifier
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="px-2 py-1 rounded-lg text-[11px] font-semibold text-red-500 hover:bg-red-500/10"
          >
            Supprimer
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * Page élève : les prochaines sessions de révision, groupées par jour.
 *
 * Les élèves peuvent proposer eux-mêmes une session, et ne gèrent que les
 * leurs : le serveur refuse toute modification venant d'un autre élève, l'interface
 * ne propose donc les boutons que là où c'est réellement possible.
 */
export default function Revisions() {
  const [fingerprint] = useState(generateFingerprint);
  const [sessions, setSessions] = useState<RevisionSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [edition, setEdition] = useState<RevisionSession | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await api.getRevisionSessions(true, fingerprint));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [fingerprint]);

  useEffect(() => {
    load();
  }, [load]);

  const enregistrer = async (data: Partial<RevisionSession>) => {
    if (edition) {
      await api.updateRevisionSession(edition.id, { ...data, fingerprint });
    } else {
      await api.createRevisionSession({ ...data, fingerprint });
    }
    setFormVisible(false);
    setEdition(null);
    await load();
  };

  const supprimer = async (session: RevisionSession) => {
    if (!window.confirm(`Supprimer la session « ${session.title} » ?`)) return;
    try {
      await api.deleteRevisionSession(session.id, fingerprint);
    } catch (err: any) {
      window.alert(err.message || 'Suppression impossible');
      return;
    }
    setFormVisible(false);
    setEdition(null);
    await load();
  };

  if (loading) {
    return <div className="text-center text-sm text-gray-500 py-8">Chargement...</div>;
  }

  if (loadError) {
    return <LoadError onRetry={load} />;
  }

  // Groupement par jour : une ligne par session deviendrait vite illisible dès
  // qu'il y a trois sessions le même jour.
  const parJour = new Map<string, RevisionSession[]>();
  for (const s of sessions) {
    const liste = parJour.get(s.date) ?? [];
    liste.push(s);
    parJour.set(s.date, liste);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">Sessions de révision</h1>
        {!formVisible && (
          <button
            type="button"
            onClick={() => {
              setEdition(null);
              setFormVisible(true);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600"
          >
            + Proposer
          </button>
        )}
      </div>

      {formVisible && (
        <div className="p-3 rounded-xl glass space-y-2">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {edition
              ? 'Tu modifies une session que tu as proposée.'
              : 'Tout le monde verra cette session. Tu pourras la modifier ou la supprimer tant que c’est toi qui l’as proposée.'}
          </p>
          <SessionForm
            session={edition}
            onSave={enregistrer}
            onCancel={() => {
              setFormVisible(false);
              setEdition(null);
            }}
          />
        </div>
      )}

      {sessions.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">
          Aucune session prévue pour le moment.
        </p>
      ) : (
        [...parJour.entries()].map(([jour, liste]) => (
          <section key={jour}>
            <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              {formatDate(jour)}
            </h2>
            <ul className="space-y-1.5">
              {liste.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  onEdit={() => {
                    setEdition(s);
                    setFormVisible(true);
                  }}
                  onDelete={() => supprimer(s)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
