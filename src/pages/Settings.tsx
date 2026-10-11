import { useState, useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';
import { getFingerprint } from '../lib/db';

export default function Settings() {
  const { settings, updateSettings } = useSettings();
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [notifications, setNotifications] = useState(true);
  const [autoSave, setAutoSave] = useState(true);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' || 'system';
    setTheme(savedTheme);
    applyTheme(savedTheme);
  }, []);

  const applyTheme = (t: string) => {
    if (t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleThemeChange = (t: 'light' | 'dark' | 'system') => {
    setTheme(t);
    localStorage.setItem('theme', t);
    applyTheme(t);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Informations de la classe</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la classe</label>
            <input type="text" value={settings?.className} onChange={(e) => updateSettings({ className: e.target.value })} className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom du délégué</label>
            <input type="text" value={settings?.delegateName} onChange={(e) => updateSettings({ delegateName: e.target.value })} className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jeton d'accès délégué</label>
            <input type="text" value={settings?.delegateLinkToken} onChange={(e) => updateSettings({ delegateLinkToken: e.target.value })} className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Couleur d'accent</label>
            <input type="color" value={settings?.accentColor} onChange={(e) => updateSettings({ accentColor: e.target.value })} className="w-12 h-10 rounded-lg border-none cursor-pointer" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Message d'accueil</label>
            <textarea value={settings?.homeInfo} onChange={(e) => updateSettings({ homeInfo: e.target.value })} rows={3} className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mt-6">
        <h2 className="text-lg font-semibold mb-4">Thème</h2>
        <div className="grid grid-cols-3 gap-4">
          {['light', 'dark', 'system'].map(t => (
            <button
              key={t}
              onClick={() => handleThemeChange(t as any)}
              className={`p-4 rounded-xl border-2 transition-all ${theme === t ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
            >
              <div className="text-center">
                <span className="text-3xl mb-2 block">{t === 'light' ? '☀️' : t === 'dark' ? '🌙' : '💻'}</span>
                <p className="font-medium capitalize">{t}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mt-6">
        <h2 className="text-lg font-semibold mb-4">Préférences</h2>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
            <span className="text-gray-700">Notifications push</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
            <span className="text-gray-700">Sauvegarde automatique</span>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mt-6">
        <h2 className="text-lg font-semibold mb-4">Données locales</h2>
        <p className="text-gray-600 mb-4">Toutes vos données sont stockées localement sur cet appareil (IndexedDB). Rien n'est envoyé sur un serveur.</p>
        <div className="flex gap-2">
          <button onClick={() => { if (confirm('Supprimer TOUTES les données ?')) { localStorage.clear(); indexedDB.deleteDatabase('SecondePlatformLocal'); location.reload(); } }} className="bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700">
            Tout effacer
          </button>
          <button className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200">
            Exporter mes données
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mt-6">
        <h2 className="text-lg font-semibold mb-4">Votre identifiant appareil</h2>
        <p className="text-gray-600 mb-4">Cet identifiant unique vous permet de retrouver vos données sur cet appareil.</p>        <div className="bg-gray-100 p-4 rounded-lg font-mono text-sm break-all select-all">
          {getFingerprint()}
        </div>
      </div>
    </div>
  );
}