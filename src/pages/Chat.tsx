import { useState, useEffect, useRef, useMemo } from 'react';
import { ref, set as firebaseSet, update as firebaseUpdate, remove as firebaseRemove, get, serverTimestamp } from 'firebase/database';
import { getFingerprint, getLocalDisplayName, setLocalDisplayName } from '../lib/device';
import { useFingerprint } from '../hooks/useFingerprint';
import { useFirebaseSync, useFirebaseValue } from '../hooks/useFirebaseSync';
import { db as fdb, FB } from '../lib/firebase';
import { compressImage } from '../lib/image';

const REACTIONS = ['pouce', 'rire', 'coeur'] as const;
type Reaction = typeof REACTIONS[number];

const CONVERSATION = { id: 'classe', title: 'Groupe classe' };

/** Ancien prenom saisi dans la version locale (IndexedDB), pour ne pas le redemander. */
async function legacyDisplayName(fp: string): Promise<string> {
  try {
    const { hasLegacyLocalDb } = await import('../lib/migrateLocal');
    if (!(await hasLegacyLocalDb())) return '';
    const { db } = await import('../lib/db');
    const u = await db.chatUsers.where('fingerprint').equals(fp).first();
    return u?.displayName || '';
  } catch {
    return '';
  }
}

/**
 * Donnees Firebase :
 *  chatMessages/{id}                      -> { senderId (empreinte), senderName, senderKind, content, image?, createdAt }
 *  chatReactions/{messageId}/{reaction}/{empreinte} -> true
 *  chatUsers/{empreinte}                  -> { displayName, kind, lastSeenAt }   (pour les statistiques admin)
 * Le prenom reste aussi en local (localStorage) : il est propre a l'appareil.
 */
export default function Chat() {
  useFingerprint();
  const fp = useMemo(() => getFingerprint(), []);
  const [user, setUser] = useState<any>(null);
  const [newMessage, setNewMessage] = useState('');
  const [newImage, setNewImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversation = CONVERSATION;

  const { items: rawMessages } = useFirebaseSync<any>(FB.chatMessages, { limitToLast: 50 });
  const { value: reactionsByMsg } = useFirebaseValue<Record<string, Record<string, Record<string, true>>>>(FB.chatReactions);

  const messages = useMemo(() => {
    return [...rawMessages]
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map((msg: any) => {
        const counts: Record<string, { total: number; mine: boolean }> = {};
        const byReaction = (reactionsByMsg && reactionsByMsg[msg.id]) || {};
        for (const r of REACTIONS) {
          const users = Object.keys(byReaction[r] || {});
          if (users.length) counts[r] = { total: users.length, mine: users.includes(fp) };
        }
        return { ...msg, senderName: msg.senderName || 'Inconnu', senderKind: msg.senderKind || 'student', reactions: counts };
      });
  }, [rawMessages, reactionsByMsg, fp]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let displayName = getLocalDisplayName();
      if (!displayName) {
        displayName = await legacyDisplayName(fp);
        if (displayName) setLocalDisplayName(displayName);
      }
      if (cancelled) return;
      setUser({ id: fp, displayName, kind: 'student', fingerprint: fp });
      if (displayName) registerUser(displayName);
    })();
    return () => {
      cancelled = true;
    };
  }, [fp]);

  const registerUser = (displayName: string) => {
    firebaseUpdate(ref(fdb, `${FB.chatUsers}/${fp}`), {
      displayName,
      kind: 'student',
      lastSeenAt: serverTimestamp(),
    }).catch((e) => console.error('chatUsers:', e));
  };

  const handleSend = async () => {
    if (!newMessage.trim() && !newImage) return;
    if (!user) return;

    setSending(true);
    try {
      const msgRef = ref(fdb, `${FB.chatMessages}/${crypto.randomUUID().replace(/-/g, '')}`);
      const doc: Record<string, any> = {
        senderId: fp,
        senderName: user.displayName,
        senderKind: 'student',
        content: newMessage.trim(),
        createdAt: serverTimestamp(),
      };
      if (newImage) doc.image = newImage;
      await firebaseSet(msgRef, doc);
      setNewMessage('');
      setNewImage(null);
    } catch (e) {
      console.error('Send error:', e);
      alert('Erreur envoi message');
    } finally {
      setSending(false);
    }
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Seules les images sont acceptées');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      alert('Image trop volumineuse (max 3 Mo)');
      return;
    }
    try {
      const data = await compressImage(file, 1280, 0.75);
      if (data.length > 1_500_000) {
        alert('Image trop volumineuse');
        return;
      }
      setNewImage(data);
    } catch {
      alert("Impossible de lire l'image");
    }
  };

  const handleReaction = async (messageId: string, reaction: Reaction) => {
    const path = `${FB.chatReactions}/${messageId}/${reaction}/${fp}`;
    const mine = !!reactionsByMsg?.[messageId]?.[reaction]?.[fp];
    try {
      if (mine) await firebaseRemove(ref(fdb, path));
      else await firebaseSet(ref(fdb, path), true);
    } catch (e) {
      console.error('Reaction error:', e);
    }
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
            const first = name.trim().split(' ')[0];
            setLocalDisplayName(first);
            registerUser(first);
            setUser({ ...user, displayName: first });
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <p>Aucun message pour l'instant. Soyez le premier à écrire !</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={{ ...msg, isOwn: msg.senderId === fp }}
              isOwn={msg.senderId === fp}
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
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImagePick}
              className="sr-only"
              id="image-upload"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
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