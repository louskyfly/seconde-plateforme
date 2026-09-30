import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { fileToDataUri } from '@/lib/image';
import { cleanFirstName, getRelativeTime, isValidFirstName, setAppBadge, setFirstName } from '@/lib/utils';
import { ChatReactions, LONG_PRESS_MS } from './ChatReactions';
import type { ChatConversation, ChatMessage, ChatUser } from '@/types';

const POLL_MS = 3000;
const MAX_IMAGE_INPUT_BYTES = 12 * 1024 * 1024;

interface ChatViewProps {
  /** null pour le délégué (identifié par sa session) */
  fingerprint: string | null;
  isAdmin: boolean;
}

/**
 * Chat de classe : un groupe unique, membres vérifiés côté serveur.
 * Le délégué peut supprimer n'importe quel message ou photo, l'élève seulement les siens.
 */
export function ChatView({ fingerprint, isAdmin }: ChatViewProps) {
  const [user, setUser] = useState<ChatUser | null>(null);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsProfile, setNeedsProfile] = useState(false);
  const [pseudo, setPseudo] = useState('');
  const [joining, setJoining] = useState(false);
  const [content, setContent] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
const [uploading, setUploading] = useState(false);
const [newCount, setNewCount] = useState(0);

  /** Sélecteur de réactions ouvert, par identifiant de message. */
  const [reactionFor, setReactionFor] = useState<number | null>(null);
  const longPressTimer = useRef<number | null>(null);

  /** Les réactions sont réservées aux élèves : le délégué répond, il ne réagit pas. */
  const canReact = !isAdmin && user?.kind === 'student' && !!fingerprint;

  const cancelLongPress = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
  };

  const startLongPress = (messageId: number) => {
    cancelLongPress();
    longPressTimer.current = window.setTimeout(() => setReactionFor(messageId), LONG_PRESS_MS);
  };

  /** Met à jour les compteurs d'un seul message, sans recharger tout le fil. */
  const applyReactionCounts = (messageId: number, counts: Record<string, { total: number; mine: boolean }>) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: counts } : m)));
  };

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const stickToBottom = useRef(true);
  /**
   * Dernier id connu, tenu dans une ref : le rafraîchissement ne dépend ainsi
   * plus du tableau `messages` (avant, la fonction était figée au premier rendu
   * et le bouton « Actualiser » pouvait être nécessaire pour voir les messages).
   */
  const lastIdRef = useRef(0);

  useEffect(() => {
    lastIdRef.current = messages.length ? messages[messages.length - 1].id : 0;
  }, [messages]);

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
  }, []);

  const handleScroll = () => {
    const el = bottomRef.current?.parentElement;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (stickToBottom.current) setNewCount(0);
  };

  /* Chargement initial : conversation + profil */
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api
      .getChatConversation(fingerprint || undefined)
      .then((data) => {
        if (!mounted) return;
        setConversation(data.conversation);
        setUser(data.user);
        setNeedsProfile(!data.user);
      })
      .catch(() => mounted && setError('Impossible de charger le chat'))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [fingerprint]);

  /* Rafraîchissement des nouveaux messages + réactions */
  const refresh = useCallback(
    async (silent = true) => {
      if (!conversation) return;
      const after = lastIdRef.current;
      try {
        const data = await api.getChatMessages(fingerprint, conversation.id, after);
        if (data.messages.length === 0 && !data.reaction_updates) {
          if (!silent) setError('');
          return;
        }
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          const fresh = data.messages.filter((m) => !known.has(m.id));
          if (fresh.length && prev.length && !stickToBottom.current) setNewCount((c) => c + fresh.length);
          return [...prev, ...fresh];
        });
        // Appliquer les mises à jour de réaction pour les messages déjà connus.
        if (data.reaction_updates) {
          setMessages((prev) =>
            prev.map((m) => {
              const upd = data.reaction_updates![m.id];
              if (!upd) return m;
              return { ...m, reactions: upd };
            })
          );
        }
        if (!silent) setError('');
      } catch (err: any) {
        if (err?.message === 'Profil inconnu') setNeedsProfile(true);
      }
    },
    [conversation, fingerprint]
  );

  useEffect(() => {
    if (!conversation || needsProfile) return;
    let mounted = true;

    const load = async () => {
      try {
        const data = await api.getChatMessages(fingerprint, conversation.id, 0);
        if (!mounted) return;
        setMessages(data.messages);
        stickToBottom.current = true;
        requestAnimationFrame(() => scrollToBottom());
      } catch (err: any) {
        if (mounted && err?.message === 'Profil inconnu') setNeedsProfile(true);
      }
    };

    load();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [conversation, needsProfile, fingerprint, refresh, scrollToBottom]);

  /* Marquer comme lu quand la page est visible, et RAFRAICHIR dès que
     l'utilisateur revient sur l'application (plus besoin de « Actualiser ») */
  useEffect(() => {
    if (!conversation || needsProfile) return;
    const mark = () => {
      if (document.visibilityState === 'visible') {
        api.markChatRead(conversation.id, fingerprint || undefined).catch(() => {});
        setNewCount(0);
        setAppBadge(0);
        refresh();
      }
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    window.addEventListener('focus', mark);
    return () => {
      document.removeEventListener('visibilitychange', mark);
      window.removeEventListener('focus', mark);
    };
  }, [conversation, needsProfile, fingerprint, messages.length, refresh]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fingerprint) return;
    // Le chat affiche un prénom, jamais un nom complet : « Jean Dupont » est
    // refusé, seul le premier mot est conservé.
    const firstName = cleanFirstName(pseudo);
    if (!isValidFirstName(firstName)) {
      setError('Écris un seul prénom, sans nom de famille.');
      return;
    }
    setJoining(true);
    setError('');
    try {
      // Le prénom est mémorisé : inutile de le redemander pour les idées ou
      // les messages au délégué.
      setFirstName(firstName);
      const data = await api.joinChat(fingerprint, firstName);
      setUser(data.user);
      setConversation(data.conversation);
      setNeedsProfile(false);
    } catch (err: any) {
      setError(err.message || 'Impossible de rejoindre le chat');
    } finally {
      setJoining(false);
    }
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Seules les images sont acceptées dans le chat');
      return;
    }
    if (file.size > MAX_IMAGE_INPUT_BYTES) {
      setError('Image trop volumineuse');
      return;
    }
    setUploading(true);
    setError('');
    try {
      setPendingImage(await fileToDataUri(file));
    } catch {
      setError('Image illisible');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conversation || sending || (!content.trim() && !pendingImage)) return;
    setSending(true);
    setError('');
    try {
      const data = await api.sendChatMessage({
        content: content.trim(),
        image: pendingImage,
        conversation_id: conversation.id,
        fingerprint: fingerprint || undefined,
      });
      setMessages((prev) => [...prev, data.message]);
      setContent('');
      setPendingImage(null);
      stickToBottom.current = true;
      setNewCount(0);
      requestAnimationFrame(() => scrollToBottom(true));
      // Reconcilie avec le serveur (horodatage officiel) et récupère les
      // messages venus entre-temps : l'affichage se met à jour tout seul.
      refresh();
      api.markChatRead(conversation.id, fingerprint || undefined).catch(() => {});
      setAppBadge(0);
    } catch (err: any) {
      setError(err.message || 'Message non envoyé');
    } finally {
      setSending(false);
    }
  };

  const remove = async (message: ChatMessage) => {
    const who = message.sender_name;
    const ok = window.confirm(
      isAdmin
        ? `Supprimer définitivement le message de ${who} ?\n(texte et photo éventuelle)`
        : 'Supprimer ton message ?'
    );
    if (!ok) return;
    try {
      await api.deleteChatMessage(message.id, fingerprint || undefined);
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
    } catch (err: any) {
      setError(err.message || 'Suppression impossible');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-[3px] border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (needsProfile && !isAdmin) {
    return (
      <div className="max-w-md mx-auto animate-fadeIn">
        <div className="glass-card text-center py-8 px-6">
          <p className="text-3xl mb-3">💬</p>
          <h2 className="font-bold mb-1">Rejoindre le chat de classe</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
            Choisis ton prénom : c'est le seul nom visible par la classe. Ni nom de famille, ni
            email.
          </p>
          <form onSubmit={join} className="space-y-3">
            <input
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              onKeyDown={(e) => {
                // Collé depuis une autre source, un prénom peut contenir des
                // espaces ou des chiffres : on nettoie avant l'enregistrement.
                if (e.key === 'Enter') setPseudo(cleanFirstName(pseudo));
              }}
              onPaste={(e) => {
                e.preventDefault();
                setPseudo(cleanFirstName(e.clipboardData.getData('text')));
              }}
              maxLength={30}
              placeholder="Ton prénom"
              className="w-full px-4 py-2.5 rounded-xl glass text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
              autoComplete="given-name"
              autoFocus
            />
            <button type="submit" disabled={joining || pseudo.trim().length < 2} className="glass-button-primary w-full py-2.5 text-sm">
              {joining ? 'Connexion...' : 'Rejoindre'}
            </button>
          </form>
          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn flex flex-col" style={{ height: 'calc(100dvh - 190px)' }}>
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold">{conversation?.title || 'Chat de classe'}</h1>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {isAdmin ? 'Tu es le délégué · tu peux modérer tous les messages' : `Connecté en tant que ${user?.display_name}`}
          </p>
        </div>
        <button onClick={() => refresh(false)} className="glass-button text-xs px-3 py-1.5">
          Actualiser
        </button>
      </div>

      {error && (
        <div className="glass-card border-red-300/40 text-red-600 dark:text-red-400 text-xs py-2 px-3 mb-2 flex-shrink-0">
          {error}
        </div>
      )}

      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2 pr-1"
        onScroll={handleScroll}
      >
        {messages.length === 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-10">
            Aucun message pour l'instant. Sois le premier à écrire !
          </p>
        )}

        {messages.map((m) => {
          const mine = user?.id === m.sender_id;
          const delegateMsg = m.sender_kind === 'delegate';
          const canDelete = isAdmin || mine;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] sm:max-w-[70%] px-3 py-2 rounded-2xl text-sm shadow-sm ${
                  mine
                    ? 'bg-indigo-500 text-white rounded-br-md'
                    : delegateMsg
                      ? 'bg-amber-500/15 dark:bg-amber-500/10 border border-amber-500/30 rounded-bl-md'
                      : 'glass rounded-bl-md'
                }`}
                onTouchStart={canReact ? () => startLongPress(m.id) : undefined}
                onTouchEnd={canReact ? () => cancelLongPress() : undefined}
                onTouchMove={canReact ? () => cancelLongPress() : undefined}
                onTouchCancel={canReact ? () => cancelLongPress() : undefined}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  {!mine && (
                    <span className={`text-[10px] font-bold ${delegateMsg ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-500 dark:text-indigo-400'}`}>
                      {m.sender_name}
                      {delegateMsg ? ' · délégué' : ''}
                    </span>
                  )}
                  <span className={`text-[10px] ${mine ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'}`}>
                    {getRelativeTime(m.created_at)}
                  </span>
                </div>

                {m.has_image === 1 && (
                  <img
                    src={api.chatImageUrl(m.id, fingerprint)}
                    alt="Photo envoyée"
                    loading="lazy"
                    className="rounded-xl max-h-64 w-full object-cover my-1 cursor-zoom-in"
                    onClick={() => window.open(api.chatImageUrl(m.id, fingerprint), '_blank', 'noopener')}
                  />
                )}

                {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}

                {canReact && (
                  <ChatReactions
                    messageId={m.id}
                    fingerprint={fingerprint}
                    initial={m.reactions || {}}
                    onChange={applyReactionCounts}
                    open={reactionFor === m.id}
                    onOpenChange={(isOpen) => setReactionFor(isOpen ? m.id : null)}
                  />
                )}

                {canDelete && (
                  <button
                    onClick={() => remove(m)}
                    className={`mt-1 text-[10px] underline ${mine ? 'text-white/70' : 'text-red-400'}`}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {newCount > 0 && (
        <button
          onClick={() => {
            stickToBottom.current = true;
            setNewCount(0);
            scrollToBottom(true);
          }}
          className="glass-button-primary text-xs py-1.5 mx-auto mb-2 flex-shrink-0"
        >
          {newCount} nouveau{newCount > 1 ? 'x' : ''} message{newCount > 1 ? 's' : ''} ↓
        </button>
      )}

      {pendingImage && (
        <div className="flex items-center gap-3 mb-2 flex-shrink-0">
          <img src={pendingImage} alt="" className="w-14 h-14 rounded-xl object-cover" />
          <button
            onClick={() => setPendingImage(null)}
            className="text-xs text-gray-500 dark:text-gray-400 underline"
          >
            Retirer la photo
          </button>
        </div>
      )}

      <form onSubmit={send} className="flex items-end gap-2 flex-shrink-0">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="glass-button px-3 py-2.5 flex-shrink-0"
          title="Envoyer une photo"
        >
          {uploading ? '…' : '📷'}
        </button>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(e as unknown as React.FormEvent);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Écris un message..."
          className="flex-1 resize-none px-4 py-2.5 rounded-2xl glass text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 max-h-32"
        />
        <button
          type="submit"
          disabled={sending || (!content.trim() && !pendingImage)}
          className="glass-button-primary px-4 py-2.5 flex-shrink-0 text-sm"
        >
          {sending ? '…' : 'Envoyer'}
        </button>
      </form>
    </div>
  );
}

export default ChatView;
