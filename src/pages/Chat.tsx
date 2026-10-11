import { useState, useEffect, useRef } from 'react';
import { db, getFingerprint } from '../lib/db';
import { useFingerprint } from '../hooks/useFingerprint';

const REACTIONS = ['pouce', 'rire', 'coeur'] as const;
type Reaction = typeof REACTIONS[number];

export default function Chat() {
  const fingerprint = useFingerprint();
  const [user, setUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [newImage, setNewImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [conversation, setConversation] = useState<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const init = async () => {
    try {
      // Get or create user
      let user = await db.chatUsers.where('fingerprint').equals(fingerprint).first();
      if (!user) {
        const result = await db.chatUsers.add({
          displayName: '',
          kind: 'student',
          fingerprint,
          createdAt: Date.now(),
          lastSeenAt: Date.now(),
        });
        user = { id: result, displayName: '', kind: 'student', fingerprint, lastSeenAt: Date.now() };
      } else if (!user.displayName) {
        // Need to set name
      }
      setUser(user);

      // Get default conversation
      let conv = await db.chatConversations.where('isGroup').equals(1).first();
      if (!conv) {
        const delegate = await db.chatUsers.where('kind').equals('delegate').first();
        const delegateId = delegate?.id || 1;
        const id = await db.chatConversations.add({
          title: 'Groupe classe',
          isGroup: true,
          createdBy: delegateId,
          groupId: null,
          closed: false,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
        });
        conv = { id, title: 'Groupe classe', isGroup: true, createdBy: delegateId, groupId: null, closed: false };
      }
      setConversation(conv);

      // Add user to conversation
      if (conv && user && conv.id && user.id) {
        await db.chatMembers.put({
          conversationId: conv.id,
          userId: user.id,
          lastReadAt: Date.now(),
          lastReadMessageId: 0,
          joinedAt: Date.now(),
        });
      }

      // Load messages
      loadMessages();
    } catch (e) {
      console.error('Chat init error:', e);
    }
  };

  const loadMessages = async () => {
    if (!conversation) return;
    const msgs = await db.chatMessagesDB
      .where('conversationId')
      .equals(conversation.id)
      .reverse()
      .limit(50)
      .toArray();
    // Reverse to show oldest first
    const sorted = msgs.reverse();
    // Add reactions and sender info
    for (const msg of sorted) {
      const sender = await db.chatUsers.get(msg.senderId);
      (msg as any).senderName = sender?.displayName || 'Inconnu';
      (msg as any).senderKind = sender?.kind || 'student';
      if (msg.id) {
        (msg as any).reactions = await getReactions(msg.id);
      }
    }
    setMessages(sorted);
  };

  const getReactions = async (messageId: number) => {
    const reactions = await db.chatReactions.where('messageId').equals(messageId).toArray();
    const counts: Record<string, { total: number; mine: boolean }> = {};
    const currentUserId = await getCurrentUserId();
    for (const r of reactions) {
      if (!counts[r.reaction]) counts[r.reaction] = { total: 0, mine: false };
      counts[r.reaction].total++;
      if (r.userId === currentUserId) counts[r.reaction].mine = true;
    }
    return counts;
  };

  const getCurrentUserId = async () => {
    const user = await db.chatUsers.where('fingerprint').equals(fingerprint).first();
    return user?.id;
  };

  useEffect(() => {
    init();
  }, []);

  // Auto-refresh messages
  useEffect(() => {
    const interval = setInterval(() => {
      if (conversation) loadMessages();
    }, 5000);
    return () => clearInterval(interval);
  }, [conversation]);

  const handleSend = async () => {
    if (!newMessage.trim() && !newImage) return;
    if (!conversation || !user) return;

    setSending(true);
    try {
      await db.chatMessagesDB.add({
        conversationId: conversation.id,
        senderId: user.id,
        content: newMessage.trim(),
        image: newImage || undefined,
        createdAt: Date.now(),
      });

      setNewMessage('');
      setNewImage(null);
      // Reload messages
      loadMessages();
    } catch (e) {
      console.error('Send error:', e);
      alert('Erreur envoi message');
    } finally {
      setSending(false);
    }
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Seules les images sont acceptées');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      alert('Image trop volumineuse (max 3 Mo)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setNewImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleReaction = async (messageId: number, reaction: Reaction) => {
    const currentUserId = await getCurrentUserId();
    if (!currentUserId) return;

    const existing = await db.chatReactions
      .where('[messageId+reaction+userId]')
      .equals([messageId, reaction, currentUserId])
      .first();

    if (existing) {
      await db.chatReactions.delete(existing.id);
    } else {
      await db.chatReactions.add({
        messageId,
        reaction,
        userId: currentUserId,
        createdAt: Date.now(),
      });
    }
    // Reload messages to update reactions
    loadMessages();
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Connexion au chat...</p>
        </div>
      </div>
    );
  }

  if (!user.displayName) {
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold mb-4 text-center">Bienvenue dans le chat !</h2>
        <p className="text-gray-600 mb-4 text-center">Choisis ton prénom pour commencer (prénom uniquement)</p>
        <form onSubmit={(e) => {
          e.preventDefault();
          const name = new FormData(e.currentTarget).get('name') as string;
          if (name && name.trim()) {
            // Update user name
            db.chatUsers.update(user.id, { displayName: name.trim().split(' ')[0] });
            setUser({ ...user, displayName: name.trim().split(' ')[0] });
          }
        }}>
          <input
            name="name"
            type="text"
            maxLength={20}
            placeholder="Ton prénom"
            className="w-full p-3 border border-gray-300 rounded-lg mb-4"
            autoFocus
            required
          />
          <button type="submit" className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700">
            Rejoindre le chat
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
            {conversation?.title?.charAt(0) || '💬'}
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">{conversation?.title || 'Chat'}</h2>
            <p className="text-xs text-gray-500">Groupe classe</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={messagesEndRef}>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <p>Aucun message pour l'instant. Soyez le premier à écrire !</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.senderId === user.id}
              onReaction={(r) => handleReaction(msg.id, r)}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        {newImage && (
          <div className="relative mb-2">
            <img src={newImage} alt="Aperçu" className="max-h-32 rounded-lg" />
            <button
              onClick={() => { setNewImage(null); }}
              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 text-xs"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <input
              type="file"
              accept="image/*"
              onChange={handleImagePick}
              className="sr-only"
              id="image-upload"
            />
            <button
              type="button"
              onClick={() => {}}
              disabled={sending || !!newImage}
              className="w-full p-3 border-2 border-dashed border-gray-300 rounded-xl text-center text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              {newImage ? '✓ Image sélectionnée' : '📎 Joindre une image (max 3 Mo)'}
            </button>
          </label>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Écrire un message..."
            className="flex-1 p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={sending || (!newMessage.trim() && !newImage)}
            className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Envoyer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Message bubble component
function MessageBubble({
  message,
  isOwn,
  onReaction,
}: {
  message: any;
  isOwn: boolean;
  onReaction: (r: 'pouce' | 'rire' | 'coeur') => void;
}) {
  const reactions = message.reactions || {};

  return (
    <div
      className={`flex gap-2 ${message.isOwn ? 'flex-row-reverse' : ''}`}
      style={{ maxWidth: '80%' }}
    >
      {!message.isOwn && (
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm">
          {message.senderName?.charAt(0).toUpperCase()}
        </div>
      )}
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2 ${
          message.isOwn
            ? 'bg-blue-600 text-white rounded-br-none'
            : 'bg-gray-100 text-gray-900 rounded-bl-none'
        }`}
      >
        {!message.isOwn && (
          <p className="text-xs text-gray-500 mb-1">{message.senderName}</p>
        )}
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.image && (
          <img src={message.image} alt="Image" className="mt-2 max-h-48 rounded-lg" />
        )}
        <div className="flex items-center gap-1 mt-2 pt-2 border-t" style={{ borderColor: message.isOwn ? 'rgba(255,255,255,0.2)' : '#e5e7eb' }}>
          {(['pouce', 'rire', 'coeur'] as const).map((r) => {
            const react = reactions[r];
            const count = react?.total || 0;
            const mine = react?.mine;
            return (
              <button
                key={r}
                onClick={() => onReaction(r)}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
                  mine ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                <span>{['👍', '😂', '❤️'][['pouce', 'rire', 'coeur'].indexOf(r)]}</span>
                {count > 0 && <span>{count}</span>}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-400 mt-1 text-right">
          {new Date(message.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}