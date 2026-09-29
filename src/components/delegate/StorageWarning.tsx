import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type BackupFile = { file: string; date: string; size: number };
type StorageInfo = { persistent_storage: boolean; db_path: string; backups: BackupFile[] };

/**
 * Alerte de sauvegarde pour le délégué.
 *
 * Sur le plan Render gratuit, le disque est éphémère : la base est reconstruite
 * à chaque extinction de l'instance. Aucune sauvegarde automatique ne peut
 * survivre à cela, puisque les fichiers vivent sur ce même disque. Le seul
 * moyen de conserver les données est donc qu'un export soit téléchargé.
 *
 * Ce composant rend cette contrainte visible au lieu de la laisser buried
 * dans les logs, et met la sauvegarde et la restauration à portée de clic.
 */
export function StorageWarning() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo(await api.getStorageInfo());
    } catch {
      setInfo(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const download = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      // L'export arrive en `Content-Disposition: attachment` : il faut déclencher
      // l'enregistrement du fichier nous-mêmes, `fetch` ne le fait pas.
      const res = await fetch('/api/admin/export', { credentials: 'include' });
      if (!res.ok) throw new Error('Export refusé par le serveur');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `seconde-sauvegarde-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Export impossible');
    } finally {
      setBusy(false);
    }
  }, []);

  if (!info) return null;
  if (info.persistent_storage) return null;

  return (
    <div className="glass-card border-2 border-amber-400/60 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">⚠️</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-amber-700 dark:text-amber-400">
            Les données de ce site ne survivent pas à un redémarrage
          </p>
          <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
            Le serveur utilise un stockage temporaire : à chaque extinction automatique de
            l'instance, la base repart vide (sondages, événements, fiches, messages). Ce n'est
            pas la peine d'installer un disque payant — mais il faut télécharger une sauvegarde
            régulièrement, sinon tout est perdu.
          </p>

          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={download}
              disabled={busy}
              className="px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-all active:scale-95 disabled:opacity-60"
            >
              {busy ? 'Export...' : '💾 Télécharger une sauvegarde'}
            </button>
            <button
              onClick={() => setRestoring((v) => !v)}
              className="px-3 py-2 rounded-xl glass text-xs font-semibold hover:bg-white/10 transition-all"
            >
              {restoring ? 'Annuler' : '♻️ Restaurer une sauvegarde'}
            </button>
            <button onClick={load} className="px-3 py-2 rounded-xl glass text-xs font-semibold hover:bg-white/10 transition-all">
              ↻ Actualiser
            </button>
          </div>

          {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}

          {restoring && <BackupRestore onDone={() => { setRestoring(false); void load(); }} />}

          {info.backups.length > 0 && (
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-3">
              {info.backups.length} sauvegarde(s) automatique(s) sur le serveur, mais elles
              disparaissez au redémarrage : seul un fichier téléchargé compte.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function BackupRestore({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const restore = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await api.importDatabase(parsed, text.length < 200);
      onDone();
    } catch (err: any) {
      setError(err.message || 'Restauration impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 p-3 rounded-xl bg-white/5 dark:bg-black/20">
      <p className="text-[11px] text-gray-600 dark:text-gray-300">
        Choisis un fichier de sauvegarde téléchargé précédemment (.json).
      </p>
      <label
        className={`mt-2 block text-center px-3 py-2.5 rounded-xl border border-dashed border-amber-400/60 text-xs font-semibold cursor-pointer hover:bg-amber-500/10 transition-colors ${
          busy ? 'opacity-50 pointer-events-none' : ''
        }`}
      >
        {busy ? 'Restauration...' : 'Choisir le fichier de sauvegarde'}
        <input
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void restore(file);
          }}
        />
      </label>
      {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}
    </div>
  );
}
