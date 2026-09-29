import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { LoadError } from '@/components/ui/LoadError';
import { StudentTable, StudentForm } from '@/components/students/StudentTable';
import { generateFingerprint } from '@/lib/utils';
import type { Student, StudentGroup, StudentGroupStatus } from '@/types';

const STATUTS: { valeur: StudentGroupStatus; label: string; classe: string }[] = [
  { valeur: 'en_attente', label: 'En attente', classe: 'bg-amber-500/20 text-amber-700 dark:text-amber-300' },
  { valeur: 'valide', label: 'Validé', classe: 'bg-green-500/20 text-green-700 dark:text-green-300' },
  { valeur: 'refuse', label: 'Refusé', classe: 'bg-red-500/20 text-red-700 dark:text-red-300' },
];

function statutMeta(valeur: string) {
  return STATUTS.find((s) => s.valeur === valeur) ?? STATUTS[0];
}

function GroupCard({
  group,
  students,
  onStatus,
  onRemoveMember,
  onJoin,
  onDelete,
}: {
  group: StudentGroup;
  students: Student[];
  onStatus: (id: number, status: StudentGroupStatus) => Promise<void>;
  onRemoveMember: (groupId: number, studentId: number) => Promise<void>;
  onJoin: (groupId: number, studentId: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [aJoindre, setAJoindre] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState('');

  const meta = statutMeta(group.status);
  // Un groupe validé est figé : ni ajout, ni retrait, ni changement de statut
  // qui modifierait la composition.
  const fige = group.status === 'valide';

  const choisis = group.members.map((m) => m.id);
  const disponibles = students.filter((s) => !choisis.includes(s.id));

  const changerStatut = async (status: StudentGroupStatus) => {
    setBusy(true);
    setErreur('');
    try {
      await onStatus(group.id, status);
    } catch (err: any) {
      setErreur(err.message || 'Changement impossible');
    } finally {
      setBusy(false);
    }
  };

  const rejoindre = async () => {
    const id = Number(aJoindre);
    if (!id) return;
    setBusy(true);
    setErreur('');
    try {
      await onJoin(group.id, id);
      setAJoindre('');
    } catch (err: any) {
      setErreur(err.message || 'Ajout impossible');
    } finally {
      setBusy(false);
    }
  };

  const retirer = async (studentId: number) => {
    setBusy(true);
    setErreur('');
    try {
      await onRemoveMember(group.id, studentId);
    } catch (err: any) {
      setErreur(err.message || 'Retrait impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-xl glass space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">{group.name}</h3>
        {group.is_private === 1 && (
          <span className="px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[10px] font-bold">
            Privé
          </span>
        )}
        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${meta.classe}`}>{meta.label}</span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {group.members.length}/4 élève{group.members.length > 1 ? 's' : ''}
        </span>
        {group.validated_by && (
          <span className="text-[10px] text-gray-400">
            par {group.validated_by}
          </span>
        )}
      </div>

      <ul className="flex flex-wrap gap-1.5">
        {group.members.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 dark:bg-white/10 text-[11px]"
          >
            <span className="text-gray-700 dark:text-gray-200">
              {m.first_name} {m.last_name}
            </span>
            {!fige && (
              <button
                type="button"
                onClick={() => retirer(m.id)}
                disabled={busy}
                className="text-red-400 hover:text-red-600 font-bold"
                aria-label={`Retirer ${m.first_name}`}
              >
                ×
              </button>
            )}
          </li>
        ))}
        {group.members.length === 0 && (
          <li className="text-[11px] text-gray-500 italic">Aucun élève</li>
        )}
      </ul>

      {erreur && <p className="text-[11px] text-red-500">{erreur}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {group.status !== 'valide' && (
          <button
            type="button"
            onClick={() => changerStatut('valide')}
            disabled={busy || group.members.length < 3}
            className="px-2.5 py-1 rounded-lg bg-green-500/85 text-white text-[11px] font-bold hover:bg-green-600 disabled:opacity-40"
            title={group.members.length < 3 ? 'Il faut au moins 3 élèves' : undefined}
          >
            Valider
          </button>
        )}

        {group.status === 'valide' && (
          <button
            type="button"
            onClick={() => changerStatut('en_attente')}
            disabled={busy}
            className="px-2.5 py-1 rounded-lg glass text-[11px] font-semibold hover:bg-white/10 disabled:opacity-40"
          >
            Rouvrir
          </button>
        )}

        {group.status === 'en_attente' && (
          <button
            type="button"
            onClick={() => changerStatut('refuse')}
            disabled={busy}
            className="px-2.5 py-1 rounded-lg bg-red-500/80 text-white text-[11px] font-bold hover:bg-red-600 disabled:opacity-40"
          >
            Refuser
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Supprimer le groupe ${group.name} ?`)) void onDelete(group.id);
          }}
          className="px-2.5 py-1 rounded-lg glass text-[11px] font-semibold text-red-500 hover:bg-red-500/15"
        >
          Supprimer
        </button>
      </div>

      {!fige && disponibles.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={aJoindre}
            onChange={(e) => setAJoindre(e.target.value)}
            className="px-2 py-1 rounded-lg glass text-[11px] outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <option value="">Ajouter un élève...</option>
            {disponibles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.last_name} {s.first_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={rejoindre}
            disabled={busy || !aJoindre}
            className="px-2.5 py-1 rounded-lg bg-indigo-500 text-white text-[11px] font-bold hover:bg-indigo-600 disabled:opacity-40"
          >
            Ajouter
          </button>
        </div>
      )}
    </div>
  );
}

