import { useState } from 'react';
import { api } from '@/lib/api';
import { useMaintenance } from '@/hooks/useMaintenance';
import { Modal } from '@/components/ui/Modal';
import type { MaintenanceLogEntry } from '@/types';

function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Bouton d'arrêt d'urgence : l'activation exige le mot de passe du délégué,
 * pour qu'aucun clic accidentel ne mette le site hors service.
 */
export function SiteStatusCard() {
  const { active, message, activated_at, activated_by, checked } = useMaintenance(20000);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<MaintenanceLogEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadHistory = async () => {
    try {
      setHistory(await api.getMaintenanceHistory());
      setShowHistory(true);
    } catch {
      setShowHistory(false);
    }
  };

  const stop = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.activateMaintenance(password, customMessage.trim() || undefined);
      setConfirmOpen(false);
      setPassword('');
      setCustomMessage('');
    } catch (err: any) {
      setError(err.message || 'Activation impossible');
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    if (!window.confirm('Rouvrir le site pour tous les élèves ?')) return;
    setBusy(true);
    setError('');
    try {
      await api.deactivateMaintenance();
    } catch (err: any) {
      setError(err.message || 'Réouverture impossible');
    } finally {
      setBusy(false);
    }
  };

  if (!checked) {
    return (
      <div className="glass-card animate-pulse h-24" />
    );
  }

  return (
    <div
      className={`glass-card border-2 ${
        active ? 'border-red-400/60 bg-red-500/5' : 'border-green-400/40'
      }`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{active ? '🔴' : '🟢'}</span>
          <div>
            <p className="font-bold text-sm">{active ? 'Site en maintenance' : 'Site actif'}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {active
                ? `Arrêté par ${activated_by || 'le délégué'}${activated_at ? ` le ${formatDate(activated_at)}` : ''}`
                : 'Tous les élèves peuvent utiliser le site'}
            </p>
          </div>
        </div>

        {active ? (
          <button
            onClick={reopen}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl bg-green-500 text-white text-sm font-bold shadow-lg hover:bg-green-600 transition-all active:scale-95 disabled:opacity-60"
          >
            {busy ? 'Ouverture...' : '✅ Rouvrir le site'}
          </button>
        ) : (
          <button
            onClick={() => setConfirmOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-red-500/90 text-white text-sm font-bold shadow-lg hover:bg-red-600 transition-all active:scale-95"
          >
            🛑 Arrêter le site
          </button>
        )}
      </div>

      {active && (
        <p className="text-[11px] text-red-600 dark:text-red-400 mt-3 px-3 py-2 rounded-lg bg-red-500/10">
          {message}
        </p>
      )}

      {error && !confirmOpen && (
        <p className="text-[11px] text-red-500 mt-2">{error}</p>
      )}

      <button onClick={loadHistory} className="text-[11px] text-gray-500 dark:text-gray-400 hover:underline mt-3">
        Historique des arrêts
      </button>

      {showHistory && history.length > 0 && (
        <ul className="mt-2 space-y-1 text-[10px] text-gray-500 dark:text-gray-400">
          {history.slice(0, 5).map((entry) => (
            <li key={entry.id}>
              {entry.active === 1 ? '🛑 Arrêt' : '✅ Réouverture'} ·{' '}
              {formatDate(entry.active === 1 ? entry.activated_at : entry.deactivated_at)}
              {entry.activated_by ? ` · par ${entry.activated_by}` : ''}
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={confirmOpen} onClose={() => !busy && setConfirmOpen(false)} title="Arrêter le site">
        <div className="space-y-4">
          <div className="glass-card border-red-300/40 p-3">
            <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
              ⚠️ Le site sera inaccessible pour tous les élèves : ils verront une page de maintenance.
              Tu pourras le rouvrir à tout moment depuis ce tableau de bord.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              Message affiché aux élèves (facultatif)
            </label>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Le site est temporairement indisponible pour maintenance. Merci de revenir plus tard."
              className="w-full mt-1 px-4 py-2.5 rounded-xl glass text-sm outline-none focus:ring-2 focus:ring-red-500/40 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              Confirme avec ton mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe délégué"
              className="w-full mt-1 px-4 py-2.5 rounded-xl glass text-sm outline-none focus:ring-2 focus:ring-red-500/40"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={stop}
            disabled={busy || password.length === 0}
            className="w-full py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-all disabled:opacity-50"
          >
            {busy ? 'Arrêt en cours...' : 'Confirmer l’arrêt du site'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
