import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOut, FadeOutDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBook, useProgressSync } from '@/api/hooks';
import { engineKindFor, formatOf } from '@/api/types';
import { isLocalId, localFileFor } from '@/lib/localBooks';
import { useDismissTo } from '@/lib/navigation';
import { promptForText } from '@/lib/prompt';
import { bookForReading, ensureReaderEngine } from '@/lib/storage';
import { useAppearance } from '@/state/appearance';
import { useAuth } from '@/state/auth';
import {
  addBookmark,
  enrichLocalBook,
  addHighlight,
  getProgress,
  listBookmarks,
  listHighlights,
  removeBookmark,
  removeHighlight,
  saveProgress,
  type BookmarkRow,
  type HighlightRow,
} from '@/state/db';
import {
  cacheLocations,
  cachedLocations,
  fontFor,
  loadSettings,
  saveSettings,
  themeFor,
  type ReaderSettings,
} from '@/state/reader';
import { EmptyState, Icon, ProgressBar } from '@/ui/Bits';
import { GlassSurface } from '@/ui/Glass';
import { Press } from '@/ui/Press';
import { maxReaderWidth, radius, readerColumn, type as type_ } from '@/ui/theme';

import { AppearanceSheet } from '@/reader/AppearanceSheet';
import { ContentsSheet } from '@/reader/ContentsSheet';
import type { Chapter, ReaderEvent, ReaderPosition, SelectionAction } from '@/reader/protocol';
import { ReaderView, type ReaderHandle } from '@/reader/ReaderView';
import { Scrubber } from '@/reader/Scrubber';

const HIGHLIGHT_COLOR = '#F5C84C';

/** Space the always-visible title / page lines occupy above and below the text. */
const IDLE_HEADER = 30;
const IDLE_FOOTER = 26;

