import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { generateFingerprint } from '@/lib/utils';
import { LoadError } from '@/components/ui/LoadError';
import type { Student, StudentGroup, StudentGroupStatus } from '@/types';

/**
 * Espace « groupes » côté élève.
 *
 * Un élève peut créer son groupe et le compléter, mais il ne peut jamais le
 * valider lui-même : la validation reste une décision du délégué, contrôlée par
 * le serveur et pas seulement masquée dans l'interface.
 *
 * Tant que le groupe est « en attente », son auteur peut encore ajouter ou
 * retirer un camarade. Dès qu'il est validé, plus personne n'y touche : c'est ce
 * que le texte ci-dessous annonce, pour qu'un élève ne découvre pas la règle
 * après coup.
 */

const STATUTS: Record<StudentGroupStatus, { label: string; classe: string }> = {
  en_attente: {
    label: 'En attente du délégué',
    classe: 'bg-yellow-400/20 text-yellow-700 dark:text-yellow-300',
  },
  valide: { label: 'Validé', classe: 'bg-green-500/20 text-green-700 dark:text-green-300' },
  refuse: { label: 'Refusé', classe: 'bg-red-500/20 text-red-700 dark:text-red-300' },
};

const MIN_GROUP = 3;
const MAX_GROUP = 4;

function nomComplet(s: Student): string {
  return `${s.first_name} ${s.last_name.toUpperCase()}`;
}

