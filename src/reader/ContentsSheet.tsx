import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/ui/Bits';
import { Press } from '@/ui/Press';
import { radius, serif, type as type_ } from '@/ui/theme';
import type { BookmarkRow, HighlightRow } from '@/state/db';
import type { ReaderTheme } from '@/state/reader';

import type { Chapter, SearchHit } from './protocol';
import { Segmented, type SegmentOption } from './Segmented';
import { Sheet } from './Sheet';

type Tab = 'contents' | 'bookmarks' | 'highlights' | 'search';

/**
 * A short list is quicker to scan than to filter, so on the list tabs the
 * field only appears once there are more entries than fit on one screen.
 * The Search tab always has it: that one searches the book's text.
 */
const FILTER_FROM = 10;

/** How long to wait after the last keystroke before searching the book. */
const SEARCH_DEBOUNCE_MS = 350;

/** Ovo for the entries, so the list reads like a book's own contents page. */
const entry = { fontFamily: serif, fontSize: 17, lineHeight: 23 } as const;
const subEntry = { fontFamily: serif, fontSize: 15.5, lineHeight: 21 } as const;

/** Case- and accent-insensitive match, so "Zechariah" finds "Zecharías" too. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

interface ContentsSheetProps {
  visible: boolean;
  onClose(): void;
  chapters: Chapter[];
  bookmarks: BookmarkRow[];
  highlights: HighlightRow[];
  theme: ReaderTheme;
  currentChapter?: string | null;
  /** Comics have no text to search, so the tab is left out for them. */
  canSearch: boolean;
  /** Full-text hits for the last `onSearch`, in book order, as they arrive. */
  searchHits: SearchHit[];
  /** True while the engine is still working through the book. */
  searching: boolean;
  /** Called with the trimmed query once typing pauses; empty cancels. */
  onSearch(query: string): void;
  onNavigate(location: string): void;
  onNavigateHit(location: string): void;
  onDeleteBookmark(id: string): void;
  onDeleteHighlight(id: string): void;
}

