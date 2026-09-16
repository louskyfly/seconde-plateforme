import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useSettings } from '@/hooks/useSettings';
import { formatDate, getRelativeTime, CATEGORIES_IDEA, PROJECT_STATUSES } from '@/lib/utils';
import type { Announcement, Idea, Poll, Event, Resource, Project } from '@/types';

interface WidgetProps {
  to: string;
  emoji: string;
  title: string;
  meta?: string;
  content: string;
  empty: string;
  className?: string;
}

function Widget({ to, emoji, title, meta, content, empty, className = '' }: WidgetProps) {
  const hasContent = content.trim().length > 0;
  return (
    <Link
      to={to}
      className={`glass-card group flex flex-col gap-3 no-underline text-inherit active:scale-[0.98] ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-xl transition-colors duration-200 group-hover:bg-indigo-500/20">
          {emoji}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold leading-tight">{title}</h3>
          {meta && (
            <p className="mt-0.5 text-[11px] font-medium text-gray-400 dark:text-gray-500">
              {meta}
            </p>
          )}
        </div>
      </div>
      <p
        className={`line-clamp-2 flex-1 text-xs leading-relaxed ${
          hasContent
            ? 'text-gray-600 dark:text-gray-300'
            : 'italic text-gray-400 dark:text-gray-500'
        }`}
      >
        {hasContent ? content : empty}
      </p>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 transition-transform duration-200 group-hover:translate-x-0.5">
        Ouvrir <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}

export default function Home() {
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [latestAnnouncement, setLatestAnnouncement] = useState<Announcement | null>(null);
  const [nextEvent, setNextEvent] = useState<Event | null>(null);
  const [latestIdea, setLatestIdea] = useState<Idea | null>(null);
  const [activePoll, setActivePoll] = useState<Poll | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [latestProject, setLatestProject] = useState<Project | null>(null);

  useEffect(() => {
    Promise.all([
      api.getAnnouncements().catch(() => [] as Announcement[]),
      api.getEvents().catch(() => [] as Event[]),
      api.getIdeas().catch(() => [] as Idea[]),
      api.getPolls().catch(() => [] as Poll[]),
      api.getResources().catch(() => [] as Resource[]),
      api.getProjects().catch(() => [] as Project[]),
    ])
      .then(([announcements, events, ideas, polls, resources, projects]) => {
        const published = announcements
          .filter((a) => a.published)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        if (published.length > 0) setLatestAnnouncement(published[0]);

        const now = new Date();
        const upcoming = events
          .filter((e) => new Date(e.date) >= now)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        if (upcoming.length > 0) setNextEvent(upcoming[0]);

        const ideasSorted = [...ideas].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        if (ideasSorted.length > 0) setLatestIdea(ideasSorted[0]);

        const active =
          polls
            .filter((p) => p.active === 1)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ??
          null;
        setActivePoll(active);

        setResources(resources);

        const projectsSorted = [...projects].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        if (projectsSorted.length > 0) setLatestProject(projectsSorted[0]);
      })
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="animate-fadeIn">
      <header className="mb-6">
        <h1 className="gradient-text-night text-2xl font-bold">
          {settings?.class_name || 'Seconde'}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          La plateforme de notre classe
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 capitalize">{today}</p>
      </header>

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

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-card animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-2xl bg-gray-200 dark:bg-gray-700" />
                <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-700 mb-2" />
              <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Widget
              to="/informations"
              emoji="📢"
              title="Informations"
              meta={latestAnnouncement ? getRelativeTime(latestAnnouncement.created_at) : ''}
              content={latestAnnouncement ? latestAnnouncement.title : ''}
              empty="Aucune annonce publiée pour le moment"
              className="sm:col-span-2"
            />
            <Widget
              to="/sondages"
              emoji="🗳️"
              title="Sondages"
              meta={activePoll ? `${activePoll.total_votes ?? 0} vote(s)` : ''}
              content={activePoll ? activePoll.question : ''}
              empty="Aucun sondage en cours"
            />
            <Widget
              to="/calendrier"
              emoji="📅"
              title="Agenda"
              meta={nextEvent?.time ?? ''}
              content={nextEvent ? `${nextEvent.title} · ${formatDate(nextEvent.date)}` : ''}
              empty="Aucun événement prévu"
            />
            <Widget
              to="/idees"
              emoji="💡"
              title="Boîte à idées"
              meta={latestIdea ? CATEGORIES_IDEA[latestIdea.category] : ''}
              content={latestIdea ? latestIdea.title : ''}
              empty="Propose une idée pour la classe"
            />
            <Widget
              to="/ressources"
              emoji="📚"
              title="Ressources"
              meta={resources.length > 0 ? `${resources.length} ressource(s)` : ''}
              content={resources.length > 0 ? resources[0].title : ''}
              empty="Aucune ressource partagée"
            />
            <Widget
              to="/projets"
              emoji="🚀"
              title="Projets"
              meta={
                latestProject && PROJECT_STATUSES[latestProject.status]
                  ? PROJECT_STATUSES[latestProject.status].label
                  : ''
              }
              content={latestProject ? latestProject.name : ''}
              empty="Aucun projet en cours"
            />
          </div>

          <Link
            to="/messagerie"
            className="glass-card group mt-3 flex items-center gap-4 no-underline text-inherit active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-500 text-2xl shadow-lg shadow-indigo-500/30">
              💬
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold">Parler au délégué</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
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