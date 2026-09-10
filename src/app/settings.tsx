import { useRouter } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CLIENT_VERSION } from '@/api/client';
import { showAlert } from '@/lib/alert';
import { useDismissTo } from '@/lib/navigation';
import { clearAllDownloads, downloadsSize, formatBytes } from '@/lib/storage';
import { useAppearance, type AppearanceChoice } from '@/state/appearance';
import { useAuth } from '@/state/auth';
import { listDownloads, wipeLocalData } from '@/state/db';
import { Icon } from '@/ui/Bits';
import { CloseButton } from '@/ui/CloseButton';
import { GlassSurface } from '@/ui/Glass';
import { Press } from '@/ui/Press';
import { radius, readingColumn, type as type_, useTheme } from '@/ui/theme';

export default function Settings() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dismiss = useDismissTo('/');
  const { session, signOut } = useAuth();

  const [downloads, setDownloads] = useState(() => listDownloads().length);
  const [bytes, setBytes] = useState(() => downloadsSize());

  const refresh = useCallback(() => {
    setDownloads(listDownloads().length);
    setBytes(downloadsSize());
  }, []);

  if (!session) return null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={[readingColumn, { padding: 20, paddingBottom: insets.bottom + 40 }]}
    >
      <CloseButton onPress={dismiss} placement="inline" />
      <Text style={[type_.title1, { color: theme.text, marginBottom: 22, letterSpacing: -0.6 }]}>
        Settings
      </Text>

      <GlassSurface
        radius={radius.lg}
        style={{
          borderRadius: radius.lg,
          padding: 18,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          backgroundColor: theme.surfaceAlt,
        }}
      >
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: theme.tintSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="person.fill" size={20} color={theme.tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type_.headline, { color: theme.text }]}>{session.userName}</Text>
          <Text numberOfLines={1} style={[type_.footnote, { color: theme.textTertiary }]}>
            {session.serverName ?? session.serverUrl.replace(/^https?:\/\//, '')}
          </Text>
        </View>
      </GlassSurface>

      <Section title="Appearance">
        <AppearanceControl />
      </Section>

      <Section title="Storage">
        <Row
          icon="arrow.down.circle"
          label="Downloaded books"
          value={`${downloads} · ${formatBytes(bytes)}`}
        />
        <Row
          icon="trash"
          label="Remove all downloads"
          destructive
          onPress={() =>
            showAlert(
              'Remove all downloads?',
              'Your books stay on the server. Reading positions are kept.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () => {
                    clearAllDownloads();
                    refresh();
                  },
                },
              ],
            )
          }
        />
      </Section>

      <Section title="Server">
        <Row icon="server.rack" label="Address" value={session.serverUrl.replace(/^https?:\/\//, '')} />
        <Row
          icon="safari"
          label="Open Jellyfin in browser"
          onPress={() => Linking.openURL(session.serverUrl)}
        />
      </Section>

      <Section title="About">
        <Row icon="info.circle" label="Self-Shelf" value={CLIENT_VERSION} />
        <Row
          icon="book.closed"
          label="Supported formats"
          value="EPUB · PDF"
        />
        <Row
          icon="sparkles"
          label="Show walkthrough"
          onPress={() => router.push('/welcome')}
        />
      </Section>

      <Press
        haptic="medium"
        style={{ marginTop: 28 }}
        onPress={() =>
          showAlert('Sign out?', 'Downloads and reading positions on this device are removed.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign Out',
              style: 'destructive',
              onPress: async () => {
                clearAllDownloads();
                wipeLocalData();
                await signOut();
                router.replace('/sign-in');
              },
            },
          ])
        }
      >
        <View
          style={{
            height: 50,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.scheme === 'dark' ? 'rgba(255,107,107,0.14)' : 'rgba(214,53,59,0.08)',
          }}
        >
          <Text style={[type_.headline, { color: theme.destructive }]}>Sign Out</Text>
        </View>
      </Press>
    </ScrollView>
  );
}

const APPEARANCE_OPTIONS: { value: AppearanceChoice; label: string; icon: SymbolViewProps['name'] }[] = [
  { value: 'system', label: 'System', icon: 'circle.lefthalf.filled' },
  { value: 'light', label: 'Light', icon: 'sun.max' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

/** Three-way appearance choice. `System` is the default and follows the OS. */
function AppearanceControl() {
  const theme = useTheme();
  const { choice, setChoice } = useAppearance();

  return (
    <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
      {APPEARANCE_OPTIONS.map((option) => {
        const selected = choice === option.value;
        return (
          <Press
            key={option.value}
            haptic="selection"
            scaleTo={0.96}
            style={{ flex: 1 }}
            onPress={() => setChoice(option.value)}
          >
            <View
              style={{
                paddingVertical: 13,
                borderRadius: radius.md,
                gap: 6,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? theme.tint : theme.bgElevated,
                borderWidth: 1,
                borderColor: selected ? 'transparent' : theme.separator,
              }}
            >
              <Icon
                name={option.icon}
                size={17}
                color={selected ? '#FFFFFF' : theme.textSecondary}
              />
              <Text
                style={[
                  type_.footnote,
                  { fontWeight: '600', color: selected ? '#FFFFFF' : theme.textSecondary },
                ]}
              >
                {option.label}
              </Text>
            </View>
          </Press>
        );
      })}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ marginTop: 30 }}>
      <Text
        style={[
          type_.caption2,
          {
            color: theme.textTertiary,
            marginLeft: 6,
            marginBottom: 9,
            textTransform: 'uppercase',
            letterSpacing: 0.7,
            fontWeight: '600',
          },
        ]}
      >
        {title}
      </Text>
      <View
        style={{
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: theme.surfaceAlt,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  destructive,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const theme = useTheme();
  const color = destructive ? theme.destructive : theme.text;

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingHorizontal: 16,
        paddingVertical: 15,
      }}
    >
      <Icon name={icon} size={17} color={destructive ? theme.destructive : theme.textSecondary} />
      <Text style={[type_.callout, { color, flex: 1 }]}>{label}</Text>
      {value ? (
        <Text style={[type_.footnote, { color: theme.textTertiary }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress && !value ? (
        <Icon name="chevron.right" size={12} color={theme.textTertiary} weight="medium" />
      ) : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Press onPress={onPress} haptic="selection" scaleTo={0.99}>
      {content}
    </Press>
  );
}
