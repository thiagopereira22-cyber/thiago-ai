'use client';

import { useEffect, useState, useCallback } from 'react';
import { AuthContext } from '@/hooks/auth-context';
import type { AuthContextValue } from '@/hooks/auth-context';
import { authService } from '@/services/auth-service';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthContextValue['user']>(null);
  const [profile, setProfile] = useState<AuthContextValue['profile']>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid: string) => {
    const data = await authService.getProfile(uid);
    setProfile(data);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  useEffect(() => {
    let active = true;

    (async () => {
      const currentUser = await authService.getCurrentUser();
      if (!active) return;
      setUser(currentUser);
      if (currentUser) await loadProfile(currentUser.id);
      setLoading(false);
    })();

    const { data: subscription } = authService.onAuthStateChange(
      (event, session) => {
        if (!active) return;
        setUser(session?.user ?? null);
        if (session?.user) {
          (async () => {
            await loadProfile(session.user.id);
          })();
        } else {
          setProfile(null);
        }
        if (event === 'SIGNED_OUT') {
          setLoading(false);
        }
      }
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await authService.signOut();
    setUser(null);
    setProfile(null);
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}
