import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import {
  accentById,
  CUSTOM_ACCENT_ID,
  DEFAULT_ACCENT,
  isHex,
  type Accent,
} from '@/ui/accents';
import { kvGet, kvSet } from './db';

/** What the user asked for; `system` defers to the OS or the browser. */
export type AppearanceChoice = 'system' | 'light' | 'dark';

/** What that resolves to right now. */
export type Scheme = 'light' | 'dark';

const KEY = 'appearance.v1';
const ACCENT_KEY = 'accent.v1';
const CUSTOM_KEY = 'accent.custom.v1';

interface AppearanceState {
  choice: AppearanceChoice;
  scheme: Scheme;
  setChoice(next: AppearanceChoice): void;
  accent: Accent;
  setAccent(id: string): void;
  /** The last colour picked for the custom accent, kept while a preset is chosen. */
  customColor: string | null;
  /** Picks `#RRGGBB` as the accent. Called repeatedly while the user drags in a picker. */
  setCustomColor(hex: string): void;
}

const AppearanceContext = createContext<AppearanceState | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  // Read straight from SQLite: the root layout holds the splash screen until
  // the database is open, so the first paint already has the right theme.
  const [choice, setChoiceState] = useState<AppearanceChoice>(() => {
    const stored = kvGet<AppearanceChoice>(KEY, 'system');
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  });
  const [accentId, setAccentId] = useState(() => kvGet<string>(ACCENT_KEY, DEFAULT_ACCENT.id));
  const [customColor, setCustomColorState] = useState(() => kvGet<string | null>(CUSTOM_KEY, null));
  const accent = useMemo(() => accentById(accentId, customColor), [accentId, customColor]);

  const system = useColorScheme();

  const setChoice = useCallback((next: AppearanceChoice) => {
    setChoiceState(next);
    kvSet(KEY, next);
  }, []);

  const setAccent = useCallback((id: string) => {
    setAccentId(id);
    kvSet(ACCENT_KEY, id);
  }, []);

  const setCustomColor = useCallback((hex: string) => {
    if (!isHex(hex)) return;
    const color = hex.toUpperCase();
    setCustomColorState(color);
    setAccentId(CUSTOM_ACCENT_ID);
    kvSet(CUSTOM_KEY, color);
    kvSet(ACCENT_KEY, CUSTOM_ACCENT_ID);
  }, []);

  const value = useMemo<AppearanceState>(
    () => ({
      choice,
      scheme: choice === 'system' ? (system === 'dark' ? 'dark' : 'light') : choice,
      setChoice,
      accent,
      setAccent,
      customColor,
      setCustomColor,
    }),
    [choice, system, setChoice, accent, setAccent, customColor, setCustomColor],
  );

  return <AppearanceContext value={value}>{children}</AppearanceContext>;
}

/**
 * Paints everything inside it in one scheme, whatever the Appearance setting
 * says. The walkthrough and sign-in use it so a new user's first look at the
 * app is the light, papery one even on a phone set to dark. Only the resolved
 * scheme changes; the preference, the accent and the setters pass straight through.
 */
export function FixedScheme({ scheme, children }: { scheme: Scheme; children: ReactNode }) {
  const outer = useAppearance();
  const value = useMemo(() => ({ ...outer, scheme }), [outer, scheme]);
  return <AppearanceContext value={value}>{children}</AppearanceContext>;
}

/** The preferences and their setters, for the controls in Settings. */
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

/** The chosen accent, or the default when no provider is above it. */
export function useResolvedAccent(): Accent {
  return use(AppearanceContext)?.accent ?? DEFAULT_ACCENT;
}