export default function ManageStudents() {
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [erreur, setErreur] = useState('');
  const [nomGroupe, setNomGroupe] = useState('');
  const [prive, setPrive] = useState(false);
  const [creant, setCreant] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, g] = await Promise.all([api.getStudents(), api.getStudentGroups()]);
      setStudents(s);
      setGroups(g);
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

  const ajouterEleve = async (data: Partial<Student>) => {
    setErreur('');
    try {
      await api.createStudent(data);
      setStudents(await api.getStudents());
    } catch (err: any) {
      setErreur(err.message || 'Ajout impossible');
      throw err;
    }
  };

  const modifierEleve = async (id: number, patch: Partial<Student>) => {
    setErreur('');
    try {
      await api.updateStudent(id, patch);
      setStudents(await api.getStudents());
    } catch (err: any) {
      setErreur(err.message || 'Modification impossible');
      throw err;
    }
  };

  const supprimerEleve = async (id: number) => {
    await api.deleteStudent(id);
    setErreur('');
    // Les groupes bougent aussi (l'élève disparaît de son équipe).
    const [s, g] = await Promise.all([api.getStudents(), api.getStudentGroups()]);
    setStudents(s);
    setGroups(g);
  };

  const creerGroupe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nomGroupe.trim().length < 2) {
      setErreur('Le groupe doit avoir un nom.');
      return;
    }
    setCreant(true);
    setErreur('');
    try {
      await api.createStudentGroup({ name: nomGroupe.trim(), is_private: prive, validate_now: false });
      setNomGroupe('');
      setPrive(false);
      setGroups(await api.getStudentGroups());
    } catch (err: any) {
      setErreur(err.message || 'Création impossible');
    } finally {
      setCreant(false);
    }
  };

  const statut = async (id: number, valeur: StudentGroupStatus) => {
    setErreur('');
    try {
      await api.updateGroupStatus(id, valeur);
      setGroups(await api.getStudentGroups());
    } catch (err: any) {
      setErreur(err.message || 'Changement impossible');
      throw err;
    }
  };

  const rejoindre = async (groupId: number, studentId: number) => {
    await api.proposeGroupMember(groupId, studentId, generateFingerprint());
    setGroups(await api.getStudentGroups());
  };

  const retirerMembre = async (groupId: number, studentId: number) => {
    await api.removeGroupMember(groupId, studentId);
    setGroups(await api.getStudentGroups());
  };

  const supprimerGroupe = async (id: number) => {
    await api.deleteStudentGroup(id);
    setErreur('');
    setGroups(await api.getStudentGroups());
  };

  if (loading) {
    return <div className="text-center text-sm text-gray-500 py-8">Chargement...</div>;
  }

  if (loadError) {
    return <LoadError onRetry={load} />;
  }

  const formClass = 'px-2.5 py-1.5 rounded-lg glass text-xs outline-none focus:ring-2 focus:ring-indigo-500/40';

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">Élèves et groupes</h1>

      {erreur && <p className="text-xs text-red-500">{erreur}</p>}

      <section className="p-3 rounded-xl glass space-y-2">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">
          Classe ({students.length})
        </h2>
        <StudentForm onAdd={ajouterEleve} />
        <StudentTable
          students={students}
          onEdit={modifierEleve}
          onDelete={supprimerEleve}
          onError={setErreur}
        />
      </section>

      <section className="p-3 rounded-xl glass space-y-2">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">
          Groupes de travail
        </h2>

        <form onSubmit={creerGroupe} className="flex flex-wrap items-center gap-2">
          <input
            className={`${formClass} w-44`}
            value={nomGroupe}
            onChange={(e) => setNomGroupe(e.target.value)}
            placeholder="Nom du groupe"
            aria-label="Nom du groupe"
          />
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={prive} onChange={(e) => setPrive(e.target.checked)} />
            Privé
          </label>
          <button
            type="submit"
            disabled={creant}
            className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600 disabled:opacity-50"
          >
            {creant ? 'Création...' : 'Créer le groupe'}
          </button>
        </form>

        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Un groupe doit contenir 3 ou 4 élèves. Une fois validé, il est figé : on ne peut plus
          en retirer ni en ajouter.
        </p>

        {groups.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">Aucun groupe pour l’instant.</p>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                students={students}
                onStatus={statut}
                onRemoveMember={retirerMembre}
                onJoin={rejoindre}
                onDelete={supprimerGroupe}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
