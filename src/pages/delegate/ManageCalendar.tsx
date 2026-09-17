import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import type { Event } from '@/types';
import { formatDate, EVENT_CATEGORIES } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';

interface EventFormProps {
  event: Event | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function EventForm({ event, isOpen, onClose, onSaved }: EventFormProps) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('autre');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setTitle('');
    setDate('');
    setTime('');
    setDescription('');
    setCategory('autre');
    setError('');
  };

  useEffect(() => {
    if (!event) {
      reset();
      return;
    }
    setTitle(event.title);
    setDate(event.date.split('T')[0]);
    setTime(event.time || '');
    setDescription(event.description);
    setCategory(event.category);
    setError('');
  }, [event, isOpen]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = { title, date, time: time || null, description, category };
    try {
      if (event) {
        await api.updateEvent(event.id, payload);
      } else {
        await api.createEvent(payload);
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
    <Modal isOpen={isOpen} onClose={onClose} title={event ? "Modifier l'événement" : 'Ajouter un événement'}>
      <form onSubmit={submit} className="space-y-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titre de l'événement"
          className="glass-input"
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="glass-input"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
              Heure
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="glass-input"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
            Catégorie
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="glass-input"
          >
            {Object.entries(EVENT_CATEGORIES).map(([key, v]) => (
              <option key={key} value={key}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description..."
          rows={3}
          className="glass-input resize-none"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={busy} className="glass-button-primary w-full">
          {busy ? 'Enregistrement...' : event ? 'Enregistrer' : 'Ajouter'}
        </button>
      </form>
    </Modal>
  );
}

interface ConfirmDialogProps {
  event: Event | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDialog({ event, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <Modal isOpen={!!event} onClose={onCancel} title="Supprimer l'événement">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
        Voulez-vous vraiment supprimer cet événement ? Cette action est irréversible.
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

export function ManageCalendar() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);
  const [toDelete, setToDelete] = useState<Event | null>(null);

  const load = () => {
    setLoading(true);
    api.getEvents()
      .then(setEvents)
      .catch((err: any) => setError(err.message || 'Erreur'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const grouped = useMemo(() => {
    const sorted = [...events].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const map: Record<string, Event[]> = {};
    for (const e of sorted) {
      const key = e.date.split('T')[0].slice(0, 7);
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }
    return map;
  }, [events]);

  const isPast = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setHours(23, 59, 59, 999);
    return d.getTime() < Date.now();
  };

  const monthLabel = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await api.deleteEvent(toDelete.id);
      setToDelete(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Erreur');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Calendrier</h1>
        <button onClick={() => { setEditing(null); setShowCreate(true); }} className="glass-button-primary text-sm">
          + Ajouter un événement
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
      ) : events.length === 0 ? (
        <div className="glass-card text-center py-12">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-gray-500 dark:text-gray-400">Aucun événement</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([key, list]) => (
            <section key={key}>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 capitalize">
                {monthLabel(key)}
              </h2>
              <div className="space-y-3">
                {list.map((e) => {
                  const past = isPast(e.date);
                  return (
                    <div key={e.id} className={`glass-card ${past ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <span className="text-2xl flex-shrink-0">
                            {EVENT_CATEGORIES[e.category]?.split(' ')[0]}
                          </span>
                          <div className="min-w-0">
                            <h3 className={`font-semibold ${past ? 'line-through decoration-gray-400' : ''}`}>
                              {e.title}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {formatDate(e.date)}
                              {e.time ? ` · ${e.time}` : ''} · {EVENT_CATEGORIES[e.category] || e.category}
                            </p>
                            {e.description && (
                              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1.5">
                                {e.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => { setEditing(e); setShowCreate(true); }}
                            className="glass-button text-xs px-3 py-2"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => setToDelete(e)}
                            className="glass-button text-xs px-3 py-2 bg-red-500/90 text-white border-red-400/30"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <EventForm
        event={editing}
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={load}
      />
      <ConfirmDialog
        event={toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default ManageCalendar;