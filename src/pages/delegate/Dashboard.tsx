import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useSettings } from '@/hooks/useSettings';
import type { Stats } from '@/types';

interface StatCardProps {
  emoji: string;
  label: string;
  count: number;
  to: string;
}

function StatCard({ emoji, label, count, to }: StatCardProps) {
  return (
    <Link to={to} className="glass-card block min-h-[44px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{count}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{label}</p>
        </div>
        <span className="text-2xl">{emoji}</span>
      </div>
    </Link>
  );
}

function Dashboard() {
  const { settings } = useSettings();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getStats()
      .then(setStats)
      .catch((err: any) => setError(err.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tableau de bord</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Bienvenue, {settings?.delegate_name || 'Délégué'} 👋
        </p>
      </div>

      {error && (
        <div className="glass-card border-red-300/40 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-[3px] border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            emoji="📩"
            label="Nouveaux messages"
            count={stats?.newMessages ?? 0}
            to="messages"
          />
          <StatCard
            emoji="💡"
            label="Nouvelles idées"
            count={stats?.newIdeas ?? 0}
            to="idees"
          />
          <StatCard
            emoji="🗳️"
            label="Sondages actifs"
            count={stats?.activePolls ?? 0}
            to="sondages"
          />
          <StatCard
            emoji="📢"
            label="Annonces publiées"
            count={stats?.announcementsCount ?? 0}
            to="annonces"
          />
          <StatCard
            emoji="📅"
            label="Prochains événements"
            count={stats?.upcomingEvents ?? 0}
            to="calendrier"
          />
        </div>
      )}

      <div className="glass-card">
        <h2 className="font-semibold mb-3">Actions rapides</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link to="messages" className="glass-button text-sm">
            📩 Voir les messages
          </Link>
          <Link to="idees" className="glass-button text-sm">
            💡 Gérer les idées
          </Link>
          <Link to="sondages" className="glass-button text-sm">
            🗳️ Créer un sondage
          </Link>
          <Link to="annonces" className="glass-button text-sm">
            📢 Publier une annonce
          </Link>
          <Link to="calendrier" className="glass-button text-sm">
            📅 Ajouter un événement
          </Link>
          <Link to="ressources" className="glass-button text-sm">
            📚 Ajouter une ressource
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;