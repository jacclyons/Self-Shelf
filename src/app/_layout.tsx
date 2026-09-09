import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { hasSeenOnboarding } from '@/lib/onboarding';
import { AuthProvider, useAuth } from '@/state/auth';
import { useTheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

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
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="welcome" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
