import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', emoji: '🏠', label: 'Accueil' },
  { to: '/informations', emoji: '📢', label: 'Infos' },
  { to: '/idees', emoji: '💡', label: 'Idées' },
  { to: '/messagerie', emoji: '💬', label: 'Messages' },
  { to: '/sondages', emoji: '🗳️', label: 'Sondages' },
  { to: '/calendrier', emoji: '📅', label: 'Agenda' },
  { to: '/ressources', emoji: '📚', label: 'Ressources' },
  { to: '/projets', emoji: '🚀', label: 'Projets' },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav glass border-t border-white/20 dark:border-gray-700/30 z-40">
      <div className="flex overflow-x-auto scrollbar-none px-2 py-2 gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
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
