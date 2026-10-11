import { useState, useEffect } from 'react';
import { db, getFingerprint, now } from '../lib/db';
import { useFingerprint } from '../hooks/useFingerprint';

export default function Calendar() {
  const fingerprint = useFingerprint();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [newEvent, setNewEvent] = useState({ title: '', date: '', time: '', description: '', category: 'evenement' });

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    const evts = await db.events.toArray();
    setEvents(evts);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await db.events.add({ ...newEvent, createdAt: Date.now(), updatedAt: Date.now() });
    const evt = await db.events.get(result);
    setEvents([evt, ...events]);
    setNewEvent({ title: '', date: '', time: '', description: '', category: 'evenement' });
    setShowForm(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cet evenement ?')) return;
    await db.events.delete(id);
    setEvents(events.filter(e => e.id !== id));
  };

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const today = new Date();

  const renderDay = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const isToday = date.toDateString() === today.toDateString();
    const dayEvents = events.filter(e => e.date === date.toISOString().split('T')[0]);

    return (
      <div key={day} className={`relative min-h-[100px] p-2 border ${isToday ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'} rounded-lg`}>
        <div className={`text-sm font-medium ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>{day}</div>
        <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
          {dayEvents.map((evt: any) => {
            return (
              <div key={evt.id} className="text-xs p-1 rounded bg-blue-100 text-blue-800 truncate">
                {evt.time ? `${evt.time} ` : ''}{evt.title}
              </div>
            );
          })}
</div>
    </div>
  );
};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Calendrier</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-2 hover:bg-gray-100 rounded-lg">\u2039</button>
          <h2 className="text-xl font-semibold mx-4">{currentMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h2>
          <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-2 hover:bg-gray-100 rounded-lg">\u203A</button>
          <button onClick={() => setShowForm(true)} className="ml-4 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">+ Evenement</button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
          <h3 className="text-lg font-semibold mb-4">Nouvel evenement</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titre</label>
              <input type="text" value={newEvent.title} onChange={(e) => setNewEvent({...newEvent, title: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg" required />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={newEvent.date} onChange={(e) => setNewEvent({...newEvent, date: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Heure (optionnel)</label>
                <input type="time" value={newEvent.time} onChange={(e) => setNewEvent({...newEvent, time: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categorie</label>
              <select value={newEvent.category} onChange={(e) => setNewEvent({...newEvent, category: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg">
                <option value="evenement">Evenement</option>
                <option value="devoir">Devoir</option>
                <option value="examen">Examen</option>
                <option value="reunion">Reunion</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={newEvent.description} onChange={(e) => setNewEvent({...newEvent, description: e.target.value})} rows={3} className="w-full p-3 border border-gray-300 rounded-lg" />
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
              <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700">Creer</button>
            </div>
          </div>
        </form>
      )}

      <div className="grid grid-cols-7 gap-1">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day, i) => (
          <div key={i} className="text-center text-sm font-medium text-gray-500 py-2 bg-gray-50 rounded-t-lg">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-50 rounded-b-lg" />
        ))}
        {days.map(renderDay)}
      </div>
    </div>
  );
}