import { useState, useEffect } from 'react';
import { db, getFingerprint, now } from '../lib/db';
import { useFingerprint } from '../hooks/useFingerprint';

export default function Revisions() {
  const fingerprint = useFingerprint();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newSession, setNewSession] = useState({
    title: '', subject: 'autre', date: '', time: '', duration: 60, location: '', description: ''
  });

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    const sessions = await db.revisionSessions.orderBy('date').toArray();
    setSessions(sessions);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await db.revisionSessions.add({
      ...newSession,
      createdByFingerprint: getFingerprint(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const newS = await db.revisionSessions.get(result);
    setSessions([newS, ...sessions]);
    setNewSession({ title: '', subject: 'autre', date: '', time: '', duration: 60, location: '', description: '' });
    setShowForm(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cette session ?')) return;
    await db.revisionSessions.delete(id);
    setSessions(sessions.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sessions de révision</h1>
        <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">
          + Nouvelle session
        </button>
      </div>

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(e); }} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
          <h3 className="text-lg font-semibold mb-4">Nouvelle session</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titre</label>
              <input type="text" value={newSession.title} onChange={(e) => setNewSession({...newSession, title: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Matière</label>
              <select value={newSession.subject} onChange={(e) => setNewSession({...newSession, subject: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="maths">Mathématiques</option>
                <option value="francais">Français</option>
                <option value="anglais">Anglais</option>
                <option value="histoire">Histoire</option>
                <option value="geo">Géographie</option>
                <option value="svt">SVT</option>
                <option value="physique">Physique-Chimie</option>
                <option value="autre">Autre</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={newSession.date} onChange={(e) => setNewSession({...newSession, date: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heure</label>
              <input type="time" value={newSession.time} onChange={(e) => setNewSession({...newSession, time: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Durée (min)</label>
              <input type="number" value={newSession.duration} onChange={(e) => setNewSession({...newSession, duration: parseInt(e.target.value)})} className="w-full p-3 border border-gray-300 rounded-lg" min={15} max={480} step={15} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lieu</label>
              <input type="text" value={newSession.location} onChange={(e) => setNewSession({...newSession, location: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg" placeholder="Salle, bibliothèque, chez moi..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={newSession.description} onChange={(e) => setNewSession({...newSession, description: e.target.value})} rows={3} className="w-full p-3 border border-gray-300 rounded-lg" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
            <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700">Créer</button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {sessions.map((session) => (
          <div key={session.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{session.title}</h3>
                  <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">{session.subject}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                  <span>📅 {new Date(session.date).toLocaleDateString('fr-FR')}</span>
                  {session.time && <span>🕐 {session.time}</span>}
                  {session.duration && <span>⏱️ {session.duration} min</span>}
                  {session.location && <span>📍 {session.location}</span>}
                </div>
                {session.description && <p className="text-gray-700 mt-2">{session.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleDelete(session.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Supprimer</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}