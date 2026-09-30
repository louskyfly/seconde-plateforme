import { useState } from 'react';
import type { Student } from '@/types';

/** Une date d'anniversaire à saisi : deux chiffres, un tiret, deux chiffres. */
function isBirthday(value: string): boolean {
  if (value === '') return true;
  if (!/^\d{2}-\d{2}$/.test(value)) return false;
  const [month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(2024, month - 1, day);
  return probe.getMonth() === month - 1 && probe.getDate() === day;
}

const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function birthdayLabel(value: string | null): string {
  if (!value) return '—';
  const [month, day] = value.split('-').map(Number);
  return `${day === 1 ? '1er' : day} ${MONTHS[month - 1]}`;
}

interface Props {
  students: Student[];
  onEdit?: (id: number, patch: Partial<Student>) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  onError?: (message: string) => void;
  /**
   * Vue élève : le tableau est affiché sans les boutons Modifier et Retirer.
   *
   * Les deux callbacks sont optionnels et ne sont jamais appelés dans ce mode.
   * Avant, la page élève passait des fonctions vides et les boutons restaient
   * visibles : cliquer « Modifier » ouvrait un formulaire qui ne pouvait rien
   * enregistrer, et « Retirer » demandait une confirmation avant de ne rien
   * faire. Un bouton qui ne peut pas fonctionner ne doit pas être affiché.
   */
  readOnly?: boolean;
}

/**
 * Liste triée des élèves de la classe, avec nom, prénom et anniversaire.
 *
 * Le tri se fait ici plutôt que dans la requête : l'API renvoie déjà la liste
 * triée, et le re-trier ici permet de l'afficher tout de suite après une
 * modification, sans attendre un nouvel aller-retour.
 */
export function StudentTable({ students, onEdit, onDelete, onError, readOnly = false }: Props) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [anniversaire, setAnniversaire] = useState('');
  const [erreur, setErreur] = useState('');

  const sorted = [...students].sort(
    (a, b) => a.last_name.localeCompare(b.last_name, 'fr') || a.first_name.localeCompare(b.first_name, 'fr')
  );

  const startEdit = (s: Student) => {
    if (!onEdit) return;
    setEditing(s.id);
    setPrenom(s.first_name);
    setNom(s.last_name);
    setAnniversaire(s.birthday ?? '');
    setErreur('');
  };

  const cancelEdit = () => {
    setEditing(null);
    setErreur('');
  };

  const saveEdit = async (id: number) => {
    if (prenom.trim().length < 2 || nom.trim().length < 2) {
      setErreur('Le prénom et le nom sont obligatoires.');
      return;
    }
    if (!isBirthday(anniversaire)) {
      setErreur('Anniversaire invalide : utilise le format MM-JJ (ex. 03-14).');
      return;
    }
    if (!onEdit) return;

    setBusyId(id);
    setErreur('');
    try {
      await onEdit(id, {
        first_name: prenom.trim(),
        last_name: nom.trim(),
        birthday: anniversaire === '' ? null : anniversaire,
      });
      setEditing(null);
    } catch (err: any) {
      setErreur(err.message || 'Enregistrement impossible');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (s: Student) => {
    if (!onDelete) return;
    if (!window.confirm(`Retirer ${s.first_name} ${s.last_name} de la classe ?`)) return;
    setBusyId(s.id);
    try {
      await onDelete(s.id);
    } catch (err: any) {
      onError?.(err.message || 'Suppression impossible');
    } finally {
      setBusyId(null);
    }
  };

  if (students.length === 0) {
    return <p className="text-center text-sm text-gray-500 py-4">Aucun élève enregistré pour l'instant.</p>;
  }

  const inputClass =
    'px-2 py-1 rounded-lg glass text-xs outline-none focus:ring-2 focus:ring-indigo-500/40 min-w-0';

  return (
    <div className="space-y-2">
      {erreur && <p className="text-xs text-red-500">{erreur}</p>}

      <ul className="space-y-1.5">
        {sorted.map((s) => {
          const isEditing = editing === s.id;
          const busy = busyId === s.id;

          return (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl glass"
            >
              {isEditing ? (
                <>
                  <input
                    className={`${inputClass} w-28`}
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    placeholder="Prénom"
                    autoFocus
                  />
                  <input
                    className={`${inputClass} w-32`}
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    placeholder="Nom"
                  />
                  <input
                    className={`${inputClass} w-24`}
                    value={anniversaire}
                    onChange={(e) => setAnniversaire(e.target.value)}
                    placeholder="MM-JJ"
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    onClick={() => saveEdit(s.id)}
                    disabled={busy}
                    className="px-2.5 py-1 rounded-lg bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600 disabled:opacity-50"
                  >
                    {busy ? '...' : 'OK'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="px-2.5 py-1 rounded-lg glass text-xs font-semibold hover:bg-white/10"
                  >
                    Annuler
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 w-28 truncate">
                    {s.last_name.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-200 w-28 truncate">
                    {s.first_name}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-1 min-w-20">
                    {birthdayLabel(s.birthday)}
                  </span>
                  {!readOnly && (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(s)}
                        className="px-2 py-1 rounded-lg glass text-[11px] font-semibold hover:bg-white/10"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(s)}
                        disabled={busy}
                        className="px-2 py-1 rounded-lg bg-red-500/80 text-white text-[11px] font-bold hover:bg-red-600 disabled:opacity-50"
                      >
                        Retirer
                      </button>
                    </>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Formulaire d'ajout, réutilisé par le délégué. */
export function StudentForm({ onAdd }: { onAdd: (data: Partial<Student>) => Promise<void> }) {
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [anniversaire, setAnniversaire] = useState('');
  const [erreur, setErreur] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (prenom.trim().length < 2 || nom.trim().length < 2) {
      setErreur('Le prénom et le nom sont obligatoires.');
      return;
    }
    if (!isBirthday(anniversaire)) {
      setErreur('Anniversaire invalide : utilise le format MM-JJ (ex. 03-14).');
      return;
    }

    setBusy(true);
    setErreur('');
    try {
      await onAdd({
        first_name: prenom.trim(),
        last_name: nom.trim(),
        birthday: anniversaire === '' ? null : anniversaire,
      });
      setPrenom('');
      setNom('');
      setAnniversaire('');
    } catch (err: any) {
      setErreur(err.message || 'Ajout impossible');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'px-2.5 py-1.5 rounded-lg glass text-xs outline-none focus:ring-2 focus:ring-indigo-500/40';

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        className={`${inputClass} w-28`}
        value={prenom}
        onChange={(e) => setPrenom(e.target.value)}
        placeholder="Prénom"
        aria-label="Prénom"
      />
      <input
        className={`${inputClass} w-32`}
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        placeholder="Nom"
        aria-label="Nom"
      />
      <input
        className={`${inputClass} w-24`}
        value={anniversaire}
        onChange={(e) => setAnniversaire(e.target.value)}
        placeholder="Anniv. MM-JJ"
        aria-label="Anniversaire au format MM-JJ"
        inputMode="numeric"
      />
      <button
        type="submit"
        disabled={busy}
        className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600 disabled:opacity-50"
      >
        {busy ? 'Ajout...' : 'Ajouter'}
      </button>
      {erreur && <span className="text-[11px] text-red-500">{erreur}</span>}
    </form>
  );
}
