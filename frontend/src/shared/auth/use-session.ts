import { useEffect, useState } from 'react';
import { getSessionUser, onAuthStateChange } from './cognito-auth';

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
export interface Session {
  user: SessionUser;
}

/** Sesión actual con la forma que suele usar la UI: `{ user: { email, ... } }` o null. */
export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      getSessionUser().then((user) => {
        if (active) setSession(user ? { user } : null);
      });
    refresh();
    const unsubscribe = onAuthStateChange(() => refresh());
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return session;
}
