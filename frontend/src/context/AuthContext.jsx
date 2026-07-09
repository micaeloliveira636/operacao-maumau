import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setAccessToken, setOnUnauthorized } from '../lib/api';
import { registrarServiceWorker } from '../lib/push';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const aplicarSessao = useCallback((data) => {
    setAccessToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignora */
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  // Logout global quando o refresh falha (token/refresh inválidos)
  useEffect(() => {
    setOnUnauthorized(() => {
      setAccessToken(null);
      setUser(null);
    });
  }, []);

  // Tenta restaurar sessão via cookie httpOnly (refresh) ao carregar
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const data = await api.refresh();
        if (vivo && data?.user) {
          setUser(data.user);
        }
      } catch {
        /* sem sessão */
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    registrarServiceWorker();
    return () => {
      vivo = false;
    };
  }, []);

  const login = useCallback(
    async (email, senha) => {
      const data = await api.post('/auth/login', { email, senha });
      aplicarSessao(data);
      return data.user;
    },
    [aplicarSessao]
  );

  const value = {
    user,
    carregando,
    isAdmin: user?.role === 'admin',
    login,
    logout,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
