import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

interface LoginProps {
  token?: string;
}

function Login({ token = '' }: LoginProps) {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(!!token);
  const [linkValid, setLinkValid] = useState(!token);

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(password, token || undefined);
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
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Accès réservé au délégué</p>

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

        {!checkingLink && linkValid && (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                className="glass-input"
                autoFocus
                required
              />

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
                ) : (
                  'Se connecter'
                )}
              </button>
            </form>

            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
              Cet espace est confidentiel et réservé au délégué.
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