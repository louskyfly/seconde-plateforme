import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useSettings } from '@/hooks/useSettings';
import { usePendingPolls } from '@/hooks/usePendingPolls';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { normalizeSeasonTheme, type SeasonTheme } from '@/lib/season';
import {
  formatDate,
  generateFingerprint,
  getRelativeTime,
  parseServerDate,
  CATEGORIES_IDEA,
  PROJECT_STATUSES,
} from '@/lib/utils';
import type { Announcement, Idea, Poll, Event, Resource, Project } from '@/types';

const SEASON_GREETING: Record<SeasonTheme, string> = {
  aucun: '',
  halloween: '🎃 Joyeux Halloween à toute la classe !',
  noel: '🎄 Joyeuses fêtes de fin d’année !',
};

interface BubbleProps {
  to: string;
  emoji: string;
  title: string;
  meta?: string;
}

function Bubble({ to, emoji, title, meta }: BubbleProps) {
  return (
    <Link
      to={to}
      className="glass group flex aspect-square flex-col items-center justify-center gap-1.5 rounded-full px-2 text-center no-underline text-inherit active:scale-95 transition-transform duration-200"
    >
      <span className="flex h-11 w-11 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-indigo-500/10 text-2xl sm:text-3xl transition-colors duration-200 group-hover:bg-indigo-500/20">
        {emoji}
      </span>
      <span className="text-[11px] sm:text-xs font-bold leading-tight">{title}</span>
      {meta && (
        <span className="w-full truncate text-[10px] leading-none text-gray-400 dark:text-gray-500">
          {meta}
        </span>
      )}
    </Link>
  );
}

function FeaturedBubble({
  to,
  emoji,
  title,
  meta,
  content,
  empty,
}: BubbleProps & { content: string; empty: string }) {
  const hasContent = content.trim().length > 0;
  return (
    <Link
      to={to}
      className="glass group mt-3 flex items-center gap-3 rounded-full px-4 py-3 sm:px-6 sm:py-4 no-underline text-inherit active:scale-[0.98] transition-transform duration-200"
    >
      <span className="flex h-11 w-11 sm:h-14 sm:w-14 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-2xl sm:text-3xl transition-colors duration-200 group-hover:bg-indigo-500/20">
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold">{title}</h3>
        <p
          className={`truncate text-xs ${
            hasContent ? 'text-gray-600 dark:text-gray-300' : 'italic text-gray-400 dark:text-gray-500'
          }`}
        >
          {hasContent ? content : empty}
        </p>
      </div>
      <div className="hidden sm:block text-right">
        {meta && <span className="text-[10px] text-gray-400 dark:text-gray-500">{meta}</span>}
      </div>
      <span className="text-gray-400 transition-transform duration-200 group-hover:translate-x-1">
        →
      </span>
    </Link>
  );
}

