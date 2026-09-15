import { useRouter } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CLIENT_VERSION } from '@/api/client';
import { showAlert } from '@/lib/alert';
import { useDismissTo } from '@/lib/navigation';
import { cacheSize, canDownload, clearAllDownloads, clearCache, downloadsSize, formatBytes } from '@/lib/storage';
import { useAppearance, type AppearanceChoice } from '@/state/appearance';
import { useAuth } from '@/state/auth';
import { listDownloads, wipeLocalData } from '@/state/db';
import { Icon } from '@/ui/Bits';
import { CloseButton } from '@/ui/CloseButton';
import { ACCENTS, CUSTOM_ACCENT_ID, textOn } from '@/ui/accents';
import { ColorWell, colorWellAvailable } from '@/ui/ColorWell';
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
  const [cached, setCached] = useState(() => cacheSize());

  const refresh = useCallback(() => {
    setDownloads(listDownloads().length);
    setBytes(downloadsSize());
    setCached(cacheSize());
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
        <AccentControl />
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
        {canDownload ? (
          <>
            <Row icon="clock.arrow.circlepath" label="Recently read" value={formatBytes(cached)} />
            <Row
              icon="xmark.bin"
              label="Clear recently read"
              destructive
              onPress={() =>
                showAlert(
                  'Clear recently read?',
                  'Books you open are kept for a while so they reopen instantly. Downloads and reading positions are kept.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Clear',
                      style: 'destructive',
                      onPress: () => {
                        clearCache();
                        refresh();
                      },
                    },
                  ],
                )
              }
            />
          </>
        ) : null}
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
          value="EPUB · PDF · CBZ · CBR"
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
                clearCache();
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
                color={selected ? theme.onTint : theme.textSecondary}
              />
              <Text
                style={[
                  type_.footnote,
                  { fontWeight: '600', color: selected ? theme.onTint : theme.textSecondary },
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

/**
 * The accent swatches, then a colour well for any colour at all (iOS and web).
 * Each swatch shows the shade it would paint in the current scheme, so what
 * you pick is what you get.
 */
function AccentControl() {
  const theme = useTheme();
  const { accent, setAccent, customColor, setCustomColor } = useAppearance();
  const custom = accent.id === CUSTOM_ACCENT_ID;

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 11 }}>
        <Icon name="paintpalette" size={17} color={theme.textSecondary} />
        <Text style={[type_.callout, { color: theme.text, flex: 1 }]}>Accent</Text>
        <Text style={[type_.footnote, { color: theme.textTertiary }]}>{accent.name}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        {ACCENTS.map((option) => {
          const selected = option.id === accent.id;
          const color = option[theme.scheme];
          return (
            <Press
              key={option.id}
              haptic="selection"
              scaleTo={0.9}
              onPress={() => setAccent(option.id)}
              role="radio"
              aria-label={option.name}
              aria-checked={selected}
            >
              <SwatchRing selected={selected} color={color}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: color,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected ? (
                    <Icon name="checkmark" size={12} color={textOn(color)} weight="bold" />
                  ) : null}
                </View>
              </SwatchRing>
            </Press>
          );
        })}
        {colorWellAvailable ? (
          <SwatchRing selected={custom} color={theme.tint}>
            <ColorWell
              // Opens on the last custom colour, or on the current accent the first time.
              color={customColor ?? accent[theme.scheme]}
              onChange={setCustomColor}
              label="Custom accent colour"
            />
          </SwatchRing>
        ) : null}
      </View>
    </View>
  );
}

/** Rings the selected swatch in its own colour, a gap away so it reads on any colour. */
function SwatchRing({
  selected,
  color,
  children,
}: {
  selected: boolean;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 2,
        borderColor: selected ? color : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
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
