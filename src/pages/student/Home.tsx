import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useSettings } from '@/hooks/useSettings';
import { formatDate, getRelativeTime } from '@/lib/utils';
import type { Announcement, Event } from '@/types';

const CARDS = [
  { to: '/informations', emoji: '📢', title: 'Informations', subtitle: 'Annonces et actualités' },
  { to: '/idees', emoji: '💡', title: 'Boîte à idées', subtitle: 'Propose tes idées' },
  { to: '/messagerie', emoji: '💬', title: 'Parler au délégué', subtitle: 'Envoie un message' },
  { to: '/sondages', emoji: '🗳️', title: 'Sondages', subtitle: 'Vote et résultats' },
  { to: '/calendrier', emoji: '📅', title: 'Calendrier', subtitle: 'Événements à venir' },
  { to: '/ressources', emoji: '📚', title: 'Ressources', subtitle: 'Supports et liens' },
  { to: '/projets', emoji: '🚀', title: 'Projets', subtitle: 'Projets de classe' },
];

export default function Home() {
  const { settings } = useSettings();
  const [latestAnnouncement, setLatestAnnouncement] = useState<Announcement | null>(null);
  const [nextEvent, setNextEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getAnnouncements().catch(() => [] as Announcement[]),
      api.getEvents().catch(() => [] as Event[]),
    ])
      .then(([announcements, events]) => {
        const published = announcements
          .filter((a) => a.published)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        if (published.length > 0) setLatestAnnouncement(published[0]);

        const now = new Date();
        const upcoming = events
          .filter((e) => new Date(e.date) >= now)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        if (upcoming.length > 0) setNextEvent(upcoming[0]);
      })
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          {settings?.class_name || 'Seconde'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          La plateforme de notre classe
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 capitalize">{today}</p>
      </div>

      {(latestAnnouncement || nextEvent) && !loading && (
        <div className="glass-card mb-6 animate-slideUp">
          <div className="space-y-3">
            {nextEvent && (
              <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0">📅</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Prochain événement
                  </p>
                  <p className="text-sm font-semibold truncate">{nextEvent.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(nextEvent.date)}
                    {nextEvent.time ? ` à ${nextEvent.time}` : ''}
                  </p>
                </div>
              </div>
            )}
            {latestAnnouncement && (
              <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0">📢</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Dernière annonce
                  </p>
                  <p className="text-sm font-semibold truncate">{latestAnnouncement.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {getRelativeTime(latestAnnouncement.created_at)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card animate-pulse">
              <div className="h-8 w-8 rounded-lg bg-gray-200 dark:bg-gray-700 mb-3" />
              <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700 mb-2" />
              <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CARDS.map((card, index) => (
            <Link
              key={card.to}
              to={card.to}
              className="glass-card flex items-center gap-4 no-underline text-inherit hover:scale-[1.02] active:scale-[0.98]"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <span className="text-3xl flex-shrink-0">{card.emoji}</span>
              <div className="min-w-0">
                <h3 className="font-bold text-sm">{card.title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{card.subtitle}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
