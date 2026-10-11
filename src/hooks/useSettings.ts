import { useState, useEffect } from 'react';
import { getSettings, saveSettings } from '../lib/db';

export function useSettings() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const s = await getSettings();
      setSettings(s);
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (updates: Partial<any>) => {
    try {
      const updated = await saveSettings({ ...settings, ...updates });
      setSettings(updated);
      return updated;
    } catch (e) {
      console.error('Failed to save settings:', e);
      throw e;
    }
  };

  return { settings, loading, updateSettings, refreshSettings: loadSettings };
}