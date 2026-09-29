import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { cleanFirstName, getFirstName, isValidFirstName, setFirstName } from '@/lib/utils';

/** Résout le prénom saisi, ou `null` si l'élève a annulé. */
type Pending = { label: string; resolve: (name: string | null) => void } | null;

/**
 * Demande le prénom de l'élève avant une publication.
 *
 * Le prénom est la seule identité affichée à la classe : ni nom de famille,
 * ni classe, ni email. Il n'est demandé qu'au moment de publier, pas à la
 * première connexion, pour ne pas bloquer un élève qui veut seulement
 * consulter le site.
 */
export function useFirstNamePrompt() {
  const [firstName, setFirstNameState] = useState(() => getFirstName());
  const [pending, setPending] = useState<Pending>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  /**
   * Renvoie le prénom, ou ouvre la saisie. À appeler juste avant l'envoi :
   * `await ensure()` bloque jusqu'à ce que l'élève ait répondu.
   */
  const ensure = (label: string): Promise<string | null> => {
    const existing = getFirstName();
    if (isValidFirstName(existing)) {
      setFirstNameState(existing);
      return Promise.resolve(existing);
    }
    setDraft('');
    setError('');
    return new Promise((resolve) => setPending({ label, resolve }));
  };

  const confirm = () => {
    if (!pending) return;
    const name = cleanFirstName(draft);
    if (!isValidFirstName(name)) {
      setError('Écris un seul prénom (sans nom de famille).');
      return;
    }
    const { resolve } = pending;
    setPending(null);
    setFirstName(name);
    setFirstNameState(name);
    resolve(name);
  };

  // Annuler vaut abandon de la publication : on résout par `null` pour que
  // l'appelant puisse arrêter d'attendre et ne rien envoyer.
  const cancel = () => {
    const { resolve } = pending || { resolve: null };
    setPending(null);
    resolve?.(null);
  };

  const dialog = (
    <Modal isOpen={pending !== null} onClose={cancel} title="Ton prénom">
      <div className="space-y-4">
        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
          {pending?.label}
        </p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Ton prénom sera le seul nom visible par la classe. Ni nom de famille, ni email.
        </p>

        <div>
          <label htmlFor="first-name" className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            Prénom
          </label>
          <input
            id="first-name"
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirm();
              }
            }}
            placeholder="Ton prénom"
            autoComplete="given-name"
            maxLength={30}
            className="glass-input mt-1"
            autoFocus
          />
          {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
        </div>

        <button
          type="button"
          onClick={confirm}
          disabled={!isValidFirstName(cleanFirstName(draft))}
          className="w-full py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 transition-all disabled:opacity-50"
        >
          Continuer
        </button>
      </div>
    </Modal>
  );

  return { firstName, ensure, dialog };
}
