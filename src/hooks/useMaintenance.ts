import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface MaintenanceInfo {
  active: boolean;
  message: string;
  isAdmin: boolean;
  checked: boolean;
  /** Qui a déclenché l'arrêt en cours, et quand (null si le site est ouvert). */
  activated_by?: string | null;
  activated_at?: string | null;
}

/**
 * Contrôle l'état du site toutes les 15 s : la page revient toute seule
 * dès que le délégué rouvre l'accès.
 */
export function useMaintenance(pollMs = 15000): MaintenanceInfo {
  const [state, setState] = useState<Omit<MaintenanceInfo, 'checked'>>({
    active: false,
    message: '',
    isAdmin: false,
    activated_by: null,
    activated_at: null,
  });
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    const check = () => {
      api
        .getMaintenanceState()
        .then((data) => {
          if (!mounted) return;
          setState({
            active: data.active,
            message: data.message,
            isAdmin: data.is_admin,
            activated_by: data.activated_by ?? null,
            activated_at: data.activated_at ?? null,
          });
        })
        .catch(() => {})
        .finally(() => {
          if (mounted) setChecked(true);
        });
    };

    check();
    const id = setInterval(check, pollMs);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return { ...state, checked };
}
