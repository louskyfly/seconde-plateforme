import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { generateFingerprint } from '@/lib/utils';

export function BirthdayEntry() {
  const [date, setDate] = useState('');
  const [firstName, setFirstName] = useState('');
  const [saved, setSaved] = useState<{ date: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const fp = generateFingerprint();

  // Charger la date déjà enregistrée
  useEffect(() => {
    api.getBirthdays()
      .then(({ birthdays }) => {
        const mine = birthdays.find((b) => b.fingerprint === fp);
        if (mine) setSaved({ date: mine.date_mmdd, name: mine.first_name });
      })
      .catch(() => {});
  }, [fp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{2}-\d{2}$/.test(date)) {
      setError('Format attendu : MM-JJ (ex: 03-15)');
      return;
    }
    const [mm, dd] = date.split('-').map(Number);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
      setError('Date invalide');
      return;
    }
    const name = firstName.trim();
    if (!name) {
      setError('Prénom requis');
      return;
    }
    setSaving(true);
    try {
      await api.setMyBirthday(fp, date, name);
      setSaved({ date, name });
    } catch (err: any) {
      setError(err.message || 'Erreur serveur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass p-4 rounded-2xl">
      <h3 className="mb-3 text-base font-bold flex items-center gap-2">
        🎂 Mon anniversaire
      </h3>
      {saved ? (
        <div className="flex items-center gap-3 text-green-700 dark:text-green-300">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-medium">Enregistré : <strong>{saved.name}</strong> — <strong>{saved.date}</strong></p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Tu pourras le changer en renvoyant le formulaire.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
          <label htmlFor="bday-name" className="text-sm">
            Prénom :
          </label>
          <input
            id="bday-name"
            type="text"
            maxLength={30}
            placeholder="Léa"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-28 px-2 py-1.5 border rounded-lg bg-white/80 dark:bg-gray-800/80 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
          <label htmlFor="bday" className="text-sm">
            Date (MM-JJ) :
          </label>
          <input
            id="bday"
            type="text"
            maxLength={5}
            placeholder="03-15"
            value={date}
            onChange={(e) => {
              let v = e.target.value.replace(/\D/g, '');
              if (v.length > 2) v = v.slice(0, 2) + '-' + v.slice(2, 4);
              setDate(v);
            }}
            className="w-24 px-2 py-1.5 text-center border rounded-lg bg-white/80 dark:bg-gray-800/80 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
        </form>
      )}
      <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
        Ton prénom + ta date sont liés à ton appareil (pas de compte, pas de mot de passe).
        Le jour J, une animation apparaîtra pour tout le monde à l'ouverture du site.
      </p>
    </section>
  );
}