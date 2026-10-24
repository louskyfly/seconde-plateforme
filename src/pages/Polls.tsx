import { useState, useMemo } from 'react';
import { ref, set as firebaseSet, update as firebaseUpdate, serverTimestamp } from 'firebase/database';
import { getFingerprint } from '../lib/device';
import { useFingerprint } from '../hooks/useFingerprint';
import { useFirebaseSync, useFirebaseValue } from '../hooks/useFirebaseSync';
import { db as fdb, FB } from '../lib/firebase';

/**
 * Donnees Firebase :
 *  polls/{pollId}            -> { question, allowMultiple, showResults, anonymous, active, options: { o0: { text, position } } }
 *  pollVotes/{pollId}/{empreinte} -> { options: { o0: true }, createdAt }   (un seul vote par appareil)
 */
export default function Polls() {
  const fingerprint = useFingerprint();
  const myFp = useMemo(() => getFingerprint(), []);
  const { items: pollItems, create } = useFirebaseSync<any>(FB.polls);
  const { value: votesByPoll } = useFirebaseValue<Record<string, Record<string, any>>>(FB.pollVotes);
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [showForm, setShowForm] = useState(false);
  const [newPoll, setNewPoll] = useState({ question: '', options: ['', ''], allowMultiple: false, showResults: true, anonymous: true });

  const polls = useMemo(() => {
    return [...pollItems]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((poll: any) => {
        const votes = (votesByPoll && votesByPoll[poll.id]) || {};
        const counts: Record<string, number> = {};
        let totalVotes = 0;
        for (const v of Object.values(votes)) {
          for (const oid of Object.keys((v as any)?.options || {})) {
            counts[oid] = (counts[oid] || 0) + 1;
            totalVotes++;
          }
        }
        const options = Object.entries(poll.options || {})
          .map(([id, o]: [string, any]) => ({ ...o, id, votes: counts[id] || 0 }))
          .sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
        return {
          ...poll,
          options,
          totalVotes,
          totalVoters: Object.keys(votes).length,
          hasVoted: !!votes[myFp],
        };
      });
  }, [pollItems, votesByPoll, myFp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPoll.question.trim() || newPoll.options.filter(o => o.trim()).length < 2) return;

    const options: Record<string, { text: string; position: number }> = {};
    newPoll.options.forEach((text, i) => {
      if (text.trim()) options[`o${i}`] = { text: text.trim(), position: i };
    });

    try {
      await create({
        question: newPoll.question.trim(),
        allowMultiple: newPoll.allowMultiple,
        showResults: newPoll.showResults,
        anonymous: newPoll.anonymous,
        active: true,
        options,
      });
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la creation. Verifie ta connexion.');
      return;
    }

    setNewPoll({ question: '', options: ['', ''], allowMultiple: false, showResults: true, anonymous: true });
    setShowForm(false);
  };

  const handleVote = async (pollId: string, optionIds: string[]) => {
    if (!optionIds.length) return;
    const fp = myFp || fingerprint;
    if (votesByPoll?.[pollId]?.[fp]) return alert('Deja vote');
    const options: Record<string, true> = {};
    optionIds.forEach((oid) => (options[oid] = true));
    try {
      // Les regles Firebase refusent un 2e vote du meme appareil.
      await firebaseSet(ref(fdb, `${FB.pollVotes}/${pollId}/${fp}`), { options, createdAt: serverTimestamp() });
      setSelection((prev) => ({ ...prev, [pollId]: [] }));
    } catch (err) {
      console.error(err);
      alert('Vote impossible (deja vote ou pas de connexion).');
    }
  };

  const toggleOption = (poll: any, oid: string) => {
    setSelection((prev) => {
      const current = prev[poll.id] || [];
      if (!poll.allowMultiple) return { ...prev, [poll.id]: [oid] };
      return { ...prev, [poll.id]: current.includes(oid) ? current.filter((x) => x !== oid) : [...current, oid] };
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce sondage ?')) return;
    await firebaseUpdate(ref(fdb), { [`${FB.polls}/${id}`]: null, [`${FB.pollVotes}/${id}`]: null });
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
                const canVote = poll.active && !poll.hasVoted;
                const selected = (selection[poll.id] || []).includes(opt.id);
                return (
                  <div key={opt.id} className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      {canVote ? (
                        <label className="flex items-center gap-2 text-gray-700 cursor-pointer">
                          <input
                            type={poll.allowMultiple ? 'checkbox' : 'radio'}
                            name={`poll-${poll.id}`}
                            checked={selected}
                            onChange={() => toggleOption(poll, opt.id)}
                            className="w-4 h-4 text-blue-600"
                          />
                          {opt.text}
                        </label>
                      ) : (
                        <span className="text-gray-700">{opt.text}</span>
                      )}
                      <span className="text-sm text-gray-500">{optionVotes} vote(s) ({percent}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded overflow-hidden">
                      <div className="h-full bg-blue-600 rounded" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
              {poll.active && !poll.hasVoted && (
                <button
                  onClick={() => handleVote(poll.id, selection[poll.id] || [])}
                  disabled={!(selection[poll.id] || []).length}
                  className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  Voter
                </button>
              )}
              {poll.hasVoted && <p className="mt-2 text-sm text-green-700">✓ Tu as vote</p>}
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