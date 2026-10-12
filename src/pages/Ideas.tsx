import { useState, useEffect, useCallback } from 'react';
import { db, getFingerprint } from '../lib/db';
import { useFingerprint } from '../hooks/useFingerprint';
import { useSync } from '../hooks/useSync';

const IDEA_STATUSES = ['a_etudier', 'en_discussion', 'transmise', 'realisee', 'non_retenue'] as const;

export default function Ideas() {
  const fingerprint = useFingerprint();
  const [ideas, setIdeas] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newIdea, setNewIdea] = useState({ title: '', description: '', anonymous: false });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sync hook
  const { isConnected, create, update, remove, forceSync, subscribe } = useSync('ideas');

  // Chargement initial depuis IndexedDB (source de vérité locale)
  useEffect(() => {
    loadIdeas();
  }, []);

  const loadIdeas = async () => {
    try {
      const ideas = await db.ideas.orderBy('createdAt').reverse().toArray();
      setIdeas(ideas);
    } catch (e) {
      console.error('Failed to load ideas:', e);
      setError('Impossible de charger les idées');
    }
  };

  // Abonnement aux mises à jour temps réel
  useEffect(() => {
    return subscribe(() => {
      // Quand le sync notifie un changement, on recharge depuis IndexedDB
      loadIdeas();
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const fp = getFingerprint();
      if (!newIdea.title.trim()) return;

      const doc = {
        title: newIdea.title.trim(),
        description: newIdea.description.trim(),
        authorName: newIdea.anonymous ? null : 'Moi',
        anonymous: newIdea.anonymous,
        fingerprint: newIdea.anonymous ? null : fingerprint,
        status: 'a_etudier' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Ajoute localement (optimiste)
      const id = await db.ideas.add({ ...doc, createdAt: Date.now(), updatedAt: Date.now() });
      const newIdeaObj = await db.ideas.get(id);
      setIdeas([newIdeaObj, ...ideas]);

      // Envoie au serveur de sync
      await create({ ...doc, id });

      setNewIdea({ title: '', description: '', anonymous: false });
      setShowForm(false);
    } catch (e) {
      console.error('Failed to create idea:', e);
      setError('Erreur lors de la création. Réessaie.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, status: 'a_etudier' | 'en_discussion' | 'transmise' | 'realisee' | 'non_retenue') => {
    try {
      await db.ideas.update(id, { status, updatedAt: Date.now() });
      setIdeas(ideas.map(i => i.id === id ? { ...i, status } : i));
      await update(id, { status, updatedAt: Date.now() });
    } catch (e) {
      console.error('Failed to update idea:', e);
      setError('Erreur lors de la mise à jour');
      loadIdeas();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette idée ?')) return;
    try {
      await db.ideas.delete(id);
      setIdeas(ideas.filter(i => i.id !== id));
      await remove(id);
    } catch (e) {
      console.error('Failed to delete idea:', e);
      setError('Erreur lors de la suppression');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Boîte à idées</h1>
        <div className="flex items-center gap-3">
          <span className={`px-2 py-1 text-xs rounded-full ${isConnected ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
            {isConnected ? '🟢 Connecté' : '🟡 Hors ligne'}
          </span>
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700"
          >
            + Nouvelle idée
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm" role="alert">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
          <h3 className="text-lg font-semibold mb-4">Nouvelle idée</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titre</label>
              <input
                type="text"
                value={newIdea.title}
                onChange={(e) => setNewIdea({ ...newIdea, title: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={newIdea.description}
                onChange={(e) => setNewIdea({ ...newIdea, description: e.target.value })}
                rows={4}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="anonymous"
                checked={newIdea.anonymous}
                onChange={(e) => setNewIdea({ ...newIdea, anonymous: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <label htmlFor="anonymous" className="text-sm text-gray-700">Anonyme</label>
            </div>
            <div className="flex gap-2 pt-4">
              <button type="submit" disabled={submitting} className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {submitting ? 'Publication...' : 'Publier'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Annuler
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {ideas.map((idea) => (
          <div key={idea.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{idea.title}</h3>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    idea.status === 'a_etudier' ? 'bg-gray-100 text-gray-700' :
                    idea.status === 'en_discussion' ? 'bg-blue-100 text-blue-700' :
                    idea.status === 'transmise' ? 'bg-yellow-100 text-yellow-700' :
                    idea.status === 'realisee' ? 'bg-green-100 text-green-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {idea.status.replace('_', ' ')}
                  </span>
                  {idea.anonymous && <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">Anonyme</span>}
                </div>
                <p className="text-gray-700 mt-1">{idea.description}</p>
                <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                  <span>Par {idea.authorName || 'Anonyme'}</span>
                  <span>{new Date(idea.createdAt).toLocaleDateString('fr-FR')}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={idea.status}
                  onChange={(e) => handleStatusChange(idea.id, e.target.value as 'a_etudier' | 'en_discussion' | 'transmise' | 'realisee' | 'non_retenue')}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {['a_etudier', 'en_discussion', 'transmise', 'realisee', 'non_retenue'].map(s => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleDelete(idea.id)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        ))}
        {ideas.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="mb-2">Aucune idée pour l'instant</p>
            <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">
              Créer la première idée
            </button>
          </div>
        )}
      </div>
    </div>
  );
}