export default function Home() {
  const { settings } = useSettings();
  const season = normalizeSeasonTheme(settings?.season_theme);
  const pendingPolls = usePendingPolls();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(!navigator.onLine);
  const [latestAnnouncement, setLatestAnnouncement] = useState<Announcement | null>(null);
  const [nextEvent, setNextEvent] = useState<Event | null>(null);
  const [latestIdea, setLatestIdea] = useState<Idea | null>(null);
  const [activePoll, setActivePoll] = useState<Poll | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [latestProject, setLatestProject] = useState<Project | null>(null);
  const cancelled = useRef(false);

  // Une seule fonction de chargement, réutilisée au montage, au retour sur
  // l'application et par le bouton « Réessayer » : avant, l'accueil ne se
  // rafraîchissait jamais et une coupure réseau affichait des bulles vides.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [announcements, events, ideas, polls, resourcesList, projects] = await Promise.all([
        api.getAnnouncements(),
        api.getEvents(),
        api.getIdeas(),
        api.getPolls(generateFingerprint()),
        api.getResources(),
        api.getProjects(),
      ]);
      if (!cancelled.current) setOffline(false);

      const published = announcements
        .filter((a) => a.published)
        .sort((a, b) => parseServerDate(b.created_at).getTime() - parseServerDate(a.created_at).getTime());
      setLatestAnnouncement(published[0] ?? null);

      // parseServerDate : une date seule ("2026-09-27") vaut minuit local.
      // new Date("2026-09-27") valait minuit UTC, soit 2 h à Paris : les
      // événements du jour passaient pour terminés.
      const now = new Date();
      const upcoming = events
        .filter((e) => parseServerDate(e.date).getTime() >= now.getTime() - 60_000)
        .sort((a, b) => parseServerDate(a.date).getTime() - parseServerDate(b.date).getTime());
      setNextEvent(upcoming[0] ?? null);

      const ideasSorted = [...ideas].sort(
        (a, b) => parseServerDate(b.created_at).getTime() - parseServerDate(a.created_at).getTime()
      );
      setLatestIdea(ideasSorted[0] ?? null);

      setActivePoll(
        polls
          .filter((p) => p.active === 1)
          .sort((a, b) => parseServerDate(b.created_at).getTime() - parseServerDate(a.created_at).getTime())[0] ??
          null
      );

      setResources(resourcesList);

      const projectsSorted = [...projects].sort(
        (a, b) => parseServerDate(b.created_at).getTime() - parseServerDate(a.created_at).getTime()
      );
      setLatestProject(projectsSorted[0] ?? null);
    } catch (err: any) {
      setOffline(!navigator.onLine);
      setError(err?.message || 'Impossible de charger la classe');
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelled.current = false;
    load();

    const onOnline = () => {
      setOffline(false);
      load(true);
    };
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      cancelled.current = true;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [load]);

  // Rafraîchit quand l'élève revient sur l'application (onglet ouvert en
  // arrière-plan) : une annonce publiée entre-temps devient visible.
  useAutoRefresh(() => load(true));

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="animate-fadeIn">
      <header className="mb-5">
        <h1 className="gradient-text-night text-2xl font-bold">
          {settings?.class_name || 'Seconde'}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">La plateforme de notre classe</p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 capitalize">{today}</p>
        {season !== 'aucun' && (
          <p className="season-greeting mt-2 text-sm font-semibold">{SEASON_GREETING[season]}</p>
        )}
      </header>

      {settings?.home_image && (
        <div className="mb-4 overflow-hidden rounded-3xl glass animate-slideUp">
          <img
            src={settings.home_image}
            alt=""
            className="w-full max-h-64 object-cover"
          />
        </div>
      )}

      {settings?.home_info && (
        <div className="glass-card mb-4 animate-slideUp">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Le mot du délégué
          </p>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
            {settings.home_info}
          </p>
        </div>
      )}

      {(error || offline) && (
        <div className="glass-card mb-4 flex items-center gap-3 border-amber-500/40">
          <span className="text-xl" aria-hidden="true">
            {offline ? '📡' : '⚠️'}
          </span>
          <p className="text-xs text-gray-600 dark:text-gray-300 flex-1">
            {offline
              ? 'Pas de connexion : les dernières infos sont peut-être obsolètes.'
              : error || 'Chargement impossible.'}
          </p>
          <button onClick={() => load()} className="glass-button text-xs px-4 py-2 shrink-0">
            Réessayer
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="glass aspect-square rounded-full animate-pulse flex flex-col items-center justify-center gap-2"
            >
              <div className="h-11 w-11 sm:h-14 sm:w-14 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-4">
            <Bubble
              to="/sondages"
              emoji="🗳️"
              title="Sondages"
              meta={
                pendingPolls > 0
                  ? `${pendingPolls} à répondre`
                  : activePoll
                  ? `${activePoll.total_voters ?? 0} réponse(s)`
                  : ''
              }
            />
            <Bubble
              to="/calendrier"
              emoji="📅"
              title="Agenda"
              meta={nextEvent ? formatDate(nextEvent.date) : ''}
            />
            <Bubble
              to="/idees"
              emoji="💡"
              title="Idées"
              meta={latestIdea ? CATEGORIES_IDEA[latestIdea.category] : ''}
            />
            <Bubble
              to="/ressources"
              emoji="📚"
              title="Ressources"
              meta={resources.length > 0 ? `${resources.length}` : ''}
            />
            <Bubble
              to="/projets"
              emoji="🚀"
              title="Projets"
              meta={
                latestProject && PROJECT_STATUSES[latestProject.status]
                  ? PROJECT_STATUSES[latestProject.status].label
                  : ''
              }
            />
          </div>

          <FeaturedBubble
            to="/informations"
            emoji="📢"
            title="Informations"
            meta={latestAnnouncement ? getRelativeTime(latestAnnouncement.created_at) : ''}
            content={latestAnnouncement ? latestAnnouncement.title : ''}
            empty="Aucune annonce publiée pour le moment"
          />

          <Link
            to="/messagerie"
            className="glass group mt-3 flex items-center gap-3 rounded-full px-4 py-3 sm:px-6 sm:py-4 no-underline text-inherit active:scale-[0.98] transition-transform duration-200"
          >
            <span className="flex h-11 w-11 sm:h-14 sm:w-14 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500 text-2xl shadow-lg shadow-indigo-500/30">
              💬
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold">Parler au délégué</h3>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                Envoie un message en toute confidentialité
              </p>
            </div>
            <span className="text-gray-400 transition-transform duration-200 group-hover:translate-x-1">
              →
            </span>
          </Link>
        </>
      )}
    </div>
  );
}