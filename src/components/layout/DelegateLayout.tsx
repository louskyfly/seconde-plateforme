import { lazy, useState } from 'react';
import { Outlet, NavLink, useLocation, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { SESSION_EXPIRED_EVENT } from '@/lib/api';
import { useEffect } from 'react';

const Login = lazy(() => import('@/pages/delegate/Login'));

const NAV_ITEMS = [
  { emoji: '📊', label: 'Tableau de bord', end: true },
  { emoji: '📩', label: 'Messages' },
  { emoji: '💬', label: 'Chat de classe' },
  { emoji: '💡', label: 'Idées' },
  { emoji: '🗳️', label: 'Sondages' },
  { emoji: '📢', label: 'Annonces' },
  { emoji: '📅', label: 'Calendrier' },
  { emoji: '📝', label: 'Fiches' },
  { emoji: '📚', label: 'Ressources' },
  { emoji: '🚀', label: 'Projets' },
  { emoji: '👥', label: 'Élèves' },
  { emoji: '⚙️', label: 'Paramètres' },
];

const PATH_MAP: Record<string, string> = {
  'Tableau de bord': '',
  'Messages': '/messages',
  'Chat de classe': '/chat',
  'Idées': '/idees',
  'Sondages': '/sondages',
  'Annonces': '/annonces',
  'Calendrier': '/calendrier',
  'Fiches': '/fiches',
  'Ressources': '/ressources',
  'Projets': '/projets',
  'Élèves': '/classe',
  'Paramètres': '/parametres',
};

function Sidebar({ token }: { token: string }) {
  const { settings } = useSettings();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate(`/gestion/${token}`);
  };

  return (
    <aside className="fixed top-0 left-0 h-full w-64 glass border-r border-white/20 dark:border-gray-700/30 z-30 hidden lg:flex flex-col">
      <div className="p-5 border-b border-white/10 dark:border-gray-700/20">
        <h1 className="text-lg font-bold text-indigo-600 dark:text-indigo-400 truncate">
          {settings?.class_name || 'Classe'}
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Espace délégué</p>
        <p className="text-xs font-medium text-indigo-500 dark:text-indigo-400 mt-1 truncate">
          {settings?.delegate_name || 'Délégué'}
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.label}
            to={`/gestion/${token}${PATH_MAP[item.label]}`}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 mb-1 ${
                isActive
                  ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-700/30'
              }`
            }
          >
            <span className="text-lg flex-shrink-0">{item.emoji}</span>
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10 dark:border-gray-700/20">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50/50 dark:hover:bg-red-900/20 w-full transition-all"
        >
          <span className="text-lg">🚪</span>
          <span>Déconnexion</span>
        </button>
        <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-3 text-center">
          Créé et déployé par Lucas Sanchez
        </p>
      </div>
    </aside>
  );
}

function DelegateBottomNav({ token }: { token: string }) {
  const items = [
    { emoji: '📊', label: 'Board', path: `/gestion/${token}`, end: true },
    { emoji: '📩', label: 'Messages', path: `/gestion/${token}/messages` },
    { emoji: '💬', label: 'Chat', path: `/gestion/${token}/chat` },
    { emoji: '💡', label: 'Idées', path: `/gestion/${token}/idees` },
    { emoji: '🗳️', label: 'Sondages', path: `/gestion/${token}/sondages` },
    { emoji: '📢', label: 'Annonces', path: `/gestion/${token}/annonces` },
    { emoji: '📅', label: 'Calendrier', path: `/gestion/${token}/calendrier` },
    { emoji: '📝', label: 'Fiches', path: `/gestion/${token}/fiches` },
    { emoji: '📚', label: 'Ressources', path: `/gestion/${token}/ressources` },
    { emoji: '🚀', label: 'Projets', path: `/gestion/${token}/projets` },
    { emoji: '👥', label: 'Élèves', path: `/gestion/${token}/classe` },
    { emoji: '⚙️', label: 'Réglages', path: `/gestion/${token}/parametres` },
  ];

  return (
    <nav className="bottom-nav glass border-t border-white/20 dark:border-gray-700/30 z-40">
      <div className="flex overflow-x-auto scrollbar-none px-2 py-2 gap-1">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center min-w-[60px] px-2 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-500 dark:text-gray-400 active:bg-gray-200/50 dark:active:bg-gray-700/50'
              }`
            }
          >
            <span className="text-xl mb-0.5">{item.emoji}</span>
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function DelegateLayout() {
  const { token } = useParams<{ token: string }>();
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Dès qu'une écriture échoue sur 401, on note la cause pour expliquer
  // l'écran de connexion plutôt que d'afficher une page vide.
  useEffect(() => {
    const onExpired = () => setSessionExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login token={token || ''} sessionExpired={sessionExpired} />;
  }

  return (
    <div className="min-h-[100dvh]">
      <Sidebar token={token || ''} />
      <main className="lg:ml-64">
        <div className="page-container">
          <div key={location.pathname} className="page-transition">
            <Outlet />
          </div>
        </div>
        <footer className="pb-4 text-center text-[10px] text-gray-300 dark:text-gray-600">
          Créé et déployé par Lucas Sanchez
        </footer>
      </main>
      <DelegateBottomNav token={token || ''} />
    </div>
  );
}

export default DelegateLayout;