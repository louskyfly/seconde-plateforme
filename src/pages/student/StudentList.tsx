import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { LoadError } from '@/components/ui/LoadError';
import { StudentTable } from '@/components/students/StudentTable';
import type { Student } from '@/types';

/**
 * Anniversaire du jour.
 *
 * Volontairement sobre et montré une seule fois par jour : une alerte qui
 * revient à chaque ouverture devient vite agaçante. Le nom de l'élève n'est pas
 * indiqué, seulement le nombre d'anniversaires, pour ne pas faire de la page
 * une liste publique des naissances.
 */
function BirthdayBanner({ students }: { students: Student[] }) {
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const maintenant = new Date();
    const clef = `${maintenant.getFullYear()}-${maintenant.getMonth() + 1}-${maintenant.getDate()}`;

    // Une fois par jour, et non par session ouverte.
    if (sessionStorage.getItem('annonce_vue') === clef) return;
    sessionStorage.setItem('annonce_vue', clef);

    const duJour = `${String(maintenant.getMonth() + 1).padStart(2, '0')}-${String(maintenant.getDate()).padStart(2, '0')}`;
    setCount(students.filter((s) => s.birthday === duJour).length);
    setVisible(true);
  }, [students]);

  if (!visible || count === 0) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30">
      <span className="text-lg" aria-hidden="true">
        🎂
      </span>
      <p className="text-xs text-amber-700 dark:text-amber-300 flex-1">
        {count === 1
          ? 'Un anniversaire à fêter aujourd’hui !'
          : `${count} anniversaires à fêter aujourd’hui !`}
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="px-2 py-1 rounded-lg glass text-[11px] font-semibold hover:bg-white/10"
      >
        Fermer
      </button>
    </div>
  );
}

/** Page élève : la liste de classe, en lecture seule. */
export default function StudentList() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStudents(await api.getStudents());
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

  if (loading) {
    return <div className="text-center text-sm text-gray-500 py-8">Chargement...</div>;
  }

  if (loadError) {
    return <LoadError onRetry={load} />;
  }

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">La classe</h1>

      <BirthdayBanner students={students} />

      {/* Vue élève : le tableau est en lecture seule, sans bouton Modifier ni
          Retirer. La gestion réelle vit sur la page du délégué. */}
      <StudentTable students={students} readOnly />

      {students.length > 0 && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {students.length} élève{students.length > 1 ? 's' : ''} — la liste est gérée par le délégué.
        </p>
      )}
    </div>
  );
}
