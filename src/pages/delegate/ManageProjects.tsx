import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import type { Project } from '@/types';
import { formatDate, PROJECT_STATUSES } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';

interface ProjectFormProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function ProjectForm({ project, isOpen, onClose, onSaved }: ProjectFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('en_preparation');
  const [date, setDate] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setName('');
    setDescription('');
    setStatus('en_preparation');
    setDate('');
    setImageUrl('');
    setError('');
  };

  useEffect(() => {
    if (!project) {
      reset();
      return;
    }
    setName(project.name);
    setDescription(project.description);
    setStatus(project.status);
    setDate(project.date?.split('T')[0] || '');
    setImageUrl(project.image_url || '');
    setError('');
  }, [project, isOpen]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      name,
      description,
      status,
      date: date || null,
      image_url: imageUrl.trim() || null,
    };
    try {
      if (project) {
        await api.updateProject(project.id, payload);
      } else {
        await api.createProject(payload);
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
    <Modal isOpen={isOpen} onClose={onClose} title={project ? "Modifier le projet" : 'Créer un projet'}>
      <form onSubmit={submit} className="space-y-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du projet"
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
              Statut
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="glass-input"
            >
              {Object.entries(PROJECT_STATUSES).map(([key, v]) => (
                <option key={key} value={key}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="glass-input"
            />
          </div>
        </div>
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="URL de l'image"
          className="glass-input"
          type="url"
        />
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Aperçu"
            className="rounded-xl max-h-40 w-full object-cover bg-gray-100 dark:bg-gray-800"
          />
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={busy} className="glass-button-primary w-full">
          {busy ? 'Enregistrement...' : project ? 'Enregistrer' : 'Créer'}
        </button>
      </form>
    </Modal>
  );
}

interface ConfirmDialogProps {
  project: Project | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDialog({ project, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <Modal isOpen={!!project} onClose={onCancel} title="Supprimer le projet">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
        Voulez-vous vraiment supprimer ce projet ? Cette action est irréversible.
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

export function ManageProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [toDelete, setToDelete] = useState<Project | null>(null);

  const load = () => {
    setLoading(true);
    api.getProjects()
      .then(setProjects)
      .catch((err: any) => setError(err.message || 'Erreur'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await api.deleteProject(toDelete.id);
      setToDelete(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Erreur');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Projets</h1>
        <button onClick={() => { setEditing(null); setShowCreate(true); }} className="glass-button-primary text-sm">
          + Créer un projet
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
      ) : projects.length === 0 ? (
        <div className="glass-card text-center py-12">
          <div className="text-4xl mb-3">🚀</div>
          <p className="text-gray-500 dark:text-gray-400">Aucun projet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {projects.map((p) => {
            const statusMeta = PROJECT_STATUSES[p.status] || { label: p.status, color: 'bg-gray-400' };
            return (
              <div key={p.id} className="glass-card flex flex-col">
                {p.image_url && (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="rounded-xl max-h-40 w-full object-cover mb-3 bg-gray-100 dark:bg-gray-800"
                  />
                )}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{p.name}</h3>
                  <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 whitespace-nowrap">
                    <span className={`w-2 h-2 rounded-full ${statusMeta.color}`} />
                    {statusMeta.label}
                  </span>
                </div>
                {p.description && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{p.description}</p>
                )}
                {p.date && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                    📅 {formatDate(p.date)}
                  </p>
                )}
                <div className="flex gap-2 mt-auto pt-3 border-t border-white/10 dark:border-gray-700/20">
                  <button
                    onClick={() => { setEditing(p); setShowCreate(true); }}
                    className="glass-button text-xs px-3 py-2 flex-1"
                  >
                    ✏️ Modifier
                  </button>
                  <button
                    onClick={() => setToDelete(p)}
                    className="glass-button text-xs px-3 py-2 flex-1 bg-red-500/90 text-white border-red-400/30"
                  >
                    🗑️ Supprimer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ProjectForm
        project={editing}
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={load}
      />
      <ConfirmDialog
        project={toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default ManageProjects;