export default function Reader() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const dismiss = useDismissTo(id ? `/book/${id}` : '/');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Chrome lines up with the text column rather than spanning the whole window.
  const chromeWidth = Math.min(width, maxReaderWidth);
  const { session } = useAuth();
  const flushProgress = useProgressSync();
  useKeepAwake();

  const book = useBook(id);
  const reader = useRef<ReaderHandle>(null);

  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettings());
  const [engineUri, setEngineUri] = useState<string | null>(null);
  const [bookUri, setBookUri] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [chromeVisible, setChromeVisible] = useState(false);
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<ReaderPosition | null>(null);
  const [scrubPercent, setScrubPercent] = useState<number | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [showContents, setShowContents] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkRow[]>([]);
  const [highlights, setHighlights] = useState<HighlightRow[]>([]);
  const lastSelection = useRef<{ text: string; location: string } | null>(null);

  const item = book.data;
  const kind = item ? engineKindFor(formatOf(item)) : 'epub';
  const { accent } = useAppearance();
  const theme = useMemo(() => themeFor(settings, accent), [settings, accent]);
  const font = useMemo(() => fontFor(settings), [settings]);
  const stored = id ? getProgress(id) : null;

  /* --------------------------- prepare the book --------------------------- */

  useEffect(() => {
    if (!item) return;
    const local = isLocalId(item.Id);
    if (!local && !session) return;
    let cancelled = false;

    (async () => {
      try {
        const engine = await ensureReaderEngine();
        if (cancelled) return;
        setEngineUri(engine);

        // A book already in the Files folder needs no fetching.
        if (local) {
          const file = localFileFor(item.Id);
          if (!file) throw new Error('That file is no longer in your Self-Shelf folder.');
          setBookUri(file.uri);
          return;
        }

        // Anything from Jellyfin is fetched into the cache (or found already
        // there, or pinned as a download); nothing here marks it Downloaded.
        if (!session) throw new Error('Sign in to read this book.');
        const task = bookForReading(session, item, (fraction) => {
          if (!cancelled) setDownloadPercent(fraction);
        });
        setDownloadPercent(0);
        const file = await task.promise;
        if (cancelled) return;
        setBookUri(file.uri);
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message ?? 'This book could not be opened.');
      } finally {
        if (!cancelled) {
          setPreparing(false);
          setDownloadPercent(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [item, session]);

  useEffect(() => {
    if (!id) return;
    setBookmarks(listBookmarks(id));
    setHighlights(listHighlights(id));
  }, [id]);

  /* ------------------------------- progress ------------------------------- */

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<ReaderPosition | null>(null);

  const persist = useCallback(() => {
    const current = latest.current;
    if (!id || !current) return;
    saveProgress(id, current.percent, current.location, current.percent >= 0.995);
  }, [id]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (introTimer.current) clearTimeout(introTimer.current);
      persist();
      flushProgress();
    };
  }, [flushProgress, persist]);

  const updateSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  /* -------------------------- engine event handling ------------------------ */

  const handleEvent = useCallback(
    (event: ReaderEvent) => {
      switch (event.type) {
        case 'loaded':
          setChapters(event.chapters ?? []);
          if (id && isLocalId(id) && (event.title || event.author)) {
            enrichLocalBook(id, { title: event.title, author: event.author });
          }
          // Re-apply saved highlights once the book is on screen.
          if (id) {
            for (const highlight of listHighlights(id)) {
              reader.current?.highlight(highlight.id, highlight.location, highlight.color);
            }
          }
          // Show the controls briefly on open so the centre-tap gesture is
          // discoverable, then get out of the way like Books does.
          setChromeVisible(true);
          if (introTimer.current) clearTimeout(introTimer.current);
          introTimer.current = setTimeout(() => {
            setChromeVisible(false);
            introTimer.current = null;
          }, 2800);
          break;

        case 'location': {
          const next: ReaderPosition = event;
          setPosition(next);
          latest.current = next;
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(persist, 900);
          break;
        }

        case 'locations':
          if (id) cacheLocations(id, event.data);
          break;

        case 'tap':
          if (introTimer.current) {
            clearTimeout(introTimer.current);
            introTimer.current = null;
          }
          if (event.zone === 'center') setChromeVisible((visible) => !visible);
          else setChromeVisible(false);
          break;

        case 'selection':
          lastSelection.current = { text: event.text, location: event.location };
          break;

        case 'dismiss':
          // Escape inside the engine. Saves first, the way the close button does.
          persist();
          dismiss();
          break;

        case 'error':
          setError(event.message);
          break;

        case 'log':
          // The engine can't reach the Metro console on its own; this is the
          // only window into what happens inside the WebView on a device.
          if (__DEV__) console.log('[reader]', event.message);
          break;

        default:
          break;
      }
    },
    [id, persist, dismiss],
  );

  const onSelectionAction = useCallback(
    (action: SelectionAction, text: string, location: string) => {
      // The engine resolves the selection at the moment of the tap; the last
      // reported one only stands in if that somehow came back empty.
      const selection = location ? { text, location } : lastSelection.current;
      if (__DEV__) console.log('[reader] selectionAction', action, selection);
      if (!id || !selection) return;

      const create = (note: string | null) => {
        const highlightId = Crypto.randomUUID();
        addHighlight({
          id: highlightId,
          item_id: id,
          location: selection.location,
          text: selection.text || text,
          note,
          color: HIGHLIGHT_COLOR,
          percent: latest.current?.percent ?? 0,
        });
        reader.current?.highlight(highlightId, selection.location, HIGHLIGHT_COLOR);
        reader.current?.clearSelection();
        setHighlights(listHighlights(id));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      };

      if (action === 'highlight') {
        create(null);
      } else {
        promptForText('Add note', selection.text.slice(0, 120), create);
      }
    },
    [id],
  );

  /* -------------------------------- actions ------------------------------- */

  const bookmarked = useMemo(
    () => bookmarks.some((bookmark) => bookmark.location === position?.location),
    [bookmarks, position?.location],
  );

  const toggleBookmark = useCallback(() => {
    if (!id || !position) return;
    const existing = bookmarks.find((bookmark) => bookmark.location === position.location);
    if (existing) {
      removeBookmark(existing.id);
    } else {
      addBookmark({
        id: Crypto.randomUUID(),
        item_id: id,
        location: position.location,
        label: position.chapter ?? null,
        excerpt: null,
        percent: position.percent,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setBookmarks(listBookmarks(id));
  }, [bookmarks, id, position]);

  /** Any deliberate action cancels the intro auto-hide. */
  const holdChrome = useCallback(() => {
    if (introTimer.current) {
      clearTimeout(introTimer.current);
      introTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    persist();
    dismiss();
  }, [persist, dismiss]);

  /* --------------------------------- render -------------------------------- */

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center' }}>
        <EmptyState
          icon="exclamationmark.triangle"
          title="Couldn't open this book"
          message={error}
          action="Close"
          onAction={dismiss}
        />
      </View>
    );
  }

  if (preparing || !engineUri || !bookUri || !item) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.bg,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          paddingHorizontal: 50,
        }}
      >
        <ActivityIndicator color={theme.accent} />
        <Text style={[type_.subhead, { color: theme.fg, opacity: 0.6, textAlign: 'center' }]}>
          {downloadPercent === null
            ? 'Preparing…'
            : `Loading ${Math.round(downloadPercent * 100)}%`}
        </Text>
        {downloadPercent !== null ? (
          <ProgressBar percent={downloadPercent} style={{ width: 180 }} color={theme.accent} />
        ) : null}
      </View>
    );
  }

  const displayPercent = scrubPercent ?? position?.percent ?? stored?.percent ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} hidden={!chromeVisible} animated />

      <ReaderView
        key={kind === 'comic' ? `comic-${settings.rtl}` : kind}
        ref={reader}
        engineUri={engineUri}
        bookUri={bookUri}
        kind={kind}
        initialLocation={stored?.location ?? null}
        initialPercent={stored?.percent ?? 0}
        cachedLocations={id ? cachedLocations(id) : undefined}
        settings={settings}
        font={font}
        theme={theme}
        insets={{ top: insets.top + IDLE_HEADER, bottom: insets.bottom + IDLE_FOOTER }}
        onEvent={handleEvent}
        onSelectionAction={onSelectionAction}
      />

      {/* Books keeps a quiet title line and a page count on screen at all times;
          the full chrome only appears on a centre tap. */}
      {!chromeVisible ? (
        <Animated.View
          entering={FadeIn.duration(240)}
          exiting={FadeOut.duration(140)}
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }}
        >
          <Text
            numberOfLines={1}
            style={[
              type_.caption,
              {
                color: theme.fg,
                opacity: 0.4,
                marginTop: insets.top + 4,
                maxWidth: '72%',
                textAlign: 'center',
              },
            ]}
          >
            {position?.chapter || item.Name}
          </Text>
        </Animated.View>
      ) : null}

      {!chromeVisible ? (
        <Animated.View
          entering={FadeIn.duration(240)}
          exiting={FadeOut.duration(140)}
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: insets.bottom + 5,
            left: 0,
            right: 0,
          }}
        >
          <View
            style={[
              readerColumn,
              { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 22 },
            ]}
          >
            <Text
              style={[
                type_.caption2,
                { color: theme.fg, opacity: 0.32, fontVariant: ['tabular-nums'] },
              ]}
            >
              {footerLabel(position, displayPercent)}
            </Text>
            <Text
              style={[
                type_.caption2,
                { color: theme.fg, opacity: 0.32, fontVariant: ['tabular-nums'] },
              ]}
            >
              {remainingLabel(position, displayPercent)}
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {chromeVisible ? (
        <>
          <Animated.View
            entering={FadeInUp.duration(220)}
            exiting={FadeOutUp.duration(180)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
          >
            <GlassSurface
              variant="regular"
              colorScheme={theme.dark ? 'dark' : 'light'}
              style={{ paddingTop: insets.top + 6, paddingBottom: 10 }}
            >
              <View
                style={[
                  readerColumn,
                  {
                    paddingHorizontal: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  },
                ]}
              >
              <ChromeButton icon="chevron.down" onPress={close} theme={theme} />
              <View style={{ flex: 1, paddingHorizontal: 6 }}>
                <Text numberOfLines={1} style={[type_.footnote, { color: theme.fg, fontWeight: '600' }]}>
                  {item.Name}
                </Text>
                {position?.chapter ? (
                  <Text numberOfLines={1} style={[type_.caption2, { color: theme.fg, opacity: 0.5 }]}>
                    {position.chapter}
                  </Text>
                ) : null}
              </View>
              <ChromeButton
                icon={bookmarked ? 'bookmark.fill' : 'bookmark'}
                onPress={() => {
                  holdChrome();
                  toggleBookmark();
                }}
                theme={theme}
                active={bookmarked}
              />
              <ChromeButton
                icon="list.bullet"
                onPress={() => {
                  holdChrome();
                  setShowContents(true);
                }}
                theme={theme}
              />
              <ChromeButton
                icon="textformat.size"
                onPress={() => {
                  holdChrome();
                  setShowAppearance(true);
                }}
                theme={theme}
              />
              </View>
            </GlassSurface>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.duration(220)}
            exiting={FadeOutDown.duration(180)}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
          >
            <GlassSurface
              variant="regular"
              colorScheme={theme.dark ? 'dark' : 'light'}
              style={{ paddingTop: 12, paddingBottom: insets.bottom + 12 }}
            >
              <View style={[readerColumn, { paddingHorizontal: 22, gap: 2 }]}>
              <Scrubber
                percent={displayPercent}
                width={chromeWidth - 44}
                color={theme.accent}
                trackColor={theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)'}
                onScrubbing={(active, value) => setScrubPercent(active ? value : null)}
                onSeek={(value) => {
                  reader.current?.goToPercent(value);
                  Haptics.selectionAsync();
                }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[type_.caption2, { color: theme.fg, opacity: 0.55, fontVariant: ['tabular-nums'] }]}>
                  {footerLabel(position, displayPercent)}
                </Text>
                <Text style={[type_.caption2, { color: theme.fg, opacity: 0.55 }]}>
                  {remainingLabel(position, displayPercent)}
                </Text>
              </View>
              </View>
            </GlassSurface>
          </Animated.View>
        </>
      ) : null}

      <ContentsSheet
        visible={showContents}
        onClose={() => setShowContents(false)}
        chapters={chapters}
        bookmarks={bookmarks}
        highlights={highlights}
        theme={theme}
        currentChapter={position?.chapter}
        onNavigate={(location) => reader.current?.goTo(location)}
        onDeleteBookmark={(bookmarkId) => {
          removeBookmark(bookmarkId);
          if (id) setBookmarks(listBookmarks(id));
        }}
        onDeleteHighlight={(highlightId) => {
          const target = highlights.find((h) => h.id === highlightId);
          if (target) reader.current?.unhighlight(target.location);
          removeHighlight(highlightId);
          if (id) setHighlights(listHighlights(id));
        }}
      />

      <AppearanceSheet
        visible={showAppearance}
        onClose={() => setShowAppearance(false)}
        settings={settings}
        onChange={updateSettings}
        theme={theme}
        kind={kind}
      />
    </View>
  );
}

function footerLabel(position: ReaderPosition | null, percent: number): string {
  if (position?.page && position?.pageCount) {
    return `${position.page} of ${position.pageCount}`;
  }
  return `${Math.round(percent * 100)}%`;
}

/** "9 pages left in chapter", the way Books frames progress. */
function remainingLabel(position: ReaderPosition | null, percent: number): string {
  if (position?.page && position?.pagesInChapter) {
    const left = Math.max(0, position.pagesInChapter - position.page);
    if (left === 0) return 'Last page in chapter';
    return `${left} page${left === 1 ? '' : 's'} left in chapter`;
  }
  if (position?.page && position?.pageCount) {
    const left = Math.max(0, position.pageCount - position.page);
    return `${left} page${left === 1 ? '' : 's'} left`;
  }
  return `${Math.round((1 - percent) * 100)}% left`;
}

function ChromeButton({
  icon,
  onPress,
  theme,
  active,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  onPress: () => void;
  theme: { fg: string; accent: string; dark: boolean };
  active?: boolean;
}) {
  return (
    <Press onPress={onPress} haptic="light" scaleTo={0.9}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)',
        }}
      >
        <Icon name={icon} size={16} color={active ? theme.accent : theme.fg} />
      </View>
    </Press>
  );
}
