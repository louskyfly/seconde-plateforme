import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Settings } from '@/types';

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSettings()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { settings, loading };
}
