import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface MaintenanceInfo {
  active: boolean;
  message: string;
  isAdmin: boolean;
  checked: boolean;
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
  });
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    const check = () => {
      api
        .getMaintenanceState()
        .then((data) => {
          if (!mounted) return;
          setState({ active: data.active, message: data.message, isAdmin: data.is_admin });
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
