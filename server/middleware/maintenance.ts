import type { Request, Response, NextFunction } from 'express';
import { getMaintenanceState } from '../lib/maintenance.js';

/**
 * Endpoints qui restent accessibles pendant la maintenance :
 * - /api/health pour que le client affiche la page de maintenance ;
 * - /api/auth/* pour que le délégué puisse se connecter et rouvrir le site ;
 * - /api/maintenance/* (les actions sensibles vérifient requireAuth en interne).
 */
const ALLOWED_PATHS = ['/api/health', '/api/auth', '/api/maintenance'];

function isAllowed(pathname: string): boolean {
  return ALLOWED_PATHS.some((allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`));
}

export async function maintenanceGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }
  if (isAllowed(req.path)) {
    next();
    return;
  }
  if (req.session?.authenticated === true) {
    next();
    return;
  }

  const state = await getMaintenanceState();
  if (!state.active) {
    next();
    return;
  }

  res.status(503).json({
    error: 'MAINTENANCE',
    maintenance: true,
    message: state.message,
  });
}
