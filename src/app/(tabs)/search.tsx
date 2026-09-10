import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGenres, useShelf } from '@/api/hooks';
import { authorOf, type BaseItem } from '@/api/types';
import { useAuth } from '@/state/auth';
import { EmptyState, Icon, ProgressBar } from '@/ui/Bits';
import { BookCover } from '@/ui/BookCover';
import { GlassSurface } from '@/ui/Glass';
import { Press } from '@/ui/Press';
import { getProgress } from '@/state/db';
import { contentColumn, radius, tabBarInset, type as type_, useTheme } from '@/ui/theme';

export default function Search() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { width } = useWindowDimensions();

  const [text, setText] = useState('');
  const [term, setTerm] = useState('');

  // Debounce so we aren't hammering the server on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), 320);
    return () => clearTimeout(timer);
  }, [text]);

  const results = useShelf('search', { searchTerm: term, limit: 80 }, term.length > 1);
  const genres = useGenres();
  const browsing = term.length <= 1;

  if (!session) return null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <FlatList
        data={browsing ? [] : (results.data ?? [])}
        keyExtractor={(item: BaseItem) => item.Id}
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          contentColumn,
          { paddingTop: insets.top + 8 + tabBarInset, paddingBottom: insets.bottom + 130 },
        ]}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
            <Text
              style={[type_.largeTitle, { color: theme.text, letterSpacing: -0.9, marginBottom: 16 }]}
            >
              Search
            </Text>
            <GlassSurface
              variant="clear"
              radius={radius.md}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                borderRadius: radius.md,
                backgroundColor: theme.surfaceAlt,
              }}
            >
              <Icon name="magnifyingglass" size={16} color={theme.textTertiary} />
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Titles, authors, series"
                placeholderTextColor={theme.textTertiary}
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
                onSubmitEditing={() => Keyboard.dismiss()}
                style={{ flex: 1, paddingVertical: 12, paddingLeft: 9, fontSize: 17, color: theme.text }}
              />
            </GlassSurface>

            {browsing && genres.data?.length ? (
              <View style={{ marginTop: 28 }}>
                <Text style={[type_.title3, { color: theme.text, marginBottom: 14 }]}>
                  Browse by genre
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
                  {genres.data.slice(0, 24).map((genre) => (
                    <Press
                      key={genre.Id}
                      haptic="selection"
                      scaleTo={0.94}
                      onPress={() => setText(genre.Name ?? '')}
                    >
                      <View
                        style={{
                          paddingHorizontal: 15,
                          paddingVertical: 10,
                          borderRadius: radius.pill,
                          backgroundColor: theme.surfaceAlt,
                        }}
                      >
                        <Text style={[type_.subhead, { color: theme.text }]}>{genre.Name}</Text>
                      </View>
                    </Press>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          browsing ? null : results.isPending ? (
            <View style={{ paddingTop: 50 }}>
              <ActivityIndicator color={theme.textTertiary} />
            </View>
          ) : (
            <EmptyState
              icon="magnifyingglass"
              title={`No results for "${term}"`}
              message="Try an author's surname or part of the title."
            />
          )
        }
        renderItem={({ item }) => <ResultRow item={item} width={width} />}
      />
    </View>
  );
}

function ResultRow({ item, width }: { item: BaseItem; width: number }) {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const progress = getProgress(item.Id);

  if (!session) return null;

  return (
    <Press
      scaleTo={0.98}
      haptic="selection"
      onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.Id } })}
    >
      <View
        style={{
          flexDirection: 'row',
          gap: 14,
          paddingHorizontal: 20,
          paddingVertical: 10,
          alignItems: 'center',
        }}
      >
        <BookCover item={item} session={session} width={50} radius={4} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={2} style={[type_.callout, { color: theme.text, fontWeight: '600' }]}>
            {item.Name}
          </Text>
          {authorOf(item) ? (
            <Text numberOfLines={1} style={[type_.footnote, { color: theme.textSecondary }]}>
              {authorOf(item)}
            </Text>
          ) : null}
          {progress && progress.percent > 0.001 ? (
            <ProgressBar percent={progress.percent} style={{ width: Math.min(160, width * 0.4) }} />
          ) : null}
        </View>
        <Icon name="chevron.right" size={13} color={theme.textTertiary} weight="medium" />
      </View>
    </Press>
  );
}
