import { NavLink, useLocation } from 'react-router-dom';
import { useChatUnread } from '@/hooks/useChatUnread';
import { usePendingPolls } from '@/hooks/usePendingPolls';

const NAV_ITEMS = [
  { to: '/', emoji: '🏠', label: 'Accueil' },
  { to: '/informations', emoji: '📢', label: 'Infos' },
  { to: '/chat', emoji: '💬', label: 'Chat' },
  { to: '/idees', emoji: '💡', label: 'Idées' },
  { to: '/messagerie', emoji: '📩', label: 'Délégué' },
  { to: '/fiches', emoji: '📝', label: 'Fiches' },
  { to: '/sondages', emoji: '🗳️', label: 'Sondages' },
  { to: '/calendrier', emoji: '📅', label: 'Agenda' },
  { to: '/ressources', emoji: '📚', label: 'Ressources' },
  { to: '/projets', emoji: '🚀', label: 'Projets' },
  { to: '/classe', emoji: '👥', label: 'Classe' },
];

export function BottomNav() {
  const location = useLocation();
  const unread = useChatUnread(location.pathname !== '/chat');
  const pendingPolls = usePendingPolls(location.pathname !== '/sondages');

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
            <span className="relative text-xl mb-0.5 inline-block">
              {item.emoji}
              {item.to === '/chat' && unread > 0 && (
                <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-red-500" />
              )}
              {item.to === '/sondages' && pendingPolls > 0 && (
                <span className="absolute -top-0.5 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {pendingPolls > 9 ? '9+' : pendingPolls}
                </span>
              )}
            </span>
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
