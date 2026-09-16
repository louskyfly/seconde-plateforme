import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import type { Resource } from '@/types';
import { formatDate, SUBJECTS } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';

interface ResourceFormProps {
  resource: Resource | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function ResourceForm({ resource, isOpen, onClose, onSaved }: ResourceFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('autre');
  const [fileUrl, setFileUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setTitle('');
    setDescription('');
    setSubject('autre');
    setFileUrl('');
    setLinkUrl('');
    setError('');
  };

  useEffect(() => {
    if (!resource) {
      reset();
      return;
    }
    setTitle(resource.title);
    setDescription(resource.description);
    setSubject(resource.subject);
    setFileUrl(resource.file_url || '');
    setLinkUrl(resource.link_url || '');
    setError('');
  }, [resource, isOpen]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      title,
      description,
      subject,
      file_url: fileUrl.trim() || null,
      link_url: linkUrl.trim() || null,
    };
    try {
      if (resource) {
        await api.updateResource(resource.id, payload);
      } else {
        await api.createResource(payload);
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
    <Modal isOpen={isOpen} onClose={onClose} title={resource ? "Modifier la ressource" : 'Ajouter une ressource'}>
      <form onSubmit={submit} className="space-y-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titre de la ressource"
          className="glass-input"
          required
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description..."
          rows={3}
          className="glass-input resize-none"
        />
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
            Matière
          </label>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="glass-input"
          >
            {Object.entries(SUBJECTS).map(([key, v]) => (
              <option key={key} value={key}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <input
          value={fileUrl}
          onChange={(e) => setFileUrl(e.target.value)}
          placeholder="URL du fichier (PDF, image...)"
          className="glass-input"
          type="url"
        />
        <input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="URL du lien"
          className="glass-input"
          type="url"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={busy} className="glass-button-primary w-full">
          {busy ? 'Enregistrement...' : resource ? 'Enregistrer' : 'Ajouter'}
        </button>
      </form>
    </Modal>
  );
}

interface ConfirmDialogProps {
  resource: Resource | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDialog({ resource, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <Modal isOpen={!!resource} onClose={onCancel} title="Supprimer la ressource">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
        Voulez-vous vraiment supprimer cette ressource ? Cette action est irréversible.
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

export function ManageResources() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [toDelete, setToDelete] = useState<Resource | null>(null);

  const load = () => {
    setLoading(true);
    api.getResources()
      .then(setResources)
      .catch((err: any) => setError(err.message || 'Erreur'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await api.deleteResource(toDelete.id);
      setToDelete(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Erreur');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Ressources</h1>
        <button onClick={() => { setEditing(null); setShowCreate(true); }} className="glass-button-primary text-sm">
          + Ajouter une ressource
        </button>
      </div>

      {error && (
        <div className="glass-card border-red-300/40 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : resources.length === 0 ? (
        <div className="glass-card text-center py-12">
          <div className="text-4xl mb-3">📚</div>
          <p className="text-gray-500 dark:text-gray-400">Aucune ressource</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {resources.map((r) => (
            <div key={r.id} className="glass-card flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 font-medium">
                  {SUBJECTS[r.subject] || r.subject}
                </span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { setEditing(r); setShowCreate(true); }}
                    className="glass-button text-xs px-2.5 py-1.5"
                    aria-label="Modifier"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setToDelete(r)}
                    className="glass-button text-xs px-2.5 py-1.5 bg-red-500/90 text-white border-red-400/30"
                    aria-label="Supprimer"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <h3 className="font-semibold mt-2">{r.title}</h3>
              {r.description && (
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{r.description}</p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{formatDate(r.created_at)}</p>
              <div className="flex gap-2 mt-3 pt-3 border-t border-white/10 dark:border-gray-700/20">
                {r.file_url && (
                  <a
                    href={r.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-button text-xs px-3 py-2 text-indigo-600 dark:text-indigo-400"
                  >
                    📄 Fichier
                  </a>
                )}
                {r.link_url && (
                  <a
                    href={r.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-button text-xs px-3 py-2"
                  >
                    🔗 Lien
                  </a>
                )}
                {!r.file_url && !r.link_url && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 px-1 py-2">
                    Aucun lien
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ResourceForm
        resource={editing}
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={load}
      />
      <ConfirmDialog
        resource={toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default ManageResources;