import { useCallback, useEffect, useState } from 'react';
import { indexedDbService } from '../services/storage/IndexedDbService';
import { DEFAULT_SETTINGS, type AppSettings } from '../types/settings';

function applyThemeClass(theme: AppSettings['theme']) {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    indexedDbService.loadSettings().then((loadedSettings) => {
      if (!active) return;
      setSettings(loadedSettings);
      applyThemeClass(loadedSettings.theme);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      applyThemeClass(next.theme);
      void indexedDbService.saveSettings(next);
      return next;
    });
  }, []);

  return {
    settings,
    loaded,
    updateSettings,
  };
}
