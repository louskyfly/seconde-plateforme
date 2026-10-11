import { useState, useEffect } from 'react';
import { db, getFingerprint } from '../lib/db';
import { useFingerprint } from '../hooks/useFingerprint';

export default function Messages() {
  const fingerprint = useFingerprint();
  const [messages, setMessages] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newMessage, setNewMessage] = useState({ content: '', category: 'autre', anonymous: false, authorName: '' });

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    const fp = getFingerprint();
    const msgs = await db.messages.where('fingerprint').equals(fp).reverse().toArray();
    setMessages(msgs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fp = getFingerprint();
    const isAnon = newMessage.anonymous;
    const author = newMessage.anonymous ? null : newMessage.authorName.trim();

    const result = await db.messages.add({
      content: newMessage.content.trim(),
      category: newMessage.category.trim(),
      anonymous: isAnon,
      authorName: author,
      fingerprint: fp,
      status: 'nouveau',
      delegateReply: null,
      repliedAt: null,
      responseReadAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const msg = await db.messages.get(result);
    setMessages([msg, ...messages]);
    setNewMessage({ content: '', category: 'autre', anonymous: false, authorName: '' });
    setShowForm(false);
  };

  const handleRead = async (id: number) => {
    await db.messages.update(id, { responseReadAt: Date.now() });
    setMessages(messages.map(m => m.id === id ? { ...m, responseReadAt: Date.now() } : m));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Mes messages</h1>
        <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">
          + Nouveau message
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
          <h3 className="text-lg font-semibold mb-4">Nouveau message</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contenu</label>
              <textarea value={newMessage.content} onChange={(e) => setNewMessage({...newMessage, content: e.target.value})} rows={4} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
                <select value={newMessage.category} onChange={(e) => setNewMessage({...newMessage, category: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg">
                  <option value="devoir">Devoir</option>
                  <option value="question">Question</option>
                  <option value="reclamation">Réclamation</option>
                  <option value="suggestion">Suggestion</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={newMessage.anonymous} onChange={(e) => setNewMessage({...newMessage, anonymous: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
                  <span className="text-sm text-gray-700">Anonyme</span>
                </label>
              </div>
            </div>
            {!newMessage.anonymous && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ton prénom</label>
                <input type="text" value={newMessage.authorName} onChange={(e) => setNewMessage({...newMessage, authorName: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg" required />
              </div>
            )}
            <div className="flex gap-2 justify-end pt-4">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
              <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700">Envoyer</button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 text-xs rounded ${msg.category === 'devoir' ? 'bg-blue-100 text-blue-700' : msg.category === 'question' ? 'bg-green-100 text-green-700' : msg.category === 'reclamation' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                    {msg.category}
                  </span>
                  {msg.anonymous ? <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">Anonyme</span> : <span className="text-sm text-gray-500">Par {msg.authorName}</span>}
                </div>
                <p className="text-gray-700 mb-2">{msg.content}</p>
                <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
                  <span>{new Date(msg.createdAt).toLocaleDateString('fr-FR')}</span>
                  <span className={`px-2 py-0.5 text-xs rounded ${msg.status === 'nouveau' ? 'bg-blue-100 text-blue-700' : msg.status === 'repondu' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {msg.status}
                  </span>
                </div>
                {msg.delegateReply && (
                  <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-sm font-medium text-green-800 mb-1">Réponse du délégué :</p>
                    <p className="text-green-800">{msg.delegateReply}</p>
                    <p className="text-xs text-green-600 mt-1">{new Date(msg.repliedAt).toLocaleString('fr-FR')}</p>
                    {!msg.responseReadAt && (
                      <button onClick={() => handleRead(msg.id)} className="mt-2 text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700">
                        Marquer comme lu
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {msg.status === 'nouveau' && !msg.anonymous && (
                <button onClick={() => handleRead(msg.id)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Marquer lu</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}