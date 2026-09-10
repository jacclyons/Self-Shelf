import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { kvGet, kvSet } from './db';

/** What the user asked for; `system` defers to the OS or the browser. */
export type AppearanceChoice = 'system' | 'light' | 'dark';

/** What that resolves to right now. */
export type Scheme = 'light' | 'dark';

const KEY = 'appearance.v1';

interface AppearanceState {
  choice: AppearanceChoice;
  scheme: Scheme;
  setChoice(next: AppearanceChoice): void;
}

const AppearanceContext = createContext<AppearanceState | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  // Read straight from SQLite: the root layout holds the splash screen until
  // the database is open, so the first paint already has the right theme.
  const [choice, setChoiceState] = useState<AppearanceChoice>(() => {
    const stored = kvGet<AppearanceChoice>(KEY, 'system');
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  });

  const system = useColorScheme();

  const setChoice = useCallback((next: AppearanceChoice) => {
    setChoiceState(next);
    kvSet(KEY, next);
  }, []);

  const value = useMemo<AppearanceState>(
    () => ({
      choice,
      scheme: choice === 'system' ? (system === 'dark' ? 'dark' : 'light') : choice,
      setChoice,
    }),
    [choice, system, setChoice],
  );

  return <AppearanceContext value={value}>{children}</AppearanceContext>;
}

/** The preference and the setter, for the control in Settings. */
export function useAppearance(): AppearanceState {
  const value = use(AppearanceContext);
  if (!value) throw new Error('useAppearance must be used inside AppearanceProvider.');
  return value;
}

/**
 * The scheme to paint with. Falls back to the system when no provider is above
 * it, so a component rendered outside the app shell still themes sensibly.
 */
export function useResolvedScheme(): Scheme {
  const value = use(AppearanceContext);
  const system = useColorScheme();
  if (value) return value.scheme;
  return system === 'dark' ? 'dark' : 'light';
}
