/**
 * Browser twin of `secretStore.ts`.
 *
 * expo-secure-store ships an empty object on web, and there is no keychain to
 * stand in for it: `localStorage` is readable by any script running on this
 * origin. That is the same exposure as every other web client for a
 * self-hosted server, but it is a real step down from the device build, so
 * it is worth being explicit that "secret" here means "not in the URL".
 */
export function getSecret(key: string): Promise<string | null> {
  try {
    return Promise.resolve(window.localStorage.getItem(key));
  } catch {
    // Private browsing and blocked site data both throw on access.
    return Promise.resolve(null);
  }
}

export function setSecret(key: string, value: string): Promise<void> {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Nothing persists this session; the user signs in again next time.
  }
  return Promise.resolve();
}

export function deleteSecret(key: string): Promise<void> {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Already unreachable, which is the state we wanted.
  }
  return Promise.resolve();
}
