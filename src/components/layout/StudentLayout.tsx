import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useSettings } from '@/hooks/useSettings';
import { BottomNav } from './BottomNav';
import { useEffect } from 'react';

const NAV_ITEMS = [
  { to: '/', emoji: '🏠', label: 'Accueil' },
  { to: '/informations', emoji: '📢', label: 'Informations' },
  { to: '/idees', emoji: '💡', label: 'Boîte à idées' },
  { to: '/messagerie', emoji: '💬', label: 'Parler au délégué' },
  { to: '/sondages', emoji: '🗳️', label: 'Sondages' },
  { to: '/calendrier', emoji: '📅', label: 'Calendrier' },
  { to: '/ressources', emoji: '📚', label: 'Ressources' },
  { to: '/projets', emoji: '🚀', label: 'Projets' },
];

function Sidebar() {
  const { settings } = useSettings();

  return (
    <aside className="fixed top-0 left-0 h-full w-64 glass border-r border-white/20 dark:border-gray-700/30 z-30 hidden lg:flex flex-col">
      <div className="p-5 border-b border-white/10 dark:border-gray-700/20">
        <h1 className="text-lg font-bold text-indigo-600 dark:text-indigo-400 truncate">
          {settings?.class_name || 'Seconde'}
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Espace élève</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-2 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
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
      <div className="p-4 border-t border-white/10 dark:border-gray-700/20">
        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
          {settings?.delegate_name || 'Délégué'}
        </p>
        <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-2">
          Créé et déployé par Lucas Sanchez
        </p>
      </div>
    </aside>
  );
}

export function StudentLayout() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="lg:ml-64">
        <div className="page-container">
          <Outlet />
        </div>
        <footer className="pb-4 text-center text-[10px] text-gray-300 dark:text-gray-600">
          Créé et déployé par Lucas Sanchez
        </footer>
      </main>
      <BottomNav />
    </div>
  );
}
