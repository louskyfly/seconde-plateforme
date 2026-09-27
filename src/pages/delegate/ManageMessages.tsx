import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import type { Message } from '@/types';
import { formatDateTime, MESSAGE_STATUSES, CATEGORIES_MESSAGE } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';

type StatusFilter = 'all' | 'nouveau' | 'lu' | 'traite';

interface ConfirmDialogProps {
  message: Message | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDialog({ message, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <Modal isOpen={!!message} onClose={onCancel} title="Supprimer le message">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
        Voulez-vous vraiment supprimer ce message ? Cette action est irréversible.
      </p>
      <div className="flex gap-3">
        <button onClick={onCancel} className="glass-button flex-1">
          Annuler
        </button>
        <button
          onClick={onConfirm}
          className="glass-button flex-1 bg-red-500/90 text-white border-red-400/30 hover:bg-red-600/90"
        >
          Supprimer
        </button>
      </div>
    </Modal>
  );
}

interface ReplyDialogProps {
  message: Message | null;
  onClose: () => void;
  onSent: () => void;
}

function ReplyDialog({ message, onClose, onSent }: ReplyDialogProps) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (message) {
      setReply(message.delegate_reply || '');
      setError('');
    }
  }, [message]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message || !reply.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.updateMessage(message.id, { reply: reply.trim() });
      onSent();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={!!message}
      onClose={onClose}
      title={message?.delegate_reply ? 'Modifier la réponse' : 'Répondre à l’élève'}
    >
      <form onSubmit={submit} className="space-y-4">
        {message && (
          <div className="glass-card text-sm">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              {message.anonymous ? 'Anonyme' : message.author_name || 'Inconnu'} ·{' '}
              {formatDateTime(message.created_at)}
            </p>
            <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
              {message.content}
            </p>
          </div>
        )}

        <div>
          <label htmlFor="reply-content" className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Ta réponse
          </label>
          <textarea
            id="reply-content"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Ta réponse sera visible uniquement par l’élève qui a écrit ce message."
            className="glass-input min-h-[140px] resize-y"
            rows={6}
            maxLength={1000}
            autoFocus
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 text-right mt-1">
            {reply.length}/1000
          </p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="glass-button flex-1">
            Annuler
          </button>
          <button
            type="submit"
            disabled={busy || !reply.trim()}
            className="glass-button-primary flex-1 disabled:opacity-50"
          >
            {busy ? 'Envoi...' : 'Envoyer la réponse'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ManageMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<Message | null>(null);
  const [toReply, setToReply] = useState<Message | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [flash, setFlash] = useState('');

  const load = () => {
    setLoading(true);
    api.getMessages()
      .then(setMessages)
      .catch((err: any) => setError(err.message || 'Erreur'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const notify = (message: string) => {
    setFlash(message);
    setTimeout(() => setFlash(''), 4000);
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return messages;
    return messages.filter((m) => m.status === filter);
  }, [messages, filter]);

  const filteredCounts = useMemo(() => ({
    all: messages.length,
    nouveau: messages.filter((m) => m.status === 'nouveau').length,
    lu: messages.filter((m) => m.status === 'lu').length,
    traite: messages.filter((m) => m.status === 'traite').length,
  }), [messages]);

  const updateStatus = async (message: Message, status: string) => {
    setBusyId(message.id);
    try {
      await api.updateMessage(message.id, { status });
      load();
    } catch (err: any) {
      setError(err.message || 'Erreur');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await api.deleteMessage(toDelete.id);
      setToDelete(null);
      notify('Message supprimé');
      load();
    } catch (err: any) {
      setError(err.message || 'Erreur');
    }
  };

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Tous' },
    { key: 'nouveau', label: 'Nouveau' },
    { key: 'lu', label: 'Lu' },
    { key: 'traite', label: 'Traité' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Messages</h1>
      </div>

      {flash && (
        <div
          role="status"
          className="glass-card border-l-4 border-l-green-400 text-green-700 dark:text-green-400 text-sm"
        >
          ✅ {flash}
        </div>
      )}

      {error && (
        <div className="glass-card border-red-300/40 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`glass-button text-xs px-4 py-2 whitespace-nowrap ${
              filter === f.key ? 'glass-button-primary' : ''
            }`}
          >
            {f.label} ({filteredCounts[f.key]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-[3px] border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card text-center py-12">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-gray-500 dark:text-gray-400">Aucun message</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => {
            const isExpanded = expandedId === m.id;
            const statusMeta = MESSAGE_STATUSES[m.status] || m.status;
            return (
              <button
                key={m.id}
                onClick={() => setExpandedId(isExpanded ? null : m.id)}
                className="glass-card text-left w-full block"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {m.status === 'nouveau' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                    )}
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDateTime(m.created_at)}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 truncate">
                      {CATEGORIES_MESSAGE[m.category] || m.category}
                    </span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.status === 'traite'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                        : m.status === 'lu'
                        ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                    }`}
                  >
                    {statusMeta}
                  </span>
                </div>

                <p className="text-sm mt-2 font-medium text-gray-500 dark:text-gray-400">
                  {m.anonymous ? 'Anonyme' : m.author_name || 'Inconnu'}
                </p>

                <p className={`mt-1 text-gray-800 dark:text-gray-200 text-sm ${isExpanded ? '' : 'overflow-hidden max-h-12'}`}>
                  {m.content}
                </p>

                {m.delegate_reply && (
                  <div className="mt-3 ml-2 pl-3 border-l-2 border-indigo-400 bg-indigo-500/5 rounded-r-lg py-2 pr-3">
                    <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      Ta réponse · envoyée le {formatDateTime(m.replied_at || m.updated_at)}
                    </p>
                    <p className="text-sm mt-1 text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words">
                      {m.delegate_reply}
                    </p>
                  </div>
                )}

                {isExpanded && (
                  <div className="flex gap-2 flex-wrap mt-4">
                    <button
                      disabled={busyId === m.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setToReply(m);
                      }}
                      className="glass-button text-xs px-3 py-2"
                    >
                      {m.delegate_reply ? 'Modifier la réponse' : 'Répondre'}
                    </button>
                    {m.status === 'nouveau' && (
                      <button
                        disabled={busyId === m.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateStatus(m, 'lu');
                        }}
                        className="glass-button text-xs px-3 py-2"
                      >
                        Marquer comme lu
                      </button>
                    )}
                    {m.status === 'lu' && (
                      <button
                        disabled={busyId === m.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateStatus(m, 'traite');
                        }}
                        className="glass-button text-xs px-3 py-2"
                      >
                        Marquer comme traité
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setToDelete(m);
                      }}
                      className="glass-button text-xs px-3 py-2 bg-red-500/90 text-white border-red-400/30"
                    >
                      Supprimer
                    </button>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        message={toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
      />
      <ReplyDialog
        message={toReply}
        onClose={() => setToReply(null)}
        onSent={() => {
          load();
          notify('Réponse envoyée à l’élève');
        }}
      />
    </div>
  );
}

export default ManageMessages;