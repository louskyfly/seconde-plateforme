import { useCallback, useEffect, useRef, useState } from 'react';
import { api, DATA_CHANGED_EVENT, isLocalWrite } from '@/lib/api';
import { generateFingerprint } from '@/lib/utils';

/**
 * Centre de notifications des élèves, 100 % côté navigateur (gratuit, sans serveur).
 *
 * - Rassemble les nouveautés de toutes les rubriques (fiches, idées, annonces,
 *   sondages, agenda, ressources, projets, révisions).
 * - « Nouveau » = créé après la dernière ouverture de la cloche sur cet appareil.
 * - Quand un élément arrive pendant que le site est ouvert : petite alerte à
 *   l'écran. Les vraies notifications de l'iPad (site fermé) passent par
 *   usePushNotifications + le robot GitHub Actions.
 */

export interface NotifItem {
  key: string;
  emoji: string;
  kind: string;
  title: string;
  link: string;
  createdAt: number;
}

const SEEN_KEY = 'notif_seen_at';
const MAX_ITEMS = 30;
const FIRST_VISIT_WINDOW = 3 * 24 * 3600 * 1000;

function ts(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function readSeen(): number {
  try {
    const v = Number(localStorage.getItem(SEEN_KEY));
    if (v > 0) return v;
    const start = Date.now() - FIRST_VISIT_WINDOW;
    localStorage.setItem(SEEN_KEY, String(start));
    return start;
  } catch {
    return Date.now() - FIRST_VISIT_WINDOW;
  }
}

function fmtDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

async function collect(): Promise<NotifItem[]> {
  const fp = generateFingerprint();
  const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const [annonces, idees, fiches, sondages, events, ressources, projets, revisions] = await Promise.all([
    safe(api.getAnnouncements(fp), []),
    safe(api.getIdeas(), []),
    safe(api.getSheets({ fingerprint: fp }).then((r) => r.items), []),
    safe(api.getPolls(fp), []),
    safe(api.getEvents(), []),
    safe(api.getResources(), []),
    safe(api.getProjects(), []),
    safe(api.getRevisionSessions(true, fp), []),
  ]);

  const items: NotifItem[] = [
    ...annonces.map((a) => ({ key: `a:${a.id}`, emoji: '📢', kind: 'Nouvelle annonce', title: a.title, link: '/informations', createdAt: ts(a.created_at) })),
    ...idees.map((i) => ({ key: `i:${i.id}`, emoji: '💡', kind: 'Nouvelle idée', title: i.title, link: '/idees', createdAt: ts(i.created_at) })),
    ...fiches
      .filter((s) => !s.is_mine)
      .map((s) => ({ key: `f:${s.id}`, emoji: '📝', kind: 'Nouvelle fiche', title: s.title, link: '/fiches', createdAt: ts(s.created_at) })),
    ...sondages.map((p) => ({ key: `p:${p.id}`, emoji: '🗳️', kind: 'Nouveau sondage', title: p.question, link: '/sondages', createdAt: ts(p.created_at) })),
    ...events.map((e) => ({
      key: `e:${e.id}`,
      emoji: e.category === 'controle' ? '🔴' : '📅',
      kind: e.category === 'controle' ? 'Nouveau contrôle' : "Nouvel événement dans l'agenda",
      title: `${e.title} · ${fmtDay(e.date)}`,
      link: '/calendrier',
      createdAt: ts(e.created_at),
    })),
    ...ressources.map((r) => ({ key: `r:${r.id}`, emoji: '📚', kind: 'Nouvelle ressource', title: r.title, link: '/ressources', createdAt: ts(r.created_at) })),
    ...projets.map((p) => ({ key: `j:${p.id}`, emoji: '🚀', kind: 'Nouveau projet', title: p.name, link: '/projets', createdAt: ts(p.created_at) })),
    ...revisions
      .filter((r) => !r.mine)
      .map((r) => ({ key: `v:${r.id}`, emoji: '📖', kind: 'Nouvelle session de révision', title: `${r.title || r.subject} · ${fmtDay(r.date)}`, link: '/revisions', createdAt: ts(r.created_at) })),
  ];

  return items
    .filter((i) => i.createdAt > 0 && i.title)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ITEMS);
}

export function useNotifications() {
  const [items, setItems] = useState<NotifItem[]>([]);
  const [seenAt, setSeenAt] = useState<number>(() => readSeen());
  const [toasts, setToasts] = useState<NotifItem[]>([]);
  const known = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    const list = await collect();
    const prev = known.current;
    if (prev) {
      const fresh = list.filter(
        (i) => !prev.has(i.key) && Date.now() - i.createdAt < 10 * 60 * 1000 && !isLocalWrite(i.createdAt)
      );
      if (fresh.length) {
        setToasts((t) => [...fresh.slice(0, 3), ...t].slice(0, 3));
      }
    }
    known.current = new Set([...(prev || []), ...list.map((i) => i.key)]);
    setItems(list);
  }, []);

  useEffect(() => {
    void refresh();
    let timer: number | null = null;
    const onChange = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 300);
    };
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    document.addEventListener('visibilitychange', onChange);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, onChange);
      document.removeEventListener('visibilitychange', onChange);
      if (timer != null) window.clearTimeout(timer);
    };
  }, [refresh]);

  // Les alertes à l'écran disparaissent seules après 6 s.
  useEffect(() => {
    if (!toasts.length) return;
    const id = window.setTimeout(() => setToasts((t) => t.slice(0, -1)), 6000);
    return () => window.clearTimeout(id);
  }, [toasts]);

  const markAllSeen = useCallback(() => {
    const now = Date.now();
    try {
      localStorage.setItem(SEEN_KEY, String(now));
    } catch {
      /* stockage indisponible */
    }
    setSeenAt(now);
  }, []);

  const dismissToast = useCallback((key: string) => setToasts((t) => t.filter((i) => i.key !== key)), []);

  const unread = items.filter((i) => i.createdAt > seenAt).length;

  return { items, unread, seenAt, markAllSeen, toasts, dismissToast };
}
