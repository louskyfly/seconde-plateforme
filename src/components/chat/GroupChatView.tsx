import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { fileToDataUri } from '@/lib/image';
import { getRelativeTime } from '@/lib/utils';
import type { ChatConversation, ChatMessage } from '@/types';

const POLL_MS = 3000;
const MAX_IMAGE_INPUT_BYTES = 12 * 1024 * 1024;

interface GroupChatViewProps {
  fingerprint: string;
  groupId: number;
  groupName: string;
  onBack: () => void;
}

export function GroupChatView({ fingerprint, groupId, groupName, onBack }: GroupChatViewProps) {
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [content, setContent] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [newCount, setNewCount] = useState(0);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const stickToBottom = useRef(true);
  const lastIdRef = useRef(0);
  const [closed, setClosed] = useState(false);

  const applyReactionCounts = (messageId: number, counts: Record<string, { total: number; mine: boolean }>) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: counts } : m)));
  };

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
  }, []);

  const handleScroll = () => {
    const el = bottomRef.current?.parentElement;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (stickToBottom.current) setNewCount(0);
  };

  useEffect(() => {
    lastIdRef.current = messages.length ? messages[messages.length - 1].id : 0;
  }, [messages]);

  /* Chargement initial : conversation */
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api
      .getGroupChat(groupId, fingerprint)
      .then((data) => {
        if (!mounted) return;
        // Adapter GroupChatConversation -> ChatConversation
        const conv: ChatConversation = {
          id: data.conversation.id,
          title: data.conversation.title,
          is_group: 1,
        };
        setConversation(conv);
        setClosed(data.conversation.closed === 1);
      })
      .catch((err: any) => mounted && setError(err.message || 'Impossible de charger le chat'))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [fingerprint, groupId]);

  /* Rafraîchissement des nouveaux messages + réactions */
  const refresh = useCallback(
    async (silent = true) => {
      if (!conversation || closed) return;
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
        // ignore
      }
    },
    [conversation, fingerprint, closed]
  );

  useEffect(() => {
    if (!conversation || closed) return;
    let mounted = true;

    const load = async () => {
      try {
        const data = await api.getChatMessages(fingerprint, conversation.id, 0);
        if (!mounted) return;
        setMessages(data.messages);
        stickToBottom.current = true;
        requestAnimationFrame(() => scrollToBottom());
      } catch {
        // ignore
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
  }, [conversation, fingerprint, refresh, scrollToBottom, closed]);

  useEffect(() => {
    if (!conversation || closed) return;
    const mark = () => {
      if (document.visibilityState === 'visible') {
        api.markChatRead(conversation.id, fingerprint).catch(() => {});
        setNewCount(0);
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
  }, [conversation, fingerprint, refresh, closed]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || closed) return;
    const txt = content.trim();
    const img = pendingImage;
    if (!txt && !img) return;
    setSending(true);
    setContent('');
    setPendingImage(null);
    try {
      await api.sendGroupChatMessage({ groupId, content: txt, image: img, fingerprint });
      refresh(false);
    } catch (err: any) {
      setError(err.message || 'Envoi impossible');
    } finally {
      setSending(false);
    }
  };

  const handleImage = (file: File) => {
    if (file.size > MAX_IMAGE_INPUT_BYTES) {
      setError('Image trop volumineuse (max 12 Mo)');
      return;
    }
    fileToDataUri(file).then((uri) => setPendingImage(uri));
  };

  if (loading) return <div className="flex h-64 items-center justify-center">Chargement…</div>;
  if (error && !conversation) return <div className="text-red-600 p-4">{error}</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] min-h-[400px] glass rounded-2xl overflow-hidden flex-1">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-white/50 dark:bg-gray-900/50">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10">
          ←
        </button>
        <div className="flex-1 text-center">
          <h2 className="font-bold">{groupName}</h2>
          {closed && <span className="text-xs text-red-600 dark:text-red-400 ml-2">🔒 Fermé par le délégué</span>}
        </div>
        <div className="w-10" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" onScroll={handleScroll}>
        {messages.map((m) => (
          <ChatMessageItem
            key={m.id}
            message={m}
            isMine={true}
            canReact={!closed}
            fingerprint={fingerprint}
            onReact={(reaction) => {
              api.toggleChatReaction(m.id, reaction, fingerprint).then((res) => applyReactionCounts(m.id, res.counts));
            }}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* New messages indicator */}
      {newCount > 0 && stickToBottom.current === false && (
        <button
          onClick={() => { stickToBottom.current = true; scrollToBottom(true); setNewCount(0); }}
          className="mx-auto mb-3 px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-full shadow-lg"
        >
          {newCount} nouveau{newCount > 1 ? 'x' : ''} message{newCount > 1 ? 's' : ''}
        </button>
      )}

      {/* Input */}
      {!closed && (
        <form onSubmit={send} className="p-3 border-t bg-white/50 dark:bg-gray-900/50">
          {pendingImage && (
            <div className="relative mb-2">
              <img src={pendingImage} alt="Aperçu" className="max-h-32 rounded-lg" />
              <button
                type="button"
                onClick={() => setPendingImage(null)}
                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <label className="flex items-center p-2 text-2xl hover:bg-black/5 dark:hover:bg-white/10 rounded-lg cursor-pointer">
              📷
              <input type="file" ref={fileRef} accept="image/*" onChange={(e) => e.target.files?.[0] && handleImage(e.target.files[0])} className="hidden" />
            </label>
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={closed ? 'Chat fermé' : 'Message…'}
              disabled={closed || sending}
              className="flex-1 px-3 py-2 bg-white/80 dark:bg-gray-800/80 rounded-full border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={sending || (!content.trim() && !pendingImage) || closed}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-full hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {sending ? '…' : 'Envoyer'}
            </button>
          </div>
        </form>
      )}

      {closed && (
        <div className="px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400 bg-yellow-50 dark:bg-yellow-900/20 border-t">
          Ce chat a été fermé par le délégué. Tu ne peux plus envoyer de messages.
        </div>
      )}
    </div>
  );
}

/* ---- Message item ---- */
function ChatMessageItem({
  message,
  isMine,
  canReact,
  fingerprint,
  onReact,
  onLongPress,
}: {
  message: ChatMessage;
  isMine: boolean;
  canReact: boolean;
  fingerprint: string;
  onReact: (r: 'pouce' | 'rire' | 'coeur') => void;
  onLongPress?: (id: number) => void;
}) {
  const reactions = message.reactions || {};
  const myReactions = Object.entries(reactions).filter(([, v]) => v.mine).map(([k]) => k);

  return (
    <div
      className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}
      onContextMenu={(e) => { e.preventDefault(); onLongPress?.(message.id); }}
    >
      {!isMine && <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-300 flex-shrink-0">
        {message.sender_name?.charAt(0)?.toUpperCase() || '?'}
      </div>}
      <div className={`max-w-[70%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`px-3 py-2 rounded-2xl ${isMine ? 'bg-indigo-500 text-white rounded-tr-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-sm'}`}>
          {!isMine && <p className="text-xs font-medium mb-0.5 opacity-70">{message.sender_name}</p>}
          <p className="whitespace-pre-wrap break-words">{message.content || (message.has_image ? '📷 Photo' : '')}</p>
          {message.has_image && (
            <img src={`/api/chat/messages/${message.id}/image${fingerprint ? `?fingerprint=${fingerprint}` : ''}`} alt="Photo" className="mt-1 max-h-48 rounded-lg" />
          )}
        </div>
        {canReact && (
          <div className="flex gap-1 mt-1">
            {(['pouce', 'rire', 'coeur'] as const).map((r) => {
              const cnt = reactions[r]?.total || 0;
              const mine = myReactions.includes(r);
              const emoji = r === 'pouce' ? '👍' : r === 'rire' ? '😂' : '❤️';
              return (
                <button
                  key={r}
                  onClick={(e) => { e.stopPropagation(); onReact(r); }}
                  onContextMenu={(e) => { e.preventDefault(); onLongPress?.(message.id); }}
                  className={`p-1.5 rounded-full text-xs transition-transform hover:scale-110 ${
                    mine ? 'bg-indigo-500/20' : 'hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  <span className={mine ? 'font-bold' : ''}>{emoji}</span>
                  {cnt > 0 && <span className="ml-0.5">{cnt}</span>}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-[10px] text-gray-400 mt-0.5 ml-1">{getRelativeTime(message.created_at)}</p>
      </div>
      {isMine && <div className="w-8 flex-shrink-0" />}
    </div>
  );
}