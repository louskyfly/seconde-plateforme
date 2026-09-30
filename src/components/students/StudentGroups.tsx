import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { generateFingerprint } from '@/lib/utils';
import { LoadError } from '@/components/ui/LoadError';
import type { StudentGroup, StudentGroupStatus } from '@/types';

/**
 * Espace « groupes » côté élève.
 *
 * Un élève écrit les noms de son groupe au lieu de les choisir dans le tableau :
 * le délégué n'a pas forcément enregistré tout le monde, et un élève doit
 * pouvoir former son groupe même si sa liste est incomplète. Le serveur
 * rattache quand même chaque nom à une fiche du tableau si elle existe, ce qui
 * permet d'appliquer la règle « un élève dans un seul groupe validé » pour
 * ceux qu'il a enregistrés.
 *
 * Un élève peut créer son groupe et le compléter, mais il ne peut jamais le
 * valider lui-même : la validation reste une décision du délégué, contrôlée par
 * le serveur et pas seulement masquée dans l'interface.
 *
 * Tant que le groupe est « en attente », son auteur peut encore ajouter ou
 * retirer un camarade. Dès qu'il est validé, plus personne n'y touche : c'est
 * ce que le texte ci-dessous annonce, pour qu'un élève ne découvre pas la règle
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

/** Même normalisation que le serveur : sans elle, `Lucas` et `lucas` seraient deux membres. */
function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function memberKey(name: string): string {
  return normalizeName(name);
}

/**
 * Champ où l'élève écrit le nom d'un camarade.
 *
 * La touche Entrée valide, parce qu'un élève tape vite des noms à la suite et
 * n'a pas envie de cliquer sur un bouton à chaque fois. La virgule et le
 * point-virgule font la même chose, pour ceux qui tapent une liste d'un trait.
 */
function NameField({
  onAdd,
  disabled,
  placeholder,
}: {
  onAdd: (name: string) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const [saisie, setSaisie] = useState('');

  const valider = () => {
    const propre = saisie.replace(/\s+/g, ' ').trim();
    if (propre.length < 2) return;
    onAdd(propre);
    setSaisie('');
  };

  return (
    <input
      className="w-full px-3 py-2 rounded-xl glass text-xs outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
      value={saisie}
      onChange={(e) => setSaisie(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
          // Sans preventDefault, la virgule et le point-virgule seraient
          // envoyés dans le formulaire et la page se rechargerait.
          e.preventDefault();
          valider();
        }
      }}
      onBlur={valider}
      placeholder={placeholder}
      aria-label={placeholder}
      maxLength={60}
      disabled={disabled}
    />
  );
}

export function StudentGroups() {
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [nom, setNom] = useState('');
  const [prive, setPrive] = useState(false);
  const [membres, setMembres] = useState<string[]>([]);
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

  /**
   * Ajoute un nom à la liste du formulaire.
   *
   * Le doublon est écarté ici, avec la même comparaison que le serveur, pour
   * que l'élève voie tout de suite qu'il a déjà écrit ce nom.
   */
  const ajouterNom = (name: string) => {
    setErreur('');
    const cle = memberKey(name);
    setMembres((actuels) =>
      actuels.some((m) => memberKey(m) === cle) ? actuels : [...actuels, name]
    );
  };

  const retirerNom = (name: string) => {
    setErreur('');
    setMembres((actuels) => actuels.filter((m) => memberKey(m) !== memberKey(name)));
  };

  const creer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nom.trim().length < 2) {
      setErreur('Donne un nom à ton groupe.');
      return;
    }
    if (membres.length < MIN_GROUP) {
      setErreur(`Écris au moins ${MIN_GROUP} noms, le tien compris.`);
      return;
    }
    if (membres.length > MAX_GROUP) {
      setErreur(`Un groupe ne peut pas dépasser ${MAX_GROUP} élèves.`);
      return;
    }

    setBusy(true);
    setErreur('');
    try {
      await api.createStudentGroup({
        name: nom.trim(),
        is_private: prive,
        member_names: membres,
        fingerprint: generateFingerprint(),
      });
      setNom('');
      setPrive(false);
      setMembres([]);
      await load();
    } catch (err: any) {
      setErreur(err.message || 'Création impossible');
    } finally {
      setBusy(false);
    }
  };

  const ajouterMembre = async (groupId: number, name: string) => {
    setBusy(true);
    setErreur('');
    try {
      await api.proposeGroupMember(groupId, { member_name: name }, generateFingerprint());
      await load();
    } catch (err: any) {
      setErreur(err.message || 'Modification impossible');
    } finally {
      setBusy(false);
    }
  };

  const retirerMembre = async (groupId: number, cle: string) => {
    setBusy(true);
    setErreur('');
    try {
      await api.removeGroupMember(groupId, cle, generateFingerprint());
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
        Espace pour renseigner les groupes. Écris les {MIN_GROUP} ou {MAX_GROUP} noms de ton groupe, le
        tien compris, puis valide avec Entrée à chaque nom. Tu peux encore les changer tant que le
        groupe est en attente. Une fois validé par le délégué, il ne sera plus possible de les modifier.
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
              Les élèves du groupe ({membres.length}/{MAX_GROUP})
            </p>

            <NameField
              onAdd={ajouterNom}
              disabled={membres.length >= MAX_GROUP}
              placeholder="Écris un prénom et un nom, puis Entrée"
            />

            {membres.length > 0 && (
              <ul className="flex flex-wrap gap-1 mt-1.5">
                {membres.map((m) => (
                  <li
                    key={memberKey(m)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/15 text-[11px] font-semibold text-indigo-700 dark:text-indigo-200"
                  >
                    {m}
                    <button
                      type="button"
                      onClick={() => retirerNom(m)}
                      aria-label={`Retirer ${m}`}
                      className="text-indigo-400 hover:text-red-500 font-bold"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {membres.length < MIN_GROUP && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                Il manque encore {MIN_GROUP - membres.length} nom
                {MIN_GROUP - membres.length > 1 ? 's' : ''}.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={busy}
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
                    ? g.members.map((m) => m.name).join(', ')
                    : 'Aucun élève pour l’instant'}
                </p>

                {g.peut_modifier ? (
                  <div className="space-y-2 pt-1">
                    {g.members.length < MAX_GROUP && (
                      <NameField
                        onAdd={(n) => void ajouterMembre(g.id, n)}
                        disabled={busy}
                        placeholder="Ajouter un élève au groupe"
                      />
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      {g.members.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => void retirerMembre(g.id, m.member_key)}
                          disabled={busy}
                          title="Retirer cet élève"
                          className="px-2 py-1 rounded-lg bg-red-500/80 text-white text-[10px] font-bold hover:bg-red-600 disabled:opacity-50"
                        >
                          Retirer {m.name}
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
