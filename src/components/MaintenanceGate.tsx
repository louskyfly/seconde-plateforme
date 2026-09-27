import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useMaintenance } from '@/hooks/useMaintenance';
import { useSettings } from '@/hooks/useSettings';
import Maintenance from '@/pages/Maintenance';
import { PageLoader } from './ui/PageLoader';

/**
 * Garde de maintenance côté client (confort) — la vraie protection est côté serveur,
 * dans server/middleware/maintenance.ts, qui bloque toutes les API.
 *
 * La zone /gestion reste accessible : c'est elle qui permet au délégué de rouvrir le site.
 *
 * Ce composant enveloppe toutes les routes : c'est ici que le thème de saison
 * est appliqué, pour qu'il soit visible partout (y compris connexion et maintenance).
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { active, message, isAdmin, checked } = useMaintenance();
  useSettings(); // applique la couleur d'accent et le thème de saison

  if (!checked) return <PageLoader />;
  if (active && !isAdmin && !location.pathname.startsWith('/gestion')) {
    return <Maintenance message={message} />;
  }
  return <>{children}</>;
}
