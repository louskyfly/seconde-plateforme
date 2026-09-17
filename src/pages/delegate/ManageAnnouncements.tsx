import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import type { Announcement } from '@/types';
import { formatDate, CATEGORIES_ANNOUNCEMENT } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';

interface AnnouncementFormProps {
  announcement: Announcement | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function AnnouncementForm({ announcement, isOpen, onClose, onSaved }: AnnouncementFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [importance, setImportance] = useState('normal');
  const [author, setAuthor] = useState('');
  const [published, setPublished] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setTitle('');
    setDescription('');
    setCategory('general');
    setImportance('normal');
    setAuthor('');
    setPublished(true);
    setError('');
  };

  useEffect(() => {
    if (!announcement) {
      reset();
      return;
    }
    setTitle(announcement.title);
    setDescription(announcement.description);
    setCategory(announcement.category);
    setImportance(announcement.importance);
    setAuthor(announcement.author);
    setPublished(announcement.published === 1);
    setError('');
  }, [announcement, isOpen]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      title,
      description,
      category,
      importance,
      author,
      published: published ? 1 : 0,
    };
    try {
      if (announcement) {
        await api.updateAnnouncement(announcement.id, payload);
      } else {
        await api.createAnnouncement(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={announcement ? "Modifier l'annonce" : 'Créer une annonce'}
    >
      <form onSubmit={submit} className="space-y-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titre de l'annonce"
          className="glass-input"
          required
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description..."
          rows={4}
          className="glass-input resize-none"
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
              Catégorie
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="glass-input"
            >
              {Object.entries(CATEGORIES_ANNOUNCEMENT).map(([key, v]) => (
                <option key={key} value={key}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
              Importance
            </label>
            <select
              value={importance}
              onChange={(e) => setImportance(e.target.value)}
              className="glass-input"
            >
              <option value="normal">🟢 Normal</option>
              <option value="important">🟡 Important</option>
              <option value="urgent">🔴 Urgent</option>
            </select>
          </div>
        </div>
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Auteur"
          className="glass-input"
          required
        />
        <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="w-5 h-5 accent-indigo-600"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Publié immédiatement</span>
        </label>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={busy} className="glass-button-primary w-full">
          {busy ? 'Enregistrement...' : announcement ? 'Enregistrer' : 'Créer'}
        </button>
      </form>
    </Modal>
  );
}

interface ConfirmDialogProps {
  announcement: Announcement | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDialog({ announcement, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <Modal isOpen={!!announcement} onClose={onCancel} title="Supprimer l'annonce">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
        Voulez-vous vraiment supprimer cette annonce ? Cette action est irréversible.
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

export function ManageAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [toDelete, setToDelete] = useState<Announcement | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    api.getAnnouncements()
      .then(setAnnouncements)
      .catch((err: any) => setError(err.message || 'Erreur'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const togglePublished = async (a: Announcement) => {
    setBusyId(a.id);
    try {
      await api.updateAnnouncement(a.id, { published: a.published === 1 ? 0 : 1 });
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
      await api.deleteAnnouncement(toDelete.id);
      setToDelete(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Erreur');
    }
  };

  const importanceColor = (v: string) =>
    v === 'urgent'
      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
      : v === 'important'
      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';

  const sorted = [...announcements].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Annonces</h1>
        <button onClick={() => { setEditing(null); setShowCreate(true); }} className="glass-button-primary text-sm">
          + Créer une annonce
        </button>
      </div>

      {error && (
        <div className="glass-card border-red-300/40 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-[3px] border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="glass-card text-center py-12">
          <div className="text-4xl mb-3">📢</div>
          <p className="text-gray-500 dark:text-gray-400">Aucune annonce</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((a) => (
            <div key={a.id} className={`glass-card ${a.published === 1 ? '' : 'opacity-85'}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">{a.title}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatDate(a.created_at)} · {a.author}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {CATEGORIES_ANNOUNCEMENT[a.category] || a.category}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${importanceColor(a.importance)}`}>
                    {a.importance === 'urgent' ? '🔴 Urgent' : a.importance === 'important' ? '🟡 Important' : '🟢 Normal'}
                  </span>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${
                      a.published === 1
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                        : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {a.published === 1 ? 'Publié' : 'Brouillon'}
                  </span>
                </div>
              </div>

              <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">{a.description}</p>

              <div className="flex gap-2 flex-wrap mt-4">
                <button
                  disabled={busyId === a.id}
                  onClick={() => togglePublished(a)}
                  className={`glass-button text-xs px-3 py-2 ${
                    a.published === 1
                      ? ''
                      : 'bg-green-500/20 text-green-600 dark:text-green-400'
                  }`}
                >
                  {a.published === 1 ? 'Dépublier' : 'Publier'}
                </button>
                <button
                  onClick={() => { setEditing(a); setShowCreate(true); }}
                  className="glass-button text-xs px-3 py-2"
                >
                  ✏️ Modifier
                </button>
                <button
                  onClick={() => setToDelete(a)}
                  className="glass-button text-xs px-3 py-2 bg-red-500/90 text-white border-red-400/30"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnnouncementForm
        announcement={editing}
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={load}
      />
      <ConfirmDialog
        announcement={toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default ManageAnnouncements;