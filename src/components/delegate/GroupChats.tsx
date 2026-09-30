import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { GroupChatConversation } from '@/types';

export function GroupChats() {
  const [chats, setChats] = useState<GroupChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeChat, setActiveChat] = useState<GroupChatConversation | null>(null);
  const [msgContent, setMsgContent] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const { conversations } = await api.getGroupChats();
      setChats(conversations);
    } catch (err: any) {
      setError(err.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleClose = async (chat: GroupChatConversation) => {
    try {
      if (chat.closed === 1) await api.reopenGroupChat(chat.group_id);
      else await api.closeGroupChat(chat.group_id);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openChat = (chat: GroupChatConversation) => {
    setActiveChat(chat);
    setMsgContent('');
  };

  const sendMsg = async () => {
    if (!activeChat || !msgContent.trim() || sending) return;
    setSending(true);
    try {
      await api.sendGroupChatMessage({ groupId: activeChat.group_id, content: msgContent.trim() });
      setMsgContent('');
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="p-4">Chargement…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold">Chats de groupes validés</h3>

      <div className="lg:flex lg:gap-4">
        {/* Liste */}
        <div className="lg:w-1/3 glass p-3 rounded-xl space-y-2">
          {chats.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              Aucun groupe validé pour l'instant.
            </p>
          ) : (
            chats.map((c) => (
              <button
                key={c.id}
                onClick={() => openChat(c)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  activeChat?.id === c.id
                    ? 'bg-indigo-500 text-white'
                    : 'hover:bg-black/5 dark:hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{c.group_name}</span>
                  {c.closed && <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-500 rounded">🔒</span>}
                </div>
                <div className="text-[11px] opacity-70 mt-0.5 flex items-center gap-2">
                  <span>👥 {c.member_count}</span>
                  <span>•</span>
                  <span>{new Date(c.last_activity_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Détail / envoi message */}
        <div className="lg:flex-1 glass p-3 rounded-xl space-y-3 min-h-[300px]">
          {activeChat ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold">{activeChat.group_name}</h4>
                <button
                  onClick={() => handleToggleClose(activeChat)}
                  className={`px-3 py-1 text-sm rounded-full ${
                    activeChat.closed
                      ? 'bg-green-500/20 text-green-600 hover:bg-green-500/30'
                      : 'bg-red-500/20 text-red-600 hover:bg-red-500/30'
                  }`}
                >
                  {activeChat.closed ? 'Rouvrir' : 'Fermer'}
                </button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {activeChat.member_count} membre{activeChat.member_count > 1 ? 's' : ''} •
                {activeChat.closed ? ' 🔒 Fermé' : ' 🟢 Ouvert'}
              </p>

              <div className="border-t pt-3">
                <h5 className="font-medium mb-2">Envoyer un message (en tant que Délégué)</h5>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={msgContent}
                    onChange={(e) => setMsgContent(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMsg()}
                    placeholder="Ton message…"
                    disabled={activeChat.closed === 1 || sending}
                    className="flex-1 px-3 py-2 bg-white/80 dark:bg-gray-800/80 rounded-full border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={sendMsg}
                    disabled={sending || !msgContent.trim() || activeChat.closed === 1}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-full hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {sending ? '…' : 'Envoyer'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-gray-500 dark:text-gray-400">
              Sélectionne un groupe à gauche pour voir les détails et envoyer un message.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}