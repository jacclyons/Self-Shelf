import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { authorOf, type BaseItem } from '@/api/types';
import {
  applyMetadata,
  searchMetadata,
  suggestedQuery,
  type MetadataMatch,
} from '@/lib/metadata';
import { enrichLocalBook } from '@/state/db';
import { Sheet } from '@/reader/Sheet';

import { Icon } from './Bits';
import { Press } from './Press';
import { radius, type as type_, useTheme } from './theme';

function ManualField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText(text: string): void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 5 }}>
      <Text
        style={[
          type_.caption2,
          { color: theme.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: 3 },
        ]}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCorrect={false}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 11,
          borderRadius: radius.md,
          backgroundColor: theme.surfaceAlt,
          fontSize: 16,
          color: theme.text,
        }}
      />
    </View>
  );
}

interface MetadataSheetProps {
  visible: boolean;
  onClose(): void;
  item: BaseItem;
  onApplied(): void;
}

/** Looks a sideloaded book up on Open Library and adopts the match you pick. */
export function MetadataSheet({ visible, onClose, item, onApplied }: MetadataSheetProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MetadataMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualAuthor, setManualAuthor] = useState('');

  const run = useCallback(async (text: string) => {
    setLoading(true);
    setError(null);
    try {
      setResults(await searchMetadata(text));
    } catch (e) {
      setError((e as Error).message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Open with a search already run, built from what we know of the file.
  useEffect(() => {
    if (!visible) return;
    const initial = suggestedQuery(item.Name ?? '', authorOf(item) ?? null);
    setQuery(initial);
    setManual(false);
    setManualTitle(item.Name ?? '');
    setManualAuthor(authorOf(item) ?? '');
    run(initial);
  }, [visible, item, run]);

  // Both providers throttle hard; typing it in must always be possible.
  const saveManual = useCallback(() => {
    if (!manualTitle.trim()) return;
    enrichLocalBook(item.Id, {
      title: manualTitle.trim(),
      author: manualAuthor.trim() || null,
    });
    onApplied();
    onClose();
  }, [item.Id, manualAuthor, manualTitle, onApplied, onClose]);

  const choose = useCallback(
    async (match: MetadataMatch) => {
      setApplying(match.key);
      try {
        await applyMetadata(item.Id, match);
        onApplied();
        onClose();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setApplying(null);
      }
    },
    [item.Id, onApplied, onClose],
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="Find Metadata" maxHeight="86%">
      <View style={{ paddingHorizontal: 20, gap: 14 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            borderRadius: radius.md,
            backgroundColor: theme.surfaceAlt,
          }}
        >
          <Icon name="magnifyingglass" size={15} color={theme.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => run(query)}
            placeholder="Title and author"
            placeholderTextColor={theme.textTertiary}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            style={{ flex: 1, paddingVertical: 11, paddingLeft: 8, fontSize: 16, color: theme.text }}
          />
        </View>

        {loading ? (
          <View style={{ paddingVertical: 34 }}>
            <ActivityIndicator color={theme.textTertiary} />
          </View>
        ) : error ? (
          <View style={{ paddingVertical: 26, gap: 8, alignItems: 'center' }}>
            <Icon name="wifi.slash" size={22} color={theme.textTertiary} />
            <Text style={[type_.subhead, { color: theme.textSecondary, textAlign: 'center' }]}>
              {error}
            </Text>
            <Press onPress={() => run(query)} haptic="light">
              <Text style={[type_.subhead, { color: theme.tint, fontWeight: '600', padding: 8 }]}>
                Try again
              </Text>
            </Press>
          </View>
        ) : results.length === 0 ? (
          <Text
            style={[type_.subhead, { color: theme.textSecondary, textAlign: 'center', padding: 26 }]}
          >
            No matches. Try just the title, or add the author.
          </Text>
        ) : (
          <View>
            {results.map((match, index) => (
              <Press key={match.key} scaleTo={0.99} haptic="selection" onPress={() => choose(match)}>
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 12,
                    paddingVertical: 11,
                    alignItems: 'center',
                    borderTopWidth: index === 0 ? 0 : 0.5,
                    borderTopColor: theme.separator,
                  }}
                >
                  <View
                    style={{
                      width: 42,
                      height: 63,
                      borderRadius: 4,
                      overflow: 'hidden',
                      backgroundColor: theme.surfaceAlt,
                    }}
                  >
                    {match.coverThumb ? (
                      <Image
                        source={{ uri: match.coverThumb }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                        transition={160}
                      />
                    ) : null}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={[type_.callout, { color: theme.text, fontWeight: '600' }]}>
                      {match.title}
                    </Text>
                    {match.author ? (
                      <Text numberOfLines={1} style={[type_.footnote, { color: theme.textSecondary }]}>
                        {match.author}
                      </Text>
                    ) : null}
                    <Text style={[type_.caption, { color: theme.textTertiary, marginTop: 1 }]}>
                      {[match.year, match.publisher, match.source].filter(Boolean).join(' · ')}
                    </Text>
                  </View>

                  {applying === match.key ? (
                    <ActivityIndicator size="small" color={theme.tint} />
                  ) : (
                    <Icon name="chevron.right" size={12} color={theme.textTertiary} weight="medium" />
                  )}
                </View>
              </Press>
            ))}
          </View>
        )}

        {manual ? (
          <View style={{ gap: 10, paddingTop: 4 }}>
            <ManualField label="Title" value={manualTitle} onChangeText={setManualTitle} />
            <ManualField label="Author" value={manualAuthor} onChangeText={setManualAuthor} />
            <Press onPress={saveManual} haptic="medium" disabled={!manualTitle.trim()}>
              <View
                style={{
                  height: 46,
                  borderRadius: radius.md,
                  backgroundColor: theme.tint,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: manualTitle.trim() ? 1 : 0.4,
                }}
              >
                <Text style={[type_.headline, { color: theme.onTint }]}>Save Details</Text>
              </View>
            </Press>
          </View>
        ) : null}

        <Press onPress={() => setManual((v) => !v)} haptic="selection">
          <Text
            style={[
              type_.footnote,
              { color: theme.tint, textAlign: 'center', fontWeight: '600', paddingVertical: 10 },
            ]}
          >
            {manual ? 'Search instead' : 'Enter details manually'}
          </Text>
        </Press>

        <Text style={[type_.caption, { color: theme.textTertiary, textAlign: 'center', paddingBottom: 6 }]}>
          Open Library, then Google Books
        </Text>
      </View>
    </Sheet>
  );
}
