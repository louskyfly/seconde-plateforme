import { query, execute, queryOne } from '../db/index.js';

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

export async function getMaintenanceState(): Promise<MaintenanceState> {
  const row = await queryOne<MaintenanceRow>(
    'SELECT * FROM maintenance_log ORDER BY id DESC LIMIT 1'
  );

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

export async function activateMaintenance(by: string, message?: string): Promise<MaintenanceState> {
  await execute(
    `INSERT INTO maintenance_log (active, message, activated_by) VALUES (1, $1, $2)`,
    [message?.trim() || DEFAULT_MAINTENANCE_MESSAGE, by]
  );

  await logAdminAction('maintenance_on', 'maintenance', null, `Mode maintenance activé par ${by}`);
  return getMaintenanceState();
}

export async function deactivateMaintenance(by: string): Promise<MaintenanceState> {
  await execute(
    `INSERT INTO maintenance_log (active, message, activated_by, deactivated_by, deactivated_at)
     VALUES (0, NULL, $1, $2, CURRENT_TIMESTAMP)`,
    [by, by]
  );

  await logAdminAction('maintenance_off', 'maintenance', null, `Mode maintenance désactivé par ${by}`);
  return getMaintenanceState();
}

export async function logAdminAction(
  action: string,
  targetType?: string | null,
  targetId?: number | null,
  detail?: string | null
): Promise<void> {
  await execute(
    'INSERT INTO admin_log (action, target_type, target_id, detail) VALUES ($1, $2, $3, $4)',
    [action, targetType ?? null, targetId ?? null, detail ?? null]
  );
}