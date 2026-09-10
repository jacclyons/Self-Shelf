import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { applyAppChrome } from '@/lib/appChrome';
import { hasSeenOnboarding } from '@/lib/onboarding';
import { installWebChrome } from '@/lib/webChrome';
import { AppearanceProvider, useAppearance } from '@/state/appearance';
import { AuthProvider, useAuth } from '@/state/auth';
import { initDatabase } from '@/state/db';
import { palettes, useTheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

/** Behind the always-light screens, so a fade in or out never shows the dark ground. */
const lightScreen = { backgroundColor: palettes.light.bg };
installWebChrome();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      gcTime: 30 * 60_000,
    },
  },
});

function RootNavigator() {
  const { session, restoring } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const theme = useTheme();
  const { choice, scheme } = useAppearance();

  // Sign-in and the first-run walkthrough are always light (see `FixedScheme`),
  // so while one of them fills the screen the status bar and native chrome match
  // it. A walkthrough replayed from Settings opens over the signed-in app, so it
  // leaves the chrome alone rather than flipping what is underneath.
  const lightOnly = segments[0] === 'sign-in' || (segments[0] === 'welcome' && !session);
  const chromeScheme = lightOnly ? 'light' : scheme;

  // Keep the surfaces React does not own in step with the chosen appearance.
  useEffect(() => {
    applyAppChrome(chromeScheme, palettes[chromeScheme].bg, lightOnly ? 'light' : choice);
  }, [chromeScheme, lightOnly, choice]);

  useEffect(() => {
    if (restoring) return;
    SplashScreen.hideAsync();

    const onWelcome = segments[0] === 'welcome';
    const onAuthScreen = segments[0] === 'sign-in';

    if (!session) {
      // First run gets the walkthrough; every run after it goes straight to sign-in.
      if (!hasSeenOnboarding()) {
        if (!onWelcome) router.replace('/welcome');
      } else if (!onAuthScreen) {
        router.replace('/sign-in');
      }
    } else if (onAuthScreen) {
      // `welcome` is deliberately not evicted here: Settings can replay it while
      // signed in, and it closes itself rather than being bounced mid-animation.
      router.replace('/');
    }
  }, [restoring, session, segments, router]);

  return (
    <>
      <StatusBar style={chromeScheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="welcome"
          options={{ animation: 'fade', gestureEnabled: false, contentStyle: lightScreen }}
        />
        <Stack.Screen name="sign-in" options={{ animation: 'fade', contentStyle: lightScreen }} />
        <Stack.Screen
          name="book/[id]"
          options={{ presentation: 'modal', sheetGrabberVisible: true }}
        />
        <Stack.Screen
          name="reader/[id]"
          options={{
            presentation: 'fullScreenModal',
            animation: 'fade',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  // The whole tree reads SQLite synchronously, so nothing may mount until the
  // database is open. The splash screen is still up, so this is invisible.
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initDatabase().then(
      () => setDbReady(true),
      (error) => {
        console.error('Could not open the local database.', error);
        setDbReady(true);
      },
    );
  }, []);

  if (!dbReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppearanceProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </QueryClientProvider>
        </AppearanceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
