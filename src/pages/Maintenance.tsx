import { useState } from 'react';
import { api } from '@/lib/api';

export default function Maintenance({ message }: { message: string }) {
  const [retrying, setRetrying] = useState(false);

  const retry = () => {
    setRetrying(true);
    api
      .getMaintenanceState()
      .catch(() => {})
      .finally(() => setRetrying(false));
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="glass-card max-w-lg w-full text-center py-10 px-6 animate-slideUp">
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-amber-500/15 flex items-center justify-center text-3xl">
          🔧
        </div>

        <h1 className="text-xl font-bold mb-2">Maintenance en cours</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          {message || 'Le site est temporairement indisponible pour maintenance. Merci de revenir plus tard.'}
        </p>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="w-3 h-3 rounded-full border-[3px] border-indigo-500/30 border-t-indigo-500 animate-spin" />
          Vérification automatique toutes les 15 secondes
        </div>

        <button onClick={retry} disabled={retrying} className="glass-button text-xs mt-5">
          {retrying ? 'Vérification...' : 'Réessayer maintenant'}
        </button>

        <p className="mt-6 text-[10px] text-gray-300 dark:text-gray-600">
          Créé et déployé par Lucas Sanchez
        </p>
      </div>
    </div>
  );
}
