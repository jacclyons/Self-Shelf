import { useState } from 'react';
import { Text, View } from 'react-native';

import { textOn } from '@/ui/accents';
import { Icon } from '@/ui/Bits';
import { Press } from '@/ui/Press';
import { radius, type as type_ } from '@/ui/theme';
import type { BookmarkRow, HighlightRow } from '@/state/db';
import type { ReaderTheme } from '@/state/reader';

import type { Chapter } from './protocol';
import { Sheet } from './Sheet';

type Tab = 'contents' | 'bookmarks' | 'highlights';

interface ContentsSheetProps {
  visible: boolean;
  onClose(): void;
  chapters: Chapter[];
  bookmarks: BookmarkRow[];
  highlights: HighlightRow[];
  theme: ReaderTheme;
  currentChapter?: string | null;
  onNavigate(location: string): void;
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
  onNavigate,
  onDeleteBookmark,
  onDeleteHighlight,
}: ContentsSheetProps) {
  const [tab, setTab] = useState<Tab>('contents');
  const muted = theme.dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
  const chipBg = theme.dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.055)';
  const divider = theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';

  const go = (location: string) => {
    onNavigate(location);
    onClose();
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'contents', label: 'Contents', count: chapters.length },
    { key: 'bookmarks', label: 'Bookmarks', count: bookmarks.length },
    { key: 'highlights', label: 'Highlights', count: highlights.length },
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title="Contents" maxHeight="80%" dark={theme.dark}>
      <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', backgroundColor: chipBg, borderRadius: radius.md, padding: 3 }}>
          {tabs.map((entry) => {
            const selected = tab === entry.key;
            return (
              <Press
                key={entry.key}
                haptic="selection"
                scaleTo={0.97}
                style={{ flex: 1 }}
                onPress={() => setTab(entry.key)}
              >
                <View
                  style={{
                    paddingVertical: 9,
                    borderRadius: radius.md - 3,
                    backgroundColor: selected ? theme.accent : 'transparent',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={[
                      type_.footnote,
                      { color: selected ? textOn(theme.accent) : theme.fg, fontWeight: selected ? '600' : '400' },
                    ]}
                  >
                    {entry.label}
                    {entry.count ? ` ${entry.count}` : ''}
                  </Text>
                </View>
              </Press>
            );
          })}
        </View>
      </View>

      {tab === 'contents' ? (
        chapters.length ? (
          <View>
            {chapters.map((chapter, index) => {
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
                        chapter.depth === 0 ? type_.callout : type_.subhead,
                        {
                          flex: 1,
                          color: active ? theme.accent : chapter.depth === 0 ? theme.fg : muted,
                          fontWeight: active ? '600' : chapter.depth === 0 ? '500' : '400',
                        },
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
          <Empty text="This book has no table of contents." muted={muted} />
        )
      ) : null}

      {tab === 'bookmarks' ? (
        bookmarks.length ? (
          <View>
            {bookmarks.map((bookmark, index) => (
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
                    <Text numberOfLines={1} style={[type_.callout, { color: theme.fg }]}>
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
          <Empty text="Tap the bookmark button while reading to save your place." muted={muted} />
        )
      ) : null}

      {tab === 'highlights' ? (
        highlights.length ? (
          <View>
            {highlights.map((highlight, index) => (
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
                    <Text style={[type_.subhead, { color: theme.fg, lineHeight: 21 }]}>
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
          <Empty text="Select any passage and choose Highlight." muted={muted} />
        )
      ) : null}
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
