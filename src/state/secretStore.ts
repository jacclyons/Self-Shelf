import * as SecureStore from 'expo-secure-store';

/**
 * Where the session token lives. On device this is the keychain.
 * See `secretStore.web.ts` for the browser, which cannot offer the same.
 */
export function getSecret(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export function setSecret(key: string, value: string): Promise<void> {
  return SecureStore.setItemAsync(key, value);
}

export function deleteSecret(key: string): Promise<void> {
  return SecureStore.deleteItemAsync(key);
}
