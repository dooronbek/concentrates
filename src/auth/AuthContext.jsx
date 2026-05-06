import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getCurrentSession,
  login as loginApi,
  logout as logoutApi,
  subscribeAuthChanges,
} from '../api/db.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    let cancelled = false;

    getCurrentSession()
      .then((current) => {
        if (cancelled) return;
        setSession(current);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setSession(null);
        setReady(true);
      });

    const unsubscribe = subscribeAuthChanges((next) => {
      if (cancelled) return;
      setSession(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (password) => {
    const next = await loginApi(password);
    setSession(next);
    return next;
  }, []);

  const logout = useCallback(async () => {
    await logoutApi();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      role: session?.role ?? null,
      isAuthenticated: !!session,
      login,
      logout,
    }),
    [ready, session, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
