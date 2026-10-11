import { useState, useEffect } from 'react';
import { db, getFingerprint } from '../lib/db';
import { useFingerprint } from '../hooks/useFingerprint';

export default function Polls() {
  const fingerprint = useFingerprint();
  const [polls, setPolls] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newPoll, setNewPoll] = useState({ question: '', options: ['', ''], allowMultiple: false, showResults: true, anonymous: true });

  useEffect(() => {
    loadPolls();
  }, []);

  const loadPolls = async () => {
    const polls = await db.polls.orderBy('createdAt').reverse().toArray();
    for (const poll of polls) {
      const pollId = poll.id!;
      const options = await db.pollOptions.where('pollId').equals(pollId).toArray();
      const votes = await db.pollVotes.where('pollId').equals(pollId).toArray();
      poll.options = options;
      poll.totalVotes = votes.length;
      poll.totalVoters = new Set(votes.map(v => v.voterFingerprint)).size;
      if (fingerprint) {
        const voted = await db.pollVotes.where('pollId').equals(pollId).and(v => v.voterFingerprint === fingerprint).first();
        poll.hasVoted = !!voted;
      }
    }
    setPolls(polls);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPoll.question.trim() || newPoll.options.filter(o => o.trim()).length < 2) return;

    const result = await db.polls.add({
      question: newPoll.question.trim(),
      allowMultiple: newPoll.allowMultiple,
      showResults: newPoll.showResults,
      anonymous: newPoll.anonymous,
      active: true,
      createdAt: Date.now(),
    });

    const pollId = result;
    for (let i = 0; i < newPoll.options.length; i++) {
      if (newPoll.options[i].trim()) {
        await db.pollOptions.add({ pollId, text: newPoll.options[i].trim(), position: i });
      }
    }

    loadPolls();
    setNewPoll({ question: '', options: ['', ''], allowMultiple: false, showResults: true, anonymous: true });
    setShowForm(false);
  };

  const handleVote = async (pollId: number, optionIds: number[]) => {
    if (!optionIds.length) return;
    const fp = getFingerprint();
    const existing = await db.pollVotes.where('pollId').equals(pollId).and(v => v.voterFingerprint === fingerprint).first();
    if (existing) return alert('Deja vote');

    await db.transaction('rw', db.pollVotes, async () => {
      for (const oid of optionIds) {
        await db.pollVotes.add({ pollId, optionId: oid, voterFingerprint: fingerprint, createdAt: Date.now() });
      }
    });
    loadPolls();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce sondage ?')) return;
    await db.polls.delete(id);
    await db.pollOptions.where('pollId').equals(id).delete();
    await db.pollVotes.where('pollId').equals(id).delete();
    setPolls(polls.filter(p => p.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sondages</h1>
        <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">
          + Nouveau sondage
        </button>
      </div>

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(e); }} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
          <h3 className="text-lg font-semibold mb-4">Nouveau sondage</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
              <input type="text" value={newPoll.question} onChange={(e) => setNewPoll({...newPoll, question: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Options (min 2)</label>
              <div className="space-y-2">
                {newPoll.options.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={newPoll.options[i]} onChange={(e) => { const opts = [...newPoll.options]; opts[i] = e.target.value; setNewPoll({...newPoll, options: opts}); }} className="flex-1 p-3 border border-gray-300 rounded-lg" placeholder={`Option ${i + 1}`} />
                    {newPoll.options.length > 2 && <button type="button" onClick={() => { const opts = [...newPoll.options]; opts.splice(i, 1); setNewPoll({...newPoll, options: opts}); }} className="p-2 text-red-600 hover:text-red-800">x</button>}
                  </div>
                ))}
                <button type="button" onClick={() => setNewPoll({...newPoll, options: [...newPoll.options, '']})} className="text-sm text-blue-600 hover:text-blue-800">+ Ajouter une option</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={newPoll.allowMultiple} onChange={(e) => setNewPoll({...newPoll, allowMultiple: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
                <span className="text-sm">Choix multiples</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={newPoll.showResults} onChange={(e) => setNewPoll({...newPoll, showResults: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
                <span className="text-sm">Afficher les resultats</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={newPoll.anonymous} onChange={(e) => setNewPoll({...newPoll, anonymous: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
                <span className="text-sm">Anonyme</span>
              </label>
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
              <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700">Creer</button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {polls.map((poll: any) => (
          <div key={poll.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">{poll.question}</h3>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>{poll.totalVotes} vote(s)</span>
                <span>{poll.totalVoters} votant(s)</span>
                <span className={`px-2 py-0.5 text-xs rounded ${poll.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {poll.active ? 'Actif' : 'Ferme'}
                </span>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100">
              {poll.options.map((opt: any) => {
                const optionVotes = opt.votes || 0;
                const total = poll.totalVotes || 1;
                const percent = Math.round((optionVotes / total) * 100);
                return (
                  <div key={opt.id} className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-gray-700">{opt.text}</span>
                      <span className="text-sm text-gray-500">{optionVotes} vote(s) ({percent}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded overflow-hidden">
                      <div className="h-full bg-blue-600 rounded" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {polls.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="mb-2">Aucun sondage pour l'instant</p>
            <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">
              Creer le premier sondage
            </button>
          </div>
        )}
      </div>
    </div>
  );
}