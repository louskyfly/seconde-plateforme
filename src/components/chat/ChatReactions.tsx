import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { ChatReaction } from '@/types';

const REACTIONS: { key: ChatReaction; emoji: string; label: string }[] = [
  { key: 'pouce', emoji: '👍', label: 'J’aime' },
  { key: 'rire', emoji: '😂', label: 'Drôle' },
  { key: 'coeur', emoji: '❤️', label: 'J’adore' },
];

/** Appui long 500 ms, la valeur classique sur mobile. */
export const LONG_PRESS_MS = 500;

/**
 * Réactions rapides sur un message du chat.
 *
 * Deux ways d'y accéder, comme demandé : un appui long sur la bulle ouvre le
 * sélecteur, et un petit bouton permanent l'ouvre aussi. Réservé aux élèves :
 * le délégué ne dispose que du bouton de suppression.
 */
export function ChatReactions({
  messageId,
  fingerprint,
  initial,
  onChange,
  open,
  onOpenChange,
}: {
  messageId: number;
  fingerprint: string | null;
  initial: Record<string, { total: number; mine: boolean }>;
  onChange: (messageId: number, counts: Record<string, { total: number; mine: boolean }>) => void;
  /** Ouvert depuis l'appui long sur la bulle, ou via le petit bouton. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Un clic ailleurs referme le sélecteur.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, onOpenChange]);

  const toggle = useCallback(
    async (reaction: ChatReaction) => {
      if (!fingerprint || busy) return;
      setBusy(reaction);
      try {
        const res = await api.toggleChatReaction(messageId, reaction, fingerprint);
        onChange(messageId, res.counts);
      } catch {
        // Le sélecteur se referme quand même : inutile de bloquer l'écran si
        // l'API ne répond pas.
      } finally {
        setBusy(null);
        onOpenChange(false);
      }
    },
    [busy, fingerprint, messageId, onChange, onOpenChange]
  );

  const total = REACTIONS.reduce((sum, r) => sum + (initial[r.key]?.total || 0), 0);

  return (
    <div ref={wrapRef} className="relative mt-1 select-none">
      {total > 0 && (
        <div className="flex flex-wrap gap-1 mb-0.5">
          {REACTIONS.filter((r) => (initial[r.key]?.total || 0) > 0).map((r) => (
            <button
              key={r.key}
              type="button"
              title={r.label}
              onClick={() => toggle(r.key)}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                initial[r.key]?.mine
                  ? 'bg-indigo-500 text-white'
                  : 'bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300'
              }`}
            >
              <span>{r.emoji}</span>
              <span>{initial[r.key].total}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-label="Réagir à ce message"
          aria-expanded={open}
          className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
            total > 0
              ? 'text-white/60 hover:text-white hover:bg-white/10'
              : 'text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400'
          }`}
        >
          ☺+
        </button>

        {open && (
          <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 px-1 py-0.5 rounded-full glass shadow-lg z-10">
            {REACTIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                title={r.label}
                disabled={busy !== null}
                onClick={() => toggle(r.key)}
                className={`px-1.5 py-0.5 rounded-full text-sm transition-transform hover:scale-125 ${
                  initial[r.key]?.mine ? 'bg-indigo-500/20 ring-1 ring-indigo-400' : ''
                }`}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
