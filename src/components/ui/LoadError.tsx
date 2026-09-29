import type { ReactNode } from 'react';

/**
 * Écran d'erreur de chargement.
 *
 * Il existe parce que les pages faisaient `catch {}` puis `setLoading(false)` :
 * une panne réseau affichait donc « Aucun sondage » ou « Aucun événement »,
 * exactement comme une base vide. L'élève croyait ses données perdues alors
 * qu'il suffisait de recharger. Ici on distingue les deux cas et on propose
 * de réessayer.
 */
export function LoadError({ onRetry, compact = false, children }: { onRetry: () => void; compact?: boolean; children?: ReactNode }) {
  return (
    <div
      role="alert"
      className={`glass-card text-center ${compact ? 'py-6' : 'py-10'} border-red-300/60 dark:border-red-500/30`}
    >
      <p className="text-3xl mb-3">📡</p>
      <p className="text-sm font-semibold text-red-600 dark:text-red-400">Impossible de charger les données</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
        {children ?? "La connexion au serveur a échoué. Tes données sont peut-être toujours là, ce n'est qu'un problème de réseau."}
      </p>
      <button type="button" onClick={onRetry} className="glass-button mt-4 text-xs px-4 py-2">
        Réessayer
      </button>
    </div>
  );
}
