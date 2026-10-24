import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { FB, countChildren } from '../lib/firebase';

export default function Home() {
  const { settings } = useSettings();
  const [stats, setStats] = useState({
    ideas: 0,
    messages: 0,
    sheets: 0,
    revisions: 0,
    students: 0,
  });

  useEffect(() => {
    const loadStats = async () => {
      const [ideas, messages, sheets, revisions, students] = await Promise.all([
        countChildren(FB.ideas),
        countChildren(FB.messages),
        countChildren(FB.sheets),
        countChildren(FB.revisions),
        countChildren(FB.students),
      ]);
      setStats({ ideas, messages, sheets, revisions, students });
    };
    loadStats();
  }, []);

  const quickActions = [
    { label: 'Nouvelle idee', href: '/idees', icon: '💡', color: 'bg-yellow-100 text-yellow-700' },
    { label: 'Nouvelle revision', href: '/revisions', icon: '📚', color: 'bg-green-100 text-green-700' },
    { label: 'Nouvelle fiche', href: '/fiches', icon: '📄', color: 'bg-blue-100 text-blue-700' },
    { label: 'Nouveau sondage', href: '/sondages', icon: '📊', color: 'bg-purple-100 text-purple-700' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bienvenue, {settings?.className || 'Seconde 9'} 👋
        </h1>
        <p className="text-gray-600 mt-1">
          Votre espace collaboratif - donnees partagees avec toute la classe
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500">Idees</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{stats.ideas}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500">Messages</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{stats.messages}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500">Fiches</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{stats.sheets}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500">Revisions</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{stats.revisions}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500">Eleves</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{stats.students}</p>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions rapides</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              to={action.href}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors ${action.color}`}
            >
              <span className="text-2xl">{action.icon}</span>
              <span className="font-medium text-gray-700">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-8 p-4 bg-blue-50 rounded-xl border border-blue-100">
        <h3 className="font-semibold text-blue-800 mb-2">💡 Donnees partagees</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Idees, sondages, chat, fiches, calendrier... sont visibles par toute la classe</li>
          <li>• Mise a jour en temps reel sur tous les appareils</li>
          <li>• Installable comme app native (PWA)</li>
          <li>• Seuls ton identifiant d'appareil et ton prenom restent sur cet appareil</li>
        </ul>
      </div>
    </div>
  );
}