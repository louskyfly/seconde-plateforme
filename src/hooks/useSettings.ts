import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { applyAccent } from '@/lib/accent';
import type { Settings } from '@/types';

let settingsCache: Settings | null = null;
let settingsPromise: Promise<Settings> | null = null;

function fetchSettings(): Promise<Settings> {
  if (!settingsPromise) {
    settingsPromise = api
      .getSettings()
      .then((s) => {
        settingsCache = s;
        settingsPromise = null;
        return s;
      })
      .catch((err) => {
        settingsPromise = null;
        throw err;
      });
  }
  return settingsPromise;
}

export function refreshSettings(): Promise<Settings> {
  settingsCache = null;
  settingsPromise = null;
  return fetchSettings();
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(settingsCache);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const source = settingsCache ? Promise.resolve(settingsCache) : fetchSettings();
    source
      .then((s) => {
        if (!alive) return;
        setSettings(s);
        applyAccent(s.accent_color);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { settings, loading };
}