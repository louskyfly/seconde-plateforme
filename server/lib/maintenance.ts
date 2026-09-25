import type Database from 'better-sqlite3';

export const DEFAULT_MAINTENANCE_MESSAGE =
  'Le site est temporairement indisponible pour maintenance. Merci de revenir plus tard.';

export interface MaintenanceState {
  active: boolean;
  message: string;
  activated_by: string | null;
  activated_at: string | null;
  deactivated_by: string | null;
  deactivated_at: string | null;
}

interface MaintenanceRow {
  id: number;
  active: number;
  message: string | null;
  activated_by: string | null;
  activated_at: string | null;
  deactivated_by: string | null;
  deactivated_at: string | null;
}

export function getMaintenanceState(db: Database.Database): MaintenanceState {
  const row = db
    .prepare('SELECT * FROM maintenance_log ORDER BY id DESC LIMIT 1')
    .get() as MaintenanceRow | undefined;

  if (!row) {
    return {
      active: false,
      message: DEFAULT_MAINTENANCE_MESSAGE,
      activated_by: null,
      activated_at: null,
      deactivated_by: null,
      deactivated_at: null,
    };
  }

  return {
    active: row.active === 1,
    message: row.message?.trim() || DEFAULT_MAINTENANCE_MESSAGE,
    activated_by: row.activated_by,
    activated_at: row.activated_at,
    deactivated_by: row.deactivated_by,
    deactivated_at: row.deactivated_at,
  };
}

export function activateMaintenance(db: Database.Database, by: string, message?: string): MaintenanceState {
  db.prepare(
    `INSERT INTO maintenance_log (active, message, activated_by) VALUES (1, ?, ?)`
  ).run(message?.trim() || DEFAULT_MAINTENANCE_MESSAGE, by);

  logAdminAction(db, 'maintenance_on', 'maintenance', null, `Mode maintenance activé par ${by}`);
  return getMaintenanceState(db);
}

export function deactivateMaintenance(db: Database.Database, by: string): MaintenanceState {
  db.prepare(
    `INSERT INTO maintenance_log (active, message, activated_by, deactivated_by, deactivated_at)
     VALUES (0, NULL, ?, ?, CURRENT_TIMESTAMP)`
  ).run(by, by);

  logAdminAction(db, 'maintenance_off', 'maintenance', null, `Mode maintenance désactivé par ${by}`);
  return getMaintenanceState(db);
}

export function logAdminAction(
  db: Database.Database,
  action: string,
  targetType?: string | null,
  targetId?: number | null,
  detail?: string | null
): void {
  db.prepare(
    'INSERT INTO admin_log (action, target_type, target_id, detail) VALUES (?, ?, ?, ?)'
  ).run(action, targetType ?? null, targetId ?? null, detail ?? null);
}
