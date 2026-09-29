import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useSettings } from '@/hooks/useSettings';
import { SiteStatusCard } from '@/components/delegate/SiteStatusCard';
import { StorageWarning } from '@/components/delegate/StorageWarning';
import type { AdminLogEntry, AdminOverview, Stats } from '@/types';

interface StatCardProps {
  emoji: string;
  label: string;
  count: number;
  to: string;
}

const ACTION_LABELS: Record<string, string> = {
  maintenance_on: '🛑 Site mis en maintenance',
  maintenance_off: '✅ Site rouvert',
  chat_message_delete: '💬 Message de chat supprimé',
  sheet_hide: '📝 Fiche masquée',
  sheet_show: '📝 Fiche remise en ligne',
  sheet_delete: '🗑️ Fiche supprimée',
};

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
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [log, setLog] = useState<AdminLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.getStats(), api.getAdminOverview(), api.getAdminLog(8)])
      .then(([statsData, overviewData, logData]) => {
        setStats(statsData);
        setOverview(overviewData);
        setLog(logData);
      })
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

      {/* Avant la carte de statut : sur Render gratuit la base est volatile,
          c'est la seule information qui doit sauter aux yeux du délégué. */}
      <StorageWarning />

      <SiteStatusCard />

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
          <StatCard emoji="💬" label="Messages dans le chat" count={overview?.chatMessages ?? 0} to="chat" />
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
            emoji="📝"
            label="Fiches de révision"
            count={overview?.sheets ?? 0}
            to="fiches"
          />
          <StatCard
            emoji="🎓"
            label="Élèves inscrits au chat"
            count={overview?.chatUsers ?? 0}
            to="chat"
          />
          <StatCard
            emoji="🖼️"
            label="Photos postées"
            count={overview?.imagesPosted ?? 0}
            to="chat"
          />
        </div>
      )}

      <div className="glass-card">
        <h2 className="font-semibold mb-3">Actions rapides</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link to="messages" className="glass-button text-sm">
            📩 Voir les messages
          </Link>
          <Link to="chat" className="glass-button text-sm">
            💬 Ouvrir le chat
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
          <Link to="fiches" className="glass-button text-sm">
            📝 Gérer les fiches
          </Link>
          <Link to="calendrier" className="glass-button text-sm">
            📅 Ajouter un événement
          </Link>
          <Link to="ressources" className="glass-button text-sm">
            📚 Ajouter une ressource
          </Link>
        </div>
      </div>

      <div className="glass-card">
        <h2 className="font-semibold mb-3">🗒️ Journal d'administration</h2>
        {log.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Aucune action enregistrée pour le moment.
          </p>
        ) : (
          <ul className="space-y-2">
            {log.map((entry) => (
              <li key={entry.id} className="text-xs flex items-start gap-2">
                <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">
                  {new Date(entry.created_at.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
                <span className="text-gray-600 dark:text-gray-300">
                  {ACTION_LABELS[entry.action] || entry.action}
                  {entry.detail ? ` — ${entry.detail}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default Dashboard;