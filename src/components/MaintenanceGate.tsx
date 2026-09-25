import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useMaintenance } from '@/hooks/useMaintenance';
import Maintenance from '@/pages/Maintenance';
import { PageLoader } from './ui/PageLoader';

/**
 * Garde de maintenance côté client (confort) — la vraie protection est côté serveur,
 * dans server/middleware/maintenance.ts, qui bloque toutes les API.
 *
 * La zone /gestion reste accessible : c'est elle qui permet au délégué de rouvrir le site.
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { active, message, isAdmin, checked } = useMaintenance();

  if (!checked) return <PageLoader />;
  if (active && !isAdmin && !location.pathname.startsWith('/gestion')) {
    return <Maintenance message={message} />;
  }
  return <>{children}</>;
}
