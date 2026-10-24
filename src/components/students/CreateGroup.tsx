import { useState } from 'react';
import { api } from '@/lib/api';
import { generateFingerprint } from '@/lib/utils';
import type { Student } from '@/types';

/**
 * Création d'un groupe en cochant les élèves de la liste.
 * Le groupe est enregistré dans Firebase (studentGroups) : il apparaît
 * dans « Groupes » ci-dessous et chez le délégué pour validation.
 */
export function CreateGroup({ students, onCreated }: { students: Student[]; onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (students.length === 0) return null;

  const toggle = (id: string) => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  };

  const save = async () => {
    setMsg('');
    if (name.trim().length < 2) return setMsg('Donne un nom au groupe.');
    if (picked.size < 2) return setMsg('Coche au moins 2 élèves.');
    setBusy(true);
    try {
      await api.createStudentGroup({
        name: name.trim(),
        member_names: students.filter((s) => picked.has(s.id)).map((s) => `${s.first_name} ${s.last_name}`.trim()),
        validate_now: true,
        fingerprint: generateFingerprint(),
      });
      setName('');
      setPicked(new Set());
      setOpen(false);
      setMsg('Groupe créé ✅');
      onCreated?.();
    } catch (e: any) {
      setMsg(e?.message || 'Création impossible');
    } finally {
      setBusy(false);
    }
  };

  const sorted = [...students].sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '', 'fr'));

  return (
    <div className="glass-card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">👥 Créer un groupe</h2>
        {!open && (
          <button onClick={() => setOpen(true)} className="glass-button px-4 py-2 text-xs font-semibold">
            + Créer un groupe
          </button>
        )}
      </div>
      {msg && <p className="text-xs text-gray-600 dark:text-gray-300">{msg}</p>}
      {open && (
        <>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du groupe (ex. Exposé SVT)"
            maxLength={80}
            className="glass-input w-full px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Coche les élèves à ajouter ({picked.size} sélectionné{picked.size > 1 ? 's' : ''})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-72 overflow-y-auto">
            {sorted.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-xl px-2 py-1 text-sm text-gray-700 dark:text-gray-200 hover:bg-white/30">
                <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} className="h-4 w-4" />
                {s.first_name} {s.last_name}
              </label>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setOpen(false); setMsg(''); }} className="glass-button px-4 py-2 text-xs">Annuler</button>
            <button onClick={save} disabled={busy} className="glass-button px-4 py-2 text-xs font-semibold">
              {busy ? 'Enregistrement…' : 'Enregistrer le groupe'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
