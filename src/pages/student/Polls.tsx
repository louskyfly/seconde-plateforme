import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { generateFingerprint } from '@/lib/utils';
import type { Poll } from '@/types';

export default function Polls() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number[]>>({});
  const [votedPolls, setVotedPolls] = useState<Set<number>>(new Set());
  const [voting, setVoting] = useState<number | null>(null);

  useEffect(() => {
    api
      .getPolls()
      .then((data) => {
        const sorted = data.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setPolls(sorted);

        const voted = new Set<number>();
        sorted.forEach((p) => {
          if (!p.active) voted.add(p.id);
        });
        setVotedPolls(voted);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleOption = useCallback((pollId: number, optionId: number, allowMultiple: boolean) => {
    setSelectedOptions((prev) => {
      const current = prev[pollId] || [];
      if (allowMultiple) {
        const updated = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
        return { ...prev, [pollId]: updated };
      }
      return { ...prev, [pollId]: [optionId] };
    });
  }, []);

  const submitVote = useCallback(async (poll: Poll) => {
    const options = selectedOptions[poll.id];
    if (!options || options.length === 0) return;
    setVoting(poll.id);
    try {
      await api.votePoll(poll.id, options, generateFingerprint());
      setVotedPolls((prev) => new Set(prev).add(poll.id));
      setPolls((prev) =>
        prev.map((p) => {
          if (p.id !== poll.id) return p;
          const updatedOptions = p.options?.map((opt) => ({
            ...opt,
            vote_count: options.includes(opt.id) ? (opt.vote_count || 0) + 1 : opt.vote_count,
          }));
          return {
            ...p,
            active: 0,
            show_results: 1,
            options: updatedOptions,
            total_votes: (p.total_votes || 0) + 1,
          };
        })
      );
    } catch {
    } finally {
      setVoting(null);
    }
  }, [selectedOptions]);

  const activePolls = polls.filter((p) => p.active);
  const closedPolls = polls.filter((p) => !p.active);

  const renderPoll = (poll: Poll, isClosed: boolean) => {
    const options = poll.options || [];
    const total = options.reduce((sum, o) => sum + (o.vote_count || 0), 0);
    const showResults = isClosed || votedPolls.has(poll.id) || poll.show_results === 1;
    const selected = selectedOptions[poll.id] || [];
    const canVote = poll.active && !votedPolls.has(poll.id);

    return (
      <div key={poll.id} className="glass-card">
        <h3 className="font-bold text-sm mb-3">{poll.question}</h3>

        <div className="space-y-2">
          {options.map((opt) => {
            const pct = total > 0 ? Math.round(((opt.vote_count || 0) / total) * 100) : 0;
            const isSelected = selected.includes(opt.id);

            if (showResults) {
              return (
                <div key={opt.id} className="relative rounded-xl overflow-hidden">
                  <div
                    className="absolute inset-0 bg-indigo-400/20 dark:bg-indigo-500/20 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex items-center justify-between px-3 py-2.5">
                    <span className="text-xs font-medium">{opt.text}</span>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <button
                key={opt.id}
                onClick={() => toggleOption(poll.id, opt.id, poll.allow_multiple === 1)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-500/50'
                    : 'glass hover:bg-gray-100/50 dark:hover:bg-gray-700/30'
                }`}
              >
                {opt.text}
              </button>
            );
          })}
        </div>

        {showResults && (
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2">
            {total} vote{total > 1 ? 's' : ''}
          </p>
        )}

        {canVote && (
          <button
            onClick={() => submitVote(poll)}
            disabled={selected.length === 0 || voting === poll.id}
            className="glass-button-primary w-full mt-3 text-sm disabled:opacity-50"
          >
            {voting === poll.id ? 'Envoi...' : 'Voter'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="animate-fadeIn">
      <h1 className="text-2xl font-bold mb-5">Sondages</h1>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="glass-card animate-pulse">
              <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700 mb-3" />
              <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-700 mb-2" />
              <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      )}

      {!loading && activePolls.length === 0 && closedPolls.length === 0 && (
        <div className="glass-card text-center py-10">
          <p className="text-3xl mb-3">🗳️</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Aucun sondage pour le moment
          </p>
        </div>
      )}

      {!loading && activePolls.length > 0 && (
        <div className="space-y-3 mb-6">
          <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            En cours
          </h2>
          {activePolls.map((poll) => renderPoll(poll, false))}
        </div>
      )}

      {!loading && closedPolls.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Terminés
          </h2>
          {closedPolls.map((poll) => renderPoll(poll, true))}
        </div>
      )}
    </div>
  );
}
