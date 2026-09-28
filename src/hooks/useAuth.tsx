import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, SESSION_EXPIRED_EVENT } from '@/lib/api';

interface AuthContextType {
  isAuthenticated: boolean;
  loading: boolean;
  login: (password: string, token?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const verify = useCallback(() => {
    return api
      .checkAuth()
      .then((d) => setIsAuthenticated(d.authenticated))
      .catch(() => setIsAuthenticated(false))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    verify();
  }, [verify]);

  /*
   * Le serveur redémarre (Render le fait régulièrement sur le plan gratuit) et
   * le store de session en mémoire est vidé. Le client, lui, croyait toujours
   * être connecté : toutes les écritures renvoyaient 401. Dès qu'une écriture
   * échoue sur 401, on repasse en « non connecté » pour réafficher l'écran de
   * connexion plutôt que de laisser l'utilisateur devant une page morte.
   */
  useEffect(() => {
    const onExpired = () => setIsAuthenticated(false);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  // Revérifie la session au retour sur l'onglet : c'est là que le redémarrage
  // du serveur est le plus probable.
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === 'visible' && !loading) verify();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [verify, loading]);

  const login = useCallback(async (password: string, token?: string) => {
    await api.login(password, token);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setIsAuthenticated(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
