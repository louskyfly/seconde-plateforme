import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { authReady, isAuthAvailable } from '@/lib/auth';

interface LoginProps {
  token?: string;
  /** Rappel affiché quand une écriture a échoué parce que la session avait expiré. */
  sessionExpired?: boolean;
}

function Login({ token = '', sessionExpired = false }: LoginProps) {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(!!token);
  const [linkValid, setLinkValid] = useState(!token);

  /** null tant qu'on ne sait pas si Firebase Auth est actif. */
  const [authOn, setAuthOn] = useState<boolean | null>(null);
  /** Un compte délégué existe-t-il déjà ? (mode Firebase Auth) */
  const [hasAccount, setHasAccount] = useState(true);

  useEffect(() => {
    let alive = true;
    authReady.then(() => {
      if (!alive) return;
      const on = isAuthAvailable();
      setAuthOn(on);
      if (on) {
        api
          .delegateAccountExists()
          .then((exists) => alive && setHasAccount(exists))
          .catch(() => alive && setHasAccount(true));
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setLinkValid(false);
      setCheckingLink(false);
      setError('');
      return;
    }
    setCheckingLink(true);
    setError('');
    api.validateToken(token)
      .then((d) => {
        setLinkValid(d.valid);
        if (!d.valid) {
          setError('Lien d\u0027accès invalide ou expiré');
        }
      })
      .catch(() => {
        setLinkValid(false);
        setError('Impossible de vérifier le lien');
      })
      .finally(() => setCheckingLink(false));
  }, [token]);

  const setup = authOn === true && !hasAccount;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (authOn === true) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError('Adresse e-mail invalide');
        return;
      }
      if (setup) {
        if (password.length < 8) {
          setError('Le mot de passe doit faire au moins 8 caractères');
          return;
        }
        if (password !== confirm) {
          setError('Les deux mots de passe ne correspondent pas');
          return;
        }
      }
    }
    setLoading(true);
    try {
      if (setup) {
        await api.setupDelegate(email, password, token);
        // Le compte vient d'être créé : on ouvre la session tout de suite.
        await login(password, token, email);
      } else {
        await login(password, token, authOn === true ? email : undefined);
      }
    } catch (err: any) {
      setError(err.message || 'Mot de passe incorrect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-sm text-center">
        <div className="text-5xl mb-4">🔐</div>
        <h1 className="text-2xl font-bold mb-1">Espace Délégué</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {setup ? 'Première configuration du compte délégué' : 'Accès réservé au délégué'}
        </p>

        {checkingLink && (
          <div className="flex items-center justify-center gap-3 py-6 text-sm text-gray-500 dark:text-gray-400">
            <span className="inline-block w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            Vérification du lien…
          </div>
        )}

        {!checkingLink && !linkValid && (
          <>
            <div className="text-sm py-4 text-red-500 dark:text-red-400">
              {error || 'Lien d\u0027accès invalide ou expiré'}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Vérifiez que vous utilisez le lien privé fourni par le délégué.
            </p>
          </>
        )}

        {!checkingLink && linkValid && authOn === null && (
          <div className="flex items-center justify-center gap-3 py-6 text-sm text-gray-500 dark:text-gray-400">
            <span className="inline-block w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            Préparation de la connexion…
          </div>
        )}

        {!checkingLink && linkValid && authOn !== null && (
          <>
            {sessionExpired && (
              <div className="mb-4 rounded-xl border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Ta session a expiré. Reconnecte-toi pour continuer.
              </div>
            )}

            {setup && (
              <div className="mb-4 rounded-xl border border-indigo-300/50 bg-indigo-500/10 px-3 py-2 text-left text-xs text-indigo-700 dark:text-indigo-300">
                Aucun compte délégué n'existe encore. Crée-le maintenant : cet e-mail et ce mot
                de passe serviront à te connecter depuis n'importe quel appareil.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              {authOn === true && (
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-mail du délégué"
                  className="glass-input"
                  autoComplete="email"
                  autoFocus
                  required
                />
              )}

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={setup ? 'Choisis un mot de passe (8 caractères min.)' : 'Mot de passe'}
                className="glass-input"
                autoComplete={setup ? 'new-password' : 'current-password'}
                autoFocus={authOn !== true}
                required
              />

              {setup && (
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirme le mot de passe"
                  className="glass-input"
                  autoComplete="new-password"
                  required
                />
              )}

              {error && (
                <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="glass-button-primary w-full"
              >
                {loading ? (
                  <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : setup ? (
                  'Créer le compte délégué'
                ) : (
                  'Se connecter'
                )}
              </button>
            </form>

            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
              {authOn === true
                ? 'Connexion sécurisée par Firebase Authentication.'
                : 'Cet espace est confidentiel et réservé au délégué.'}
            </p>
          </>
        )}
      </div>
      <p className="mt-6 text-[10px] text-gray-300 dark:text-gray-600">
        Créé et déployé par Lucas Sanchez
      </p>
    </div>
  );
}

export default Login;
