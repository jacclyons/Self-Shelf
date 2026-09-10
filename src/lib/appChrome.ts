import { Appearance } from 'react-native';
import * as SystemUI from 'expo-system-ui';

import type { AppearanceChoice, Scheme } from '@/state/appearance';

/**
 * Pushes the chosen appearance out to the parts of the app React does not
 * paint: the window background behind the root view, and the native controls
 * (tab bar, sheets, keyboard, form widgets) that otherwise follow the OS and
 * would stay dark under a Light override.
 *
 * `unspecified` hands control back to the system, which is what `system` means — and
 * it matters that this is not the resolved scheme, or `useColorScheme` would be
 * pinned to whatever the OS happened to be at the time and stop updating.
 *
 * See `appChrome.web.ts` for the browser equivalent.
 */
export function applyAppChrome(scheme: Scheme, background: string, choice: AppearanceChoice) {
  Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice);
  void scheme;

  SystemUI.setBackgroundColorAsync(background).catch(() => {
    // Cosmetic only: the app paints its own background regardless.
  });
}
