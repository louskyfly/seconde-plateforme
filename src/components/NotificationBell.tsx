import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, type NotifItem } from '@/hooks/useNotifications';
import { usePushNotifications } from '@/hooks/usePushNotifications';

function ago(t: number): string {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hier' : `il y a ${d} j`;
}

/** Cloche des nouveautés (en haut à droite) + alertes à l'écran. */
export function NotificationBell() {
  const { items, unread, seenAt, markAllSeen, toasts, dismissToast } = useNotifications();
  const push = usePushNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const go = (item: NotifItem) => {
    setOpen(false);
    dismissToast(item.key);
    navigate(item.link);
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
      markAllSeen();
    } else {
      setOpen(true);
    }
  };

  return (
    <>
      <div ref={panelRef} className="fixed right-3 top-3 z-50" style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <button
          onClick={toggle}
          aria-label={unread ? `${unread} nouveautés` : 'Notifications'}
          className="glass relative flex h-11 w-11 items-center justify-center rounded-full text-xl shadow-lg"
        >
          🔔
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {open && (
          <div className="glass absolute right-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl shadow-2xl animate-slideUp">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 dark:border-gray-700/30">
              <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Nouveautés</p>
              {unread > 0 && (
                <button onClick={markAllSeen} className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  Tout marquer comme lu
                </button>
              )}
            </div>

            {push.status === 'default' || push.status === 'busy' ? (
              <button
                onClick={push.enable}
                disabled={push.status === 'busy'}
                className="flex w-full items-center gap-2 border-b border-white/10 bg-indigo-500/10 px-4 py-2.5 text-left text-xs font-medium text-indigo-700 dark:border-gray-700/30 dark:text-indigo-300"
              >
                📲 {push.status === 'busy' ? 'Activation…' : "Recevoir les notifications sur l'écran de l'iPad"}
              </button>
            ) : push.status === 'needs-install' ? (
              <p className="border-b border-white/10 bg-indigo-500/10 px-4 py-2.5 text-xs text-indigo-700 dark:border-gray-700/30 dark:text-indigo-300">
                📲 Pour les notifications : bouton Partager ⬆️ puis « Sur l'écran d'accueil », et ouvre le site depuis l'icône.
              </p>
            ) : push.status === 'granted' ? (
              <p className="border-b border-white/10 px-4 py-2 text-[11px] text-emerald-700 dark:border-gray-700/30 dark:text-emerald-400">
                ✅ Notifications activées sur cet appareil
              </p>
            ) : push.status === 'denied' ? (
              <p className="border-b border-white/10 px-4 py-2 text-[11px] text-gray-600 dark:border-gray-700/30 dark:text-gray-300">
                Notifications bloquées : Réglages → Notifications → Seconde pour les réactiver.
              </p>
            ) : null}

            <div className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-600 dark:text-gray-300">Rien de nouveau pour l'instant.</p>
              ) : (
                items.map((item) => {
                  const fresh = item.createdAt > seenAt;
                  return (
                    <button
                      key={item.key}
                      onClick={() => go(item)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-100/50 dark:hover:bg-gray-700/30 ${
                        fresh ? 'bg-indigo-500/5' : ''
                      }`}
                    >
                      <span className="mt-0.5 text-lg">{item.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                          {item.kind}
                        </span>
                        <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">{item.title}</span>
                        <span className="block text-[11px] text-gray-500 dark:text-gray-400">{ago(item.createdAt)}</span>
                      </span>
                      {fresh && <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {toasts.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-3">
          {toasts.map((item) => (
            <button
              key={item.key}
              onClick={() => go(item)}
              className="glass pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl px-4 py-3 text-left shadow-2xl animate-slideUp"
            >
              <span className="text-2xl">{item.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-indigo-600 dark:text-indigo-400">{item.kind}</span>
                <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">{item.title}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