export function ContentsSheet({
  visible,
  onClose,
  chapters,
  bookmarks,
  highlights,
  theme,
  currentChapter,
  canSearch,
  searchHits,
  searching,
  onSearch,
  onNavigate,
  onNavigateHit,
  onDeleteBookmark,
  onDeleteHighlight,
}: ContentsSheetProps) {
  const [tab, setTab] = useState<Tab>('contents');
  const [query, setQuery] = useState('');
  const muted = theme.dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
  const chipBg = theme.dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.055)';
  const divider = theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';

  const go = (location: string, hit = false) => {
    Keyboard.dismiss();
    if (hit) onNavigateHit(location);
    else onNavigate(location);
    onClose();
  };

  // One field filters whichever tab is showing. The query is kept across tab
  // switches so flicking between Contents and Highlights doesn't lose it.
  const needle = fold(query.trim());
  const shown = useMemo(() => {
    if (!needle) return { chapters, bookmarks, highlights };
    const has = (...fields: (string | null | undefined)[]) =>
      fields.some((field) => field && fold(field).includes(needle));
    return {
      chapters: chapters.filter((c) => has(c.label)),
      bookmarks: bookmarks.filter((b) => has(b.label, b.excerpt)),
      highlights: highlights.filter((h) => has(h.text, h.note)),
    };
  }, [needle, chapters, bookmarks, highlights]);

  const trimmed = query.trim();
  const total = { contents: chapters.length, bookmarks: bookmarks.length, highlights: highlights.length, search: 0 }[tab];
  const showField = tab === 'search' || total >= FILTER_FROM;
  const placeholder = tab === 'search' ? 'Search the book' : `Filter ${tab === 'contents' ? 'chapters' : tab}`;

  // The book search runs from the same field, once typing pauses. The last
  // query sent is remembered so switching tabs and back doesn't repeat it.
  const sent = useRef('');
  useEffect(() => {
    if (tab !== 'search' || trimmed === sent.current) return;
    const timer = setTimeout(() => {
      sent.current = trimmed;
      onSearch(trimmed);
    }, trimmed ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [tab, trimmed, onSearch]);

  // Landing on the Search tab should put you straight in the field.
  const field = useRef<TextInput>(null);
  useEffect(() => {
    if (tab === 'search' && visible) field.current?.focus();
  }, [tab, visible]);

  const tabs: SegmentOption<Tab>[] = [
    { label: 'Contents', value: 'contents' },
    { label: 'Bookmarks', value: 'bookmarks' },
    { label: 'Highlights', value: 'highlights' },
    ...(canSearch ? [{ label: 'Search', value: 'search' as const }] : []),
  ];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Contents"
      maxHeight="80%"
      fixedHeight
      dark={theme.dark}
      fg={theme.fg}
    >
      <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
        <Segmented<Tab>
          value={tab}
          options={tabs}
          onChange={setTab}
          background={chipBg}
          accent={theme.accent}
          fg={theme.fg}
          height={34}
        />
      </View>

      {showField ? (
        <View
          style={{
            marginHorizontal: 20,
            marginBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 12,
            paddingRight: 8,
            borderRadius: radius.md,
            backgroundColor: chipBg,
          }}
        >
          <Icon name="magnifyingglass" size={14} color={muted} />
          <TextInput
            ref={field}
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor={muted}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            selectionColor={theme.accent}
            keyboardAppearance={theme.dark ? 'dark' : 'light'}
            onSubmitEditing={() => Keyboard.dismiss()}
            style={[
              { flex: 1, paddingVertical: 9, paddingLeft: 8, fontSize: 16, color: theme.fg },
              // RN Web draws its own focus ring, which fights the pill.
              Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
            ]}
          />
        </View>
      ) : null}

      {/* Keyed on the tab so a switch fades the new list in rather than
          swapping it; the sheet's layout transition eases the height. */}
      <Animated.View key={tab} entering={FadeIn.duration(180)}>
      {tab === 'contents' ? (
        shown.chapters.length ? (
          <View>
            {shown.chapters.map((chapter, index) => {
              const active = !!currentChapter && chapter.label === currentChapter;
              return (
                <Press
                  key={`${chapter.href}-${index}`}
                  haptic="selection"
                  scaleTo={0.99}
                  disabled={!chapter.href}
                  onPress={() => chapter.href && go(chapter.href)}
                >
                  <View
                    style={{
                      paddingVertical: 13,
                      paddingRight: 20,
                      paddingLeft: 20 + chapter.depth * 16,
                      borderTopWidth: index === 0 ? 0 : 0.5,
                      borderTopColor: divider,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <Text
                      numberOfLines={2}
                      style={[
                        chapter.depth === 0 ? entry : subEntry,
                        // Ovo has one weight, so the current chapter is picked
                        // out by colour and the icon rather than by boldness.
                        { flex: 1, color: active ? theme.accent : chapter.depth === 0 ? theme.fg : muted },
                      ]}
                    >
                      {chapter.label || 'Untitled'}
                    </Text>
                    {active ? <Icon name="book.fill" size={12} color={theme.accent} /> : null}
                  </View>
                </Press>
              );
            })}
          </View>
        ) : (
          <Empty
            text={needle ? `No chapters match “${query.trim()}”.` : 'This book has no table of contents.'}
            muted={muted}
          />
        )
      ) : null}

      {tab === 'bookmarks' ? (
        shown.bookmarks.length ? (
          <View>
            {shown.bookmarks.map((bookmark, index) => (
              <Press
                key={bookmark.id}
                haptic="selection"
                scaleTo={0.99}
                onPress={() => go(bookmark.location)}
                onLongPress={() => onDeleteBookmark(bookmark.id)}
              >
                <View
                  style={{
                    paddingVertical: 13,
                    paddingHorizontal: 20,
                    borderTopWidth: index === 0 ? 0 : 0.5,
                    borderTopColor: divider,
                    flexDirection: 'row',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  <Icon name="bookmark.fill" size={14} color={theme.accent} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[entry, { color: theme.fg }]}>
                      {bookmark.label || `${Math.round(bookmark.percent * 100)}% through`}
                    </Text>
                    {bookmark.excerpt ? (
                      <Text numberOfLines={2} style={[type_.footnote, { color: muted, marginTop: 2 }]}>
                        {bookmark.excerpt}
                      </Text>
                    ) : null}
                  </View>
                  <Press haptic="light" scaleTo={0.9} onPress={() => onDeleteBookmark(bookmark.id)} hitSlop={8}>
                    <Icon name="trash" size={13} color={muted} />
                  </Press>
                </View>
              </Press>
            ))}
          </View>
        ) : (
          <Empty
            text={
              needle
                ? `No bookmarks match “${query.trim()}”.`
                : 'Tap the bookmark button while reading to save your place.'
            }
            muted={muted}
          />
        )
      ) : null}

      {tab === 'highlights' ? (
        shown.highlights.length ? (
          <View>
            {shown.highlights.map((highlight, index) => (
              <Press
                key={highlight.id}
                haptic="selection"
                scaleTo={0.99}
                onPress={() => go(highlight.location)}
              >
                <View
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    borderTopWidth: index === 0 ? 0 : 0.5,
                    borderTopColor: divider,
                    flexDirection: 'row',
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 3,
                      borderRadius: 2,
                      backgroundColor: highlight.color,
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[subEntry, { color: theme.fg, lineHeight: 22 }]}>
                      {highlight.text}
                    </Text>
                    {highlight.note ? (
                      <Text style={[type_.footnote, { color: muted, marginTop: 5, fontStyle: 'italic' }]}>
                        {highlight.note}
                      </Text>
                    ) : null}
                  </View>
                  <Press
                    haptic="light"
                    scaleTo={0.9}
                    onPress={() => onDeleteHighlight(highlight.id)}
                    hitSlop={8}
                  >
                    <Icon name="trash" size={13} color={muted} />
                  </Press>
                </View>
              </Press>
            ))}
          </View>
        ) : (
          <Empty
            text={needle ? `No highlights match “${query.trim()}”.` : 'Select any passage and choose Highlight.'}
            muted={muted}
          />
        )
      ) : null}

      {tab === 'search' ? (
        !trimmed ? (
          <Empty text="Find a word, a name or a phrase anywhere in the book." muted={muted} />
        ) : searchHits.length ? (
          <View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 20,
                paddingBottom: 6,
              }}
            >
              <Text style={[type_.footnote, { color: muted }]}>
                {searching
                  ? `${searchHits.length} so far`
                  : searchHits.length >= 300
                    ? 'First 300 matches'
                    : `${searchHits.length} ${searchHits.length === 1 ? 'match' : 'matches'}`}
              </Text>
              {searching ? <ActivityIndicator size="small" color={muted} /> : null}
            </View>
            {searchHits.map((hit, index) => (
              <Press
                key={`${hit.location}-${index}`}
                haptic="selection"
                scaleTo={0.99}
                onPress={() => go(hit.location, true)}
              >
                <View
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 20,
                    borderTopWidth: index === 0 ? 0 : 0.5,
                    borderTopColor: divider,
                  }}
                >
                  <Text numberOfLines={1} style={[type_.caption, { color: muted, marginBottom: 3 }]}>
                    {hit.chapter ?? (hit.page ? `Page ${hit.page}` : 'Untitled')}
                    {hit.chapter && hit.page ? ` · Page ${hit.page}` : ''}
                  </Text>
                  {/* Ovo has no bold, so the hit itself is picked out in the accent. */}
                  <Text numberOfLines={3} style={[subEntry, { color: theme.fg }]}>
                    {hit.before}
                    <Text style={{ color: theme.accent }}>{hit.match}</Text>
                    {hit.after}
                  </Text>
                </View>
              </Press>
            ))}
          </View>
        ) : searching ? (
          <View style={{ padding: 40, alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={muted} />
            <Text style={[type_.subhead, { color: muted }]}>Searching…</Text>
          </View>
        ) : trimmed === sent.current ? (
          <Empty text={`Nothing in this book matches “${trimmed}”.`} muted={muted} />
        ) : null
      ) : null}
      </Animated.View>
    </Sheet>
  );
}

function Empty({ text, muted }: { text: string; muted: string }) {
  return (
    <View style={{ padding: 40 }}>
      <Text style={[type_.subhead, { color: muted, textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}
