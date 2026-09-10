import * as Crypto from 'expo-crypto';
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';

import { deleteSecret, getSecret, setSecret } from './secretStore';
import {
  authenticateByName,
  authenticateWithQuickConnect,
  JellyfinError,
  normalizeServerUrl,
  probeServer,
  type Session,
} from '@/api/client';

const SESSION_KEY = 'jellyshelf.session.v1';
const DEVICE_KEY = 'jellyshelf.deviceId.v1';

async function getDeviceId(): Promise<string> {
  const existing = await getSecret(DEVICE_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await setSecret(DEVICE_KEY, id);
  return id;
}

interface AuthState {
  session: Session | null;
  restoring: boolean;
  signIn(serverUrl: string, username: string, password: string): Promise<void>;
  signInWithQuickConnect(serverUrl: string, secret: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await getSecret(SESSION_KEY);
        if (!cancelled && raw) setSession(JSON.parse(raw) as Session);
      } catch {
        // A corrupt keychain entry should never wedge the app at a blank screen.
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: Session | null) => {
    setSession(next);
    if (next) await setSecret(SESSION_KEY, JSON.stringify(next));
    else await deleteSecret(SESSION_KEY);
  }, []);

  const signIn = useCallback<AuthState['signIn']>(
    async (serverUrlInput, username, password) => {
      const serverUrl = normalizeServerUrl(serverUrlInput);
      const deviceId = await getDeviceId();
      const info = await probeServer(serverUrl, deviceId);
      const result = await authenticateByName(serverUrl, deviceId, username.trim(), password);
      if (!result.AccessToken || !result.User?.Id) {
        throw new JellyfinError('Incorrect username or password.');
      }
      await persist({
        serverUrl,
        deviceId,
        token: result.AccessToken,
        userId: result.User.Id,
        userName: result.User.Name ?? username,
        serverName: info.ServerName ?? undefined,
      });
    },
    [persist],
  );

  const signInWithQuickConnect = useCallback<AuthState['signInWithQuickConnect']>(
    async (serverUrlInput, secret) => {
      const serverUrl = normalizeServerUrl(serverUrlInput);
      const deviceId = await getDeviceId();
      const info = await probeServer(serverUrl, deviceId);
      const result = await authenticateWithQuickConnect(serverUrl, deviceId, secret);
      if (!result.AccessToken || !result.User?.Id) {
        throw new JellyfinError('Quick Connect was not approved.');
      }
      await persist({
        serverUrl,
        deviceId,
        token: result.AccessToken,
        userId: result.User.Id,
        userName: result.User.Name ?? 'Reader',
        serverName: info.ServerName ?? undefined,
      });
    },
    [persist],
  );

  const signOut = useCallback(() => persist(null), [persist]);

  const value = useMemo<AuthState>(
    () => ({ session, restoring, signIn, signInWithQuickConnect, signOut }),
    [session, restoring, signIn, signInWithQuickConnect, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For screens that are only reachable behind the auth gate. */
export function useSession(): Session {
  const { session } = useAuth();
  if (!session) throw new Error('No active session');
  return session;
}

export { getDeviceId };