export function StudentGroups({ students }: { students: Student[] }) {
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [nom, setNom] = useState('');
  const [prive, setPrive] = useState(false);
  const [choisis, setChoisis] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGroups(await api.getStudentGroups(generateFingerprint()));
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

  // Un seul groupe modifiable à la fois : le serveur l'impose aussi, pour qu'un
  // élève ne puisse pas empiler des demandes à faire valider.
  const monGroupe = groups.find((g) => g.mine && g.status === 'en_attente');
  const monGroupeFige = groups.find((g) => g.mine && g.status !== 'en_attente');

  const basculer = (id: number) => {
    setErreur('');
    setChoisis((actuels) => (actuels.includes(id) ? actuels.filter((x) => x !== id) : [...actuels, id]));
  };

  const creer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nom.trim().length < 2) {
      setErreur('Donne un nom à ton groupe.');
      return;
    }
    if (choisis.length < MIN_GROUP) {
      setErreur(`Choisis au moins ${MIN_GROUP} élèves, toi compris.`);
      return;
    }
    if (choisis.length > MAX_GROUP) {
      setErreur(`Un groupe ne peut pas dépasser ${MAX_GROUP} élèves.`);
      return;
    }

    setBusy(true);
    setErreur('');
    try {
      await api.createStudentGroup({
        name: nom.trim(),
        is_private: prive,
        student_ids: choisis,
        fingerprint: generateFingerprint(),
      });
      setNom('');
      setPrive(false);
      setChoisis([]);
      await load();
    } catch (err: any) {
      setErreur(err.message || 'Création impossible');
    } finally {
      setBusy(false);
    }
  };

  const basculerMembre = async (groupId: number, studentId: number, present: boolean) => {
    setBusy(true);
    setErreur('');
    try {
      if (present) {
        await api.removeGroupMember(groupId, studentId, generateFingerprint());
      } else {
        await api.proposeGroupMember(groupId, studentId, generateFingerprint());
      }
      await load();
    } catch (err: any) {
      setErreur(err.message || 'Modification impossible');
    } finally {
      setBusy(false);
    }
  };

  const supprimer = async (groupId: number) => {
    if (!window.confirm('Supprimer ton groupe ? Le délégué n’en verra plus trace.')) return;
    setBusy(true);
    setErreur('');
    try {
      await api.deleteStudentGroup(groupId, generateFingerprint());
      await load();
    } catch (err: any) {
      setErreur(err.message || 'Suppression impossible');
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <LoadError onRetry={load} />;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Mes groupes</h2>

      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Espace pour renseigner les groupes. Choisis {MIN_GROUP} ou {MAX_GROUP} élèves, toi compris. Tu
        peux encore les changer tant que le groupe est en attente. Une fois validé par le délégué, il
        ne sera plus possible de les modifier.
      </p>

      {erreur && <p className="text-xs text-red-500">{erreur}</p>}

      {monGroupe ? (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Tu as déjà un groupe en attente. Complète-le ci-dessous, ou supprime-le pour recommencer.
        </p>
      ) : (
        <form onSubmit={creer} className="space-y-2">
          <input
            className="w-full px-3 py-2 rounded-xl glass text-xs outline-none focus:ring-2 focus:ring-indigo-500/40"
            value={nom}
            onChange={(e) => {
              setNom(e.target.value);
              setErreur('');
            }}
            placeholder="Nom du groupe, ex. Groupe de maths"
            aria-label="Nom du groupe"
            maxLength={80}
          />

          <label className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={prive} onChange={(e) => setPrive(e.target.checked)} />
            Groupe privé (visible uniquement par toi et le délégué)
          </label>

          <div>
            <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Les élèves du groupe ({choisis.length}/{MAX_GROUP})
            </p>
            <div className="max-h-40 overflow-y-auto rounded-xl glass p-2 space-y-0.5">
              {students.length === 0 ? (
                <p className="text-[11px] text-gray-500 p-1">
                  Le délégué n’a pas encore enregistré la liste des élèves.
                </p>
              ) : (
                students.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 px-1 py-0.5 rounded text-[11px] text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-white/5"
                  >
                    <input type="checkbox" checked={choisis.includes(s.id)} onChange={() => basculer(s.id)} />
                    {nomComplet(s)}
                  </label>
                ))
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || students.length === 0}
            className="px-3 py-2 rounded-xl bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600 transition-all disabled:opacity-50"
          >
            {busy ? 'Création...' : 'Créer mon groupe'}
          </button>
        </form>
      )}

      {monGroupeFige && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Ton groupe « {monGroupeFige.name} » n’est plus modifiable : il a été{' '}
          {monGroupeFige.status === 'valide' ? 'validé' : 'refusé'}.
        </p>
      )}

      {loading ? (
        <p className="text-[11px] text-gray-500">Chargement des groupes…</p>
      ) : groups.length > 0 ? (
        <ul className="space-y-2">
          {groups.map((g) => {
            const statut = STATUTS[g.status];
            const membres = new Set(g.members.map((m) => m.id));

            return (
              <li key={g.id} className="px-3 py-2 rounded-xl glass space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-gray-800 dark:text-gray-100">{g.name}</span>
                  {g.mine && (
                    <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                      Le tien
                    </span>
                  )}
                  {g.is_private === 1 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-gray-500/20 text-[10px] font-semibold">
                      Privé
                    </span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${statut.classe}`}>
                    {statut.label}
                  </span>
                </div>

                <p className="text-[11px] text-gray-600 dark:text-gray-300">
                  {g.members.length > 0
                    ? g.members.map(nomComplet).join(', ')
                    : 'Aucun élève pour l’instant'}
                </p>

                {g.peut_modifier ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <select
                      className="px-2 py-1 rounded-lg glass text-[11px] outline-none focus:ring-2 focus:ring-indigo-500/40"
                      value=""
                      onChange={(e) => e.target.value && void basculerMembre(g.id, Number(e.target.value), false)}
                      disabled={busy}
                      aria-label="Ajouter un élève au groupe"
                    >
                      <option value="">Ajouter un élève…</option>
                      {students
                        .filter((s) => !membres.has(s.id))
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {nomComplet(s)}
                          </option>
                        ))}
                    </select>

                    {g.members.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => void basculerMembre(g.id, m.id, true)}
                        disabled={busy}
                        className="px-2 py-1 rounded-lg bg-red-500/80 text-white text-[10px] font-bold hover:bg-red-600 disabled:opacity-50"
                      >
                        Retirer {m.first_name}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => void supprimer(g.id)}
                      disabled={busy}
                      className="px-2 py-1 rounded-lg glass text-[10px] font-semibold text-red-500 hover:bg-red-500/15"
                    >
                      Supprimer le groupe
                    </button>
                  </div>
                ) : g.status === 'valide' ? (
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">
                    Composition figée depuis la validation.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Aucun groupe pour l’instant. Crée le tien ci-dessus.
        </p>
      )}
    </section>
  );
}
