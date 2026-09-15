import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOut, FadeOutDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBook, useProgressSync } from '@/api/hooks';
import { engineKindFor, formatOf, type BaseItem } from '@/api/types';
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
import { Icon } from '@/ui/Bits';
import { GlassSurface } from '@/ui/Glass';
import { Press } from '@/ui/Press';
import { maxReaderWidth, radius, readerColumn, type as type_ } from '@/ui/theme';

import { AppearanceSheet } from '@/reader/AppearanceSheet';
import { ContentsSheet } from '@/reader/ContentsSheet';
import { LoadingState, type OpeningProgress } from '@/reader/LoadingState';
import type { Chapter, ReaderEvent, ReaderPosition, SelectionAction } from '@/reader/protocol';
import { ReaderView, type ReaderHandle } from '@/reader/ReaderView';
import { Scrubber } from '@/reader/Scrubber';

const HIGHLIGHT_COLOR = '#F5C84C';

/** Space the always-visible title / page lines occupy above and below the text. */
const IDLE_HEADER = 30;
const IDLE_FOOTER = 26;

export default function Reader() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BookReader key={id} id={id} />;
}

/** Each route owns its source and retry lifecycle, independent of metadata refreshes. */
function BookReader({ id }: { id: string }) {
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
  const [item, setItem] = useState<BaseItem | undefined>(book.data);
  // A retry may use a renewed session, but an auth object refresh must not reopen a book.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettings());
  const [engineUri, setEngineUri] = useState<string | null>(null);
  const [bookUri, setBookUri] = useState<string | null>(null);
  const [loading, setLoading] = useState<OpeningProgress>({ stage: 'metadata' });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const currentAttempt = useRef(0);
  const loadedOnce = useRef(false);
  const stopped = useRef(false);
  const cancelPreparation = useRef<(() => void) | null>(null);

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

  const kind = item ? engineKindFor(formatOf(item)) : 'epub';
  const title = book.data?.Name || item?.Name || 'Your book';
  const { accent } = useAppearance();
  const theme = useMemo(() => themeFor(settings, accent), [settings, accent]);
  const font = useMemo(() => fontFor(settings), [settings]);
  const stored = id ? getProgress(id) : null;

  /* ------------------------------- progress ------------------------------- */

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<ReaderPosition | null>(null);

  const persist = useCallback(() => {
    const current = latest.current;
    if (!id || !current) return;
    saveProgress(id, current.percent, current.location, current.percent >= 0.995);
  }, [id]);

  const clearTimers = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (introTimer.current) clearTimeout(introTimer.current);
    saveTimer.current = null;
    introTimer.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      persist();
      flushProgress();
    };
  }, [clearTimers, flushProgress, persist]);

  const fail = useCallback((message: string) => {
    if (stopped.current) return;
    stopped.current = true;
    cancelPreparation.current?.();
    clearTimers();
    persist();
    setChromeVisible(false);
    setShowContents(false);
    setShowAppearance(false);
    setError(message);
  }, [clearTimers, persist]);

  /* --------------------------- prepare the book --------------------------- */

  useEffect(() => {
    if (item || stopped.current) return;
    // Keep the first usable source: local metadata enrichment and query refetches
    // must not restart preparation or swap the file beneath a loaded engine.
    if (book.data) setItem(book.data);
    else if (!id) fail('No book was selected. Close the reader and choose a book.');
    else if (!isLocalId(id) && !session) fail('Sign in to your server, then try opening this book again.');
    else if (book.isError && !book.isFetching) {
      fail(book.error?.message || 'Book details could not be fetched. Check your connection and tap Retry.');
    }
  }, [book.data, book.error, book.isError, book.isFetching, id, item, session, fail, attempt]);

  useEffect(() => {
    if (!item || stopped.current) return;
    const local = isLocalId(item.Id);
    const sourceSession = sessionRef.current;
    let cancelled = false;
    let task: ReturnType<typeof bookForReading> | null = null;
    const cancel = () => {
      cancelled = true;
      task?.cancel();
      task = null;
    };
    cancelPreparation.current = cancel;
    setLoading({ stage: 'preparing' });

    (async () => {
      try {
        if (!local && !sourceSession) throw new Error('Sign in to read this book.');
        const engine = await ensureReaderEngine();
        if (cancelled) return;
        setEngineUri(engine);

        // A book already in the Files folder needs no fetching.
        if (local) {
          const file = localFileFor(item.Id);
          if (!file) throw new Error('That file is no longer in your Self-Shelf folder.');
          setLoading({ stage: 'opening' });
          setBookUri(file.uri);
          return;
        }

        // Only a progress callback confirms a download; cache hits and web URLs
        // resolve without one. Zero also means an unknown total in older storage.
        if (!sourceSession) throw new Error('Sign in to read this book.');
        task = bookForReading(sourceSession, item, (fraction, bytes) => {
          if (!cancelled) setLoading({
            stage: 'download',
            fraction: typeof fraction === 'number' && fraction > 0 ? fraction : undefined,
            bytes,
          });
        });
        const file = await task.promise;
        task = null;
        if (cancelled) return;
        setLoading({ stage: 'opening' });
        setBookUri(file.uri);
      } catch (e) {
        if (!cancelled) fail((e as Error)?.message || 'This book could not be opened. Tap Retry to try again.');
      }
    })();

    return () => {
      cancel();
      if (cancelPreparation.current === cancel) cancelPreparation.current = null;
    };
  }, [item, attempt, fail]);

  useEffect(() => {
    if (!id) return;
    setBookmarks(listBookmarks(id));
    setHighlights(listHighlights(id));
  }, [id]);

  const close = useCallback(() => {
    stopped.current = true;
    cancelPreparation.current?.();
    clearTimers();
    persist();
    dismiss();
  }, [clearTimers, persist, dismiss]);

  const retry = useCallback(() => {
    if (!stopped.current) return;
    cancelPreparation.current?.();
    clearTimers();
    persist();
    currentAttempt.current += 1;
    loadedOnce.current = false;
    stopped.current = false;
    setLoaded(false);
    setChromeVisible(false);
    setShowContents(false);
    setShowAppearance(false);
    setScrubPercent(null);
    setChapters([]);
    lastSelection.current = null;
    setError(null);
    setEngineUri(null);
    setBookUri(null);
    setLoading({ stage: item ? 'preparing' : 'metadata' });
    setAttempt(currentAttempt.current);
    if (!item && id && (isLocalId(id) || sessionRef.current)) void book.refetch();
  }, [book.refetch, clearTimers, id, item, persist]);

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
      if (attempt !== currentAttempt.current || stopped.current) return;
      switch (event.type) {
        case 'loading':
          // Comics may keep unpacking neighbours after the visible page is ready.
          if (!loadedOnce.current) setLoading(event);
          break;

        case 'loaded':
          if (loadedOnce.current) break;
          loadedOnce.current = true;
          setLoaded(true);
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
          if (!loadedOnce.current) break;
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
          close();
          break;

        case 'error':
          fail(event.message);
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
    [attempt, id, persist, close, fail],
  );

  const onSelectionAction = useCallback(
    (action: SelectionAction, text: string, location: string) => {
      if (attempt !== currentAttempt.current || stopped.current || !loadedOnce.current) return;
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
    [attempt, id],
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

  /* --------------------------------- render -------------------------------- */

  const opening = !loaded || !!error;
  const displayPercent = scrubPercent ?? position?.percent ?? stored?.percent ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} hidden={!opening && !chromeVisible} animated />

      {engineUri && bookUri && item && !error ? (
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents={opening ? 'none' : 'auto'}
          accessibilityElementsHidden={opening}
          importantForAccessibility={opening ? 'no-hide-descendants' : 'auto'}
          aria-hidden={opening}
        >
          <ReaderView
            key={attempt}
            ref={reader}
            engineUri={engineUri}
            bookUri={bookUri}
            kind={kind}
            initialLocation={latest.current?.location ?? stored?.location ?? null}
            initialPercent={latest.current?.percent ?? stored?.percent ?? 0}
            cachedLocations={id ? cachedLocations(id) : undefined}
            settings={settings}
            font={font}
            theme={theme}
            insets={{ top: insets.top + IDLE_HEADER, bottom: insets.bottom + IDLE_FOOTER }}
            onEvent={handleEvent}
            onSelectionAction={onSelectionAction}
          />
        </View>
      ) : null}

      {/* Books keeps a quiet title line and a page count on screen at all times;
          the full chrome only appears on a centre tap. */}
      {!opening && !chromeVisible ? (
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
            {position?.chapter || title}
          </Text>
        </Animated.View>
      ) : null}

      {!opening && !chromeVisible ? (
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

      {!opening && chromeVisible ? (
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
                  {title}
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
        visible={!opening && showContents}
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
        visible={!opening && showAppearance}
        onClose={() => setShowAppearance(false)}
        settings={settings}
        onChange={updateSettings}
        theme={theme}
        kind={kind}
      />

      {opening ? (
        <LoadingState
          title={title}
          progress={loading}
          error={error}
          comic={kind === 'comic'}
          theme={theme}
          insets={insets}
          onRetry={retry}
          onClose={close}
        />
      ) : null}
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
