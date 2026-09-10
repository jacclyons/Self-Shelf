import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  JellyfinError,
  normalizeServerUrl,
  probeServer,
  quickConnectEnabled,
  quickConnectInitiate,
  quickConnectPoll,
} from '@/api/client';
import { FixedScheme } from '@/state/appearance';
import { getDeviceId, useAuth } from '@/state/auth';
import { Icon } from '@/ui/Bits';
import { GlassSurface } from '@/ui/Glass';
import { FullLogo } from '@/ui/Logo';
import { Press } from '@/ui/Press';
import { radius, readingColumn, shelf, type as type_, useTheme } from '@/ui/theme';

type Step = 'server' | 'credentials';

/** Always light, like the walkthrough before it; `_layout` matches the chrome. */
export default function SignIn() {
  return (
    <FixedScheme scheme="light">
      <SignInForm />
    </FixedScheme>
  );
}

function SignInForm() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, signInWithQuickConnect } = useAuth();

  const [step, setStep] = useState<Step>('server');
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [quickCode, setQuickCode] = useState<string | null>(null);
  const [quickAvailable, setQuickAvailable] = useState(false);
  const quickTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopQuickConnect = useCallback(() => {
    if (quickTimer.current) clearInterval(quickTimer.current);
    quickTimer.current = null;
    setQuickCode(null);
  }, []);

  useEffect(() => stopQuickConnect, [stopQuickConnect]);

  const connectToServer = useCallback(async () => {
    Keyboard.dismiss();
    setError(null);
    setBusy(true);
    try {
      const url = normalizeServerUrl(server);
      const deviceId = await getDeviceId();
      await probeServer(url, deviceId);
      setServer(url);
      setStep('credentials');
      try {
        setQuickAvailable(await quickConnectEnabled(url, deviceId));
      } catch {
        setQuickAvailable(false);
      }
    } catch (e) {
      setError(e instanceof JellyfinError ? e.message : "Couldn't reach that server.");
    } finally {
      setBusy(false);
    }
  }, [server]);

  const submitCredentials = useCallback(async () => {
    Keyboard.dismiss();
    setError(null);
    setBusy(true);
    try {
      await signIn(server, username, password);
      router.replace('/');
    } catch (e) {
      setError(e instanceof JellyfinError ? e.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }, [password, router, server, signIn, username]);

  const startQuickConnect = useCallback(async () => {
    setError(null);
    try {
      const deviceId = await getDeviceId();
      const result = await quickConnectInitiate(server, deviceId);
      if (!result.Secret || !result.Code) throw new JellyfinError('Quick Connect is unavailable.');
      setQuickCode(result.Code);

      quickTimer.current = setInterval(async () => {
        try {
          const poll = await quickConnectPoll(server, deviceId, result.Secret!);
          if (poll.Authenticated) {
            stopQuickConnect();
            setBusy(true);
            await signInWithQuickConnect(server, result.Secret!);
            router.replace('/');
          }
        } catch {
          stopQuickConnect();
          setError('Quick Connect expired. Try again.');
        }
      }, 3000);
    } catch (e) {
      setError(e instanceof JellyfinError ? e.message : 'Quick Connect is unavailable.');
    }
  }, [router, server, signInWithQuickConnect, stopQuickConnect]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <LinearGradient
        colors={
          theme.scheme === 'dark'
            ? ['#0E2326', '#0C0B0E', '#0C0B0E']
            : ['#E3E9E3', '#F7F3EC', '#F7F3EC']
        }
        locations={[0, 0.55, 1]}
        style={{ position: 'absolute', inset: 0 }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            readingColumn,
            {
              flexGrow: 1,
              justifyContent: 'center',
              paddingHorizontal: 28,
              paddingTop: insets.top + 40,
              paddingBottom: insets.bottom + 40,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInDown.duration(600).springify()} style={{ marginBottom: 36, alignItems: 'center' }}>
            <FullLogo />
          </Animated.View>

          {step === 'server' ? (
            <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(150)}>
              <Field
                icon="server.rack"
                value={server}
                onChangeText={setServer}
                placeholder="jellyfin.home.lan:8096"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textContentType="URL"
                returnKeyType="go"
                onSubmitEditing={connectToServer}
              />
              <PrimaryButton
                label="Continue"
                busy={busy}
                disabled={!server.trim()}
                onPress={connectToServer}
              />
              <Text
                style={[
                  type_.footnote,
                  { color: theme.textTertiary, textAlign: 'center', marginTop: 16 },
                ]}
              >
                Include http:// or https:// if your server uses a custom port or scheme.
              </Text>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.duration(320).springify()}>
              {quickCode ? (
                <QuickConnectCard code={quickCode} onCancel={stopQuickConnect} />
              ) : (
                <>
                  <Field
                    label="Username"
                    icon="person"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="username"
                    returnKeyType="next"
                  />
                  <Field
                    label="Password"
                    icon="lock"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={submitCredentials}
                  />
                  <PrimaryButton
                    label="Sign In"
                    busy={busy}
                    disabled={!username.trim()}
                    onPress={submitCredentials}
                  />

                  {quickAvailable ? (
                    <Press onPress={startQuickConnect} style={{ marginTop: 14 }} haptic="selection">
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          paddingVertical: 14,
                        }}
                      >
                        <Icon name="qrcode" size={16} color={theme.tint} />
                        <Text style={[type_.subhead, { color: theme.tint, fontWeight: '600' }]}>
                          Use Quick Connect instead
                        </Text>
                      </View>
                    </Press>
                  ) : null}
                </>
              )}

              <Press
                onPress={() => {
                  stopQuickConnect();
                  setStep('server');
                  setError(null);
                }}
                haptic="selection"
                style={{ marginTop: 4 }}
              >
                <Text
                  style={[
                    type_.footnote,
                    { color: theme.textTertiary, textAlign: 'center', paddingVertical: 12 },
                  ]}
                >
                  Use a different server
                </Text>
              </Press>
            </Animated.View>
          )}

          {error ? (
            <Animated.View entering={FadeIn.duration(200)}>
              <View
                style={{
                  marginTop: 18,
                  padding: 14,
                  borderRadius: radius.md,
                  backgroundColor: theme.scheme === 'dark' ? 'rgba(255,107,107,0.14)' : 'rgba(214,53,59,0.09)',
                  flexDirection: 'row',
                  gap: 10,
                }}
              >
                <Icon name="exclamationmark.triangle.fill" size={15} color={theme.destructive} />
                <Text style={[type_.footnote, { color: theme.destructive, flex: 1 }]}>{error}</Text>
              </View>
            </Animated.View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  label,
  icon,
  ...props
}: { label?: string; icon: Parameters<typeof Icon>[0]['name'] } & React.ComponentProps<
  typeof TextInput
>) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ marginBottom: 14 }}>
      {label ? (
        <Text
          style={[
            type_.caption2,
            {
              color: theme.textTertiary,
              marginBottom: 7,
              marginLeft: 4,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            },
          ]}
        >
          {label}
        </Text>
      ) : null}
      <GlassSurface
        variant="clear"
        radius={radius.md}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: focused ? theme.tint : theme.separator,
          backgroundColor: theme.scheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)',
        }}
      >
        <Icon name={icon} size={16} color={focused ? theme.tint : theme.textTertiary} />
        <TextInput
          {...props}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={theme.textTertiary}
          style={{
            flex: 1,
            paddingVertical: 15,
            paddingLeft: 11,
            fontSize: 17,
            color: theme.text,
          }}
        />
      </GlassSurface>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={busy || disabled}
      haptic="medium"
      style={{ marginTop: 10, opacity: disabled ? 0.45 : 1 }}
    >
      <LinearGradient
        colors={[shelf.green, shelf.teal]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          height: 54,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[type_.headline, { color: '#fff' }]}>{label}</Text>
        )}
      </LinearGradient>
    </Press>
  );
}

function QuickConnectCard({ code, onCancel }: { code: string; onCancel: () => void }) {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeInDown.springify()}>
      <GlassSurface
        radius={radius.lg}
        style={{ padding: 24, borderRadius: radius.lg, alignItems: 'center', gap: 10 }}
      >
        <Text style={[type_.subhead, { color: theme.textSecondary, textAlign: 'center' }]}>
          Enter this code in Jellyfin under Quick Connect
        </Text>
        <Text
          style={{
            fontSize: 42,
            fontWeight: '700',
            letterSpacing: 8,
            color: theme.text,
            marginVertical: 6,
            fontVariant: ['tabular-nums'],
          }}
        >
          {code}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator size="small" color={theme.textTertiary} />
          <Text style={[type_.footnote, { color: theme.textTertiary }]}>Waiting for approval…</Text>
        </View>
        <Press onPress={onCancel} haptic="selection" style={{ marginTop: 8 }}>
          <Text style={[type_.subhead, { color: theme.tint, fontWeight: '600' }]}>Cancel</Text>
        </Press>
      </GlassSurface>
    </Animated.View>
  );
}
