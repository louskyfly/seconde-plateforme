import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../lib/db';
import { verifyPassword } from '../utils/password';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: Location })?.from?.pathname || '/admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const settings = await db.settings.get(1);
      if (!settings) {
        setError('Configuration manquante');
        return;
      }

      const valid = await verifyPassword(password, settings.passwordHash);
      if (!valid) {
        setError('Mot de passe incorrect');
        return;
      }

      sessionStorage.setItem('admin_authenticated', 'true');
      navigate(from, { replace: true });
    } catch (e) {
      console.error('Login error:', e);
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔐</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Connexion délégué</h1>
          <p className="text-gray-600 mt-2">Entrez votre mot de passe pour accéder à l'administration</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm" role="alert">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Les données sont stockées localement sur votre appareil (IndexedDB).
        </p>
      </div>
    </div>
  );
}