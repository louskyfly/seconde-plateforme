import { useState, useEffect } from 'react';
import { db } from '../lib/db';
import { useSettings } from '../hooks/useSettings';
import { verifyPassword } from '../utils/password';

export default function Admin() {
  const { settings, updateSettings } = useSettings();
  const [overview, setOverview] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    const [overviewData, logsData] = await Promise.all([
      getOverview(),
      db.adminLog.orderBy('id').reverse().limit(50).toArray(),
    ]);
    setOverview(overviewData);
    setLogs(logsData);
  };

  const getOverview = async () => {
    const sheets = await db.sheets.count();
    const hiddenSheets = await db.sheets.where('status').equals('hidden').count();
    const chatMessages = await db.chatMessagesDB.count();
    const chatUsers = await db.chatUsers.where('kind').equals('student').count();
    const allChatMessages = await db.chatMessagesDB.toArray();
    const imagesPosted = allChatMessages.filter(m => m.image).length;
    return { sheets, hiddenSheets, chatMessages, chatUsers, imagesPosted };
  };

  const handleExport = async () => {
    const tables = db.tables.map(t => t.name).filter(t => !t.startsWith('_'));
    const data: Record<string, any[]> = {};
    for (const table of tables) {
      const rows = await db.table(table).toArray();
      data[table] = rows;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seconde-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text) as Record<string, any[]>;
      const tableInstances = db.tables.map(t => db.table(t.name));
      await db.transaction('rw', tableInstances, async () => {
        for (const [table, rows] of Object.entries(data)) {
          if (db.table(table)) {
            await db.table(table).clear();
            await db.table(table).bulkAdd(rows);
          }
        }
      });
      alert('Restauration réussie');
      window.location.reload();
    } catch (e) {
      alert('Fichier invalide');
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    const settingsData = await db.settings.get(1);
    if (!settingsData) return alert('Config manquante');
    const valid = await verifyPassword(password, settingsData.passwordHash);
    if (!valid) return alert('Mot de passe incorrect');
    await db.settings.put({ ...settingsData, maintenanceMode: true, maintenanceMessage: message || 'Maintenance en cours' });
    alert('Mode maintenance activé');
    setPassword('');
    setMessage('');
  };

  const handleDeactivate = async () => {
    await db.settings.update(1, { maintenanceMode: false, maintenanceMessage: null });
    alert('Mode maintenance désactivé');
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    // Implementation would hash new password
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Administration</h1>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-4 p-4" role="tablist">
          {['overview', 'logs', 'backup', 'maintenance', 'settings'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab
                  ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              role="tab"
              aria-selected={activeTab === tab}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'overview' && overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Fiches actives" value={overview.sheets} icon="📄" color="blue" />
          <StatCard label="Fiches masquées" value={overview.hiddenSheets} icon="📄" color="gray" />
          <StatCard label="Messages chat" value={overview.chatMessages} icon="💬" color="green" />
          <StatCard label="Utilisateurs chat" value={overview.chatUsers} icon="👥" color="yellow" />
          <StatCard label="Images postées" value={overview.imagesPosted} icon="🖼️" color="purple" />
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Journal d'administration</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr className="text-left text-sm text-gray-500">
                  <th className="p-3 font-medium">Date</th>
                  <th className="p-3 font-medium">Action</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium">Cible</th>
                  <th className="p-3 font-medium">Détail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="p-3 text-sm text-gray-600">{new Date(log.createdAt).toLocaleString('fr-FR')}</td>
                    <td className="p-3 text-sm font-medium text-gray-900">{log.action}</td>
                    <td className="p-3 text-sm text-gray-600">{log.targetType || '-'}</td>
                    <td className="p-3 text-sm text-gray-600">{log.targetId ? `#${log.targetId}` : '-'}</td>
                    <td className="p-3 text-sm text-gray-600">{log.detail || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Export / Import</h3>
            <div className="flex gap-4">
              <button onClick={handleExport} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">
                Exporter tout (JSON)
              </button>
              <label className="flex items-center gap-2 cursor-pointer bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200">
                <input type="file" accept=".json" onChange={handleRestore} className="sr-only" />
                Importer une sauvegarde
              </label>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Sauvegardes automatiques</h3>
            <p className="text-gray-600 mb-4">Les sauvegardes sont créées automatiquement chaque jour.</p>
          </div>
        </div>
      )}

      {activeTab === 'maintenance' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Mode maintenance</h3>
            <form onSubmit={handleActivate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe délégué</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message (optionnel)</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className="w-full p-3 border border-gray-300 rounded-lg" placeholder="Site en maintenance, merci de revenir plus tard..." />
              </div>
              <button type="submit" className="bg-red-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-700">Activer la maintenance</button>
            </form>
            <button onClick={handleDeactivate} className="mt-4 bg-gray-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-gray-700">Désactiver la maintenance</button>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Informations de la classe</h3>
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
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Thème de saison</label>
                <select value={settings?.seasonTheme} onChange={(e) => updateSettings({ seasonTheme: e.target.value })} className="w-full p-3 border border-gray-300 rounded-lg">
                  <option value="aucun">Aucun</option>
                  <option value="halloween">Halloween</option>
                  <option value="noel">Noël</option>
                  <option value="printemps">Printemps</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Changer le mot de passe délégué</h3>
        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe actuel</label>
            <input type="password" className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
            <input type="password" className="w-full p-3 border border-gray-300 rounded-lg" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer le nouveau mot de passe</label>
            <input type="password" className="w-full p-3 border border-gray-300 rounded-lg" required />
          </div>
          <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700">Changer</button>
        </form>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    purple: 'bg-purple-100 text-purple-700',
    gray: 'bg-gray-100 text-gray-700',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <span className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${colors[color]}`}>{icon}</span>
      </div>
    </div>
  );
}