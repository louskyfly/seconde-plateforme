import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFirebaseValue } from './useFirebaseSync';
import { FB } from '../lib/firebase';
import { saveSharedSettings, withDefaults, type SharedSettings } from '../lib/settings';

/** Réglages de la classe, partagés par tous les appareils via Firebase. */
export function useSettings() {
  const { value, loading: fbLoading } = useFirebaseValue<Partial<SharedSettings>>(FB.settings);
  // Hors ligne, Firebase peut ne jamais repondre : on n'attend pas plus de 4 s
  // (valeurs par defaut, mises a jour des que la connexion revient).
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, []);
  const loading = fbLoading && !timedOut;
  const settings = useMemo(() => (loading ? null : withDefaults(value)), [value, loading]);

  const updateSettings = useCallback(async (updates: Partial<SharedSettings>) => {
    try {
      await saveSharedSettings(updates);
    } catch (e) {
      console.error('Failed to save settings:', e);
      throw e;
    }
  }, []);

  // Conservé pour compatibilité : les données arrivent déjà en temps réel.
  const refreshSettings = useCallback(async () => {}, []);

  return { settings, loading, updateSettings, refreshSettings };
}
