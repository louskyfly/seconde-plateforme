import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '@/lib/api';

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

  useEffect(() => {
    api.checkAuth()
      .then((d) => setIsAuthenticated(d.authenticated))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (password: string, token?: string) => {
    await api.login(password, token);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
