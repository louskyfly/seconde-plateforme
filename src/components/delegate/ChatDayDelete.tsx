import { useState } from 'react';
import { api } from '@/lib/api';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Suppression d'une journée entière de discussion, côté délégué.
 *
 * Le champ attend une date au format AAAA-MM-JJ, la valeur par défaut étant
 * aujourd'hui. La saisie reste possible d'un jour plus ancien, mais la purge
 * automatique passe de toute façon à deux jours : c'est surtout un moyen de
 * cleaning rapide la journée en cours.
 */
export function ChatDayDelete() {
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const remove = async () => {
    if (busy) return;
    const label = date === today() ? 'aujourd’hui' : `le ${date}`;
    if (!window.confirm(`Supprimer définitivement tous les messages du ${label} ?`)) return;

    setBusy(true);
    setError('');
    setDone('');
    try {
      const res = await api.deleteChatDay(date);
      setDone(`${res.deleted} message(s) supprimé(s).`);
    } catch (err: any) {
      setError(err.message || 'Suppression impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Effacer un jour :</span>
        <input
          type="date"
          value={date}
          max={today()}
          onChange={(e) => {
            setDate(e.target.value);
            setDone('');
            setError('');
          }}
          className="px-2 py-1.5 rounded-lg glass text-xs outline-none focus:ring-2 focus:ring-indigo-500/40"
        />
        <button
          type="button"
          onClick={remove}
          disabled={busy || !date}
          className="px-3 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-bold hover:bg-red-600 transition-all active:scale-95 disabled:opacity-50"
        >
          {busy ? 'Suppression...' : 'Supprimer la journée'}
        </button>
      </div>

      {done && <p className="text-[11px] text-green-600 dark:text-green-400 mt-2">{done}</p>}
      {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}

      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2">
        Les messages du chat sont purgés automatiquement au bout de 2 jours.
      </p>
    </div>
  );
}
