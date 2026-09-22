import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { SHELF_ROOT } from '@/lib/storage';
import type { ReaderFont, ReaderSettings, ReaderTheme } from '@/state/reader';

import type { ReaderEvent, SelectionAction } from './protocol';

export interface ReaderHandle {
  next(): void;
  prev(): void;
  /** `flash` briefly marks the passage on arrival, for search hits. */
  goTo(location: string, flash?: boolean): void;
  goToPercent(percent: number): void;
  highlight(id: string, location: string, color: string): void;
  unhighlight(location: string): void;
  clearSelection(): void;
  /** Full-text search; hits come back as `search` events tagged with `id`. */
  search(id: number, query: string): void;
  cancelSearch(): void;
}

interface ReaderViewProps {
  engineUri: string;
  bookUri: string;
  kind: 'epub' | 'pdf' | 'comic';
  initialLocation?: string | null;
  initialPercent?: number;
  cachedLocations?: string;
  settings: ReaderSettings;
  font: ReaderFont;
  theme: ReaderTheme;
  insets: { top: number; bottom: number };
  onEvent(event: ReaderEvent): void;
  onSelectionAction(action: SelectionAction, text: string, location: string): void;
}

const SELECTION_MENU = [
  { label: 'Highlight', key: 'highlight' },
  { label: 'Add Note', key: 'note' },
];

/**
 * Path from `.jellyshelf/engine/reader.html` to the book, which may be a
 * Jellyfin download alongside it or one of your own files up in Documents.
 * Both sit under the read-access root, so a relative path reaches either.
 */
function relativeBookPath(bookUri: string, engineUri: string): string {
  const engineDir = engineUri.slice(0, engineUri.lastIndexOf('/') + 1);
  if (bookUri.startsWith(engineDir)) return bookUri.slice(engineDir.length);

  // Walk up to the shared root, then back down to the file.
  const rootUri = SHELF_ROOT.uri.replace(/\/?$/, '/');
  const fromRoot = bookUri.startsWith(rootUri) ? bookUri.slice(rootUri.length) : bookUri;
  const depth = engineDir.replace(rootUri, '').split('/').filter(Boolean).length;
  return `${'../'.repeat(depth)}${fromRoot}`;
}

function engineSettings(
  settings: ReaderSettings,
  font: ReaderFont,
  insets: { top: number; bottom: number },
) {
  return {
    fontFamily: font.stack,
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    margin: settings.margin,
    justify: settings.justify,
    flow: settings.flow,
    rtl: settings.rtl,
    leftHanded: settings.leftHanded,
    insetTop: insets.top,
    insetBottom: insets.bottom,
  };
}

export const ReaderView = forwardRef<ReaderHandle, ReaderViewProps>(function ReaderView(
  {
    engineUri,
    bookUri,
    kind,
    initialLocation,
    initialPercent,
    cachedLocations,
    settings,
    font,
    theme,
    insets,
    onEvent,
    onSelectionAction,
  },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const loadStarted = useRef(false);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const reportError = useCallback((message: string) => {
    if (readyTimer.current) clearTimeout(readyTimer.current);
    readyTimer.current = null;
    onEventRef.current({ type: 'error', message });
  }, []);

  useEffect(() => {
    if (loadStarted.current) return;
    // Only time out the local engine document, never a large book's download or decoding.
    readyTimer.current = setTimeout(() => {
      reportError('The reader did not start. Tap Retry to reload it. If this keeps happening, close and reopen Self-Shelf.');
    }, 20_000);
    return () => {
      if (readyTimer.current) clearTimeout(readyTimer.current);
      readyTimer.current = null;
    };
  }, [reportError]);

  const call = useCallback((expression: string) => {
    webRef.current?.injectJavaScript(`${expression}; true;`);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      next: () => call('window.JS.next()'),
      prev: () => call('window.JS.prev()'),
      goTo: (location, flash) => call(`window.JS.goTo(${JSON.stringify(location)}, ${!!flash})`),
      goToPercent: (percent) => call(`window.JS.goToPercent(${percent})`),
      highlight: (id, location, color) =>
        call(
          `window.JS.highlight(${JSON.stringify(id)}, ${JSON.stringify(location)}, ${JSON.stringify(color)})`,
        ),
      unhighlight: (location) => call(`window.JS.unhighlight(${JSON.stringify(location)})`),
      clearSelection: () => call('window.JS.clearSelection()'),
      search: (id, query) => call(`window.JS.search(${id}, ${JSON.stringify(query)})`),
      cancelSearch: () => call('window.JS.cancelSearch()'),
    }),
    [call],
  );

  // Push style changes down without reloading the book.
  const settingsPayload = useMemo(
    () => JSON.stringify(engineSettings(settings, font, insets)),
    [settings, font, insets],
  );
  const themePayload = useMemo(() => JSON.stringify(theme), [theme]);

  const lastSent = useRef({ settings: '', theme: '' });

  useEffect(() => {
    if (!ready || lastSent.current.settings === settingsPayload) return;
    lastSent.current.settings = settingsPayload;
    call(`window.JS.setSettings(${settingsPayload})`);
  }, [ready, settingsPayload, call]);

  useEffect(() => {
    if (!ready || lastSent.current.theme === themePayload) return;
    lastSent.current.theme = themePayload;
    call(`window.JS.setTheme(${themePayload})`);
  }, [ready, themePayload, call]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let parsed: ReaderEvent;
      try {
        parsed = JSON.parse(event.nativeEvent.data) as ReaderEvent;
      } catch {
        return;
      }

      if (parsed.type === 'ready') {
        if (loadStarted.current) return;
        loadStarted.current = true;
        if (readyTimer.current) clearTimeout(readyTimer.current);
        readyTimer.current = null;
        setReady(true);
        lastSent.current = { settings: settingsPayload, theme: themePayload };
        const payload = {
          managedLoading: true,
          kind,
          url: relativeBookPath(bookUri, engineUri),
          location: initialLocation ?? null,
          percent: initialPercent ?? 0,
          locations: cachedLocations ?? null,
          settings: JSON.parse(settingsPayload),
          theme: JSON.parse(themePayload),
        };
        // Catch bridge/API failures as well as rejections; engine-reported file
        // errors continue through the normal message path below.
        call(`(function () {
          function failed() {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'error',
              message: 'The reader could not start opening this file. Tap Retry. If it fails again, check that the file opens in another reader.'
            }));
          }
          try { Promise.resolve(window.JS.load(${JSON.stringify(payload)})).catch(failed); }
          catch (error) { failed(); }
        })()`);
      }

      if (parsed.type === 'selectionAction') {
        onSelectionAction(parsed.action, parsed.text, parsed.location);
        return;
      }

      onEvent(parsed);
    },
    [
      bookUri,
      cachedLocations,
      call,
      onSelectionAction,
      engineUri,
      initialLocation,
      initialPercent,
      kind,
      onEvent,
      settingsPayload,
      themePayload,
    ],
  );

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]}>
      <WebView
        ref={webRef}
        source={{ uri: engineUri }}
        // epub.js paints each chapter into a `srcdoc` iframe, so `about:` has to
        // be allowed or the navigation is handed off to Linking and the book
        // never renders.
        originWhitelist={['file://*', 'about:*']}
        onShouldStartLoadWithRequest={(request) => {
          const url = request.url ?? '';
          const internal = url.startsWith('file://') || url.startsWith('about:');
          // Footnote/citation links out to the web open in Safari instead of
          // navigating the reader away from the book.
          if (!internal && /^https?:\/\//.test(url)) {
            Linking.openURL(url).catch(() => {});
          }
          return internal;
        }}
        // The engine and the book file live under one root so file:// XHR works.
        allowingReadAccessToURL={SHELF_ROOT.uri}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        onMessage={handleMessage}
        bounces={false}
        overScrollMode="never"
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        menuItems={SELECTION_MENU}
        // The selection lives inside a chapter iframe, where the native menu
        // can't read it (selectedText comes back empty), so the engine is asked
        // for the text and CFI and answers with a `selectionAction` message.
        onCustomMenuSelection={(event) => {
          const action = event.nativeEvent.key as SelectionAction;
          if (__DEV__) console.log('[reader] menu', action);
          call(`window.JS.selectionAction(${JSON.stringify(action)})`);
        }}
        setSupportMultipleWindows={false}
        style={{ flex: 1, backgroundColor: theme.bg }}
        onError={() => reportError('The reader’s local files could not be opened. Tap Retry to reload them. If it still fails, close and reopen Self-Shelf.')}
        onContentProcessDidTerminate={() => reportError('iOS stopped the reader, often because memory is low. Close other apps and tap Retry. A smaller comic may help if it happens again.')}
        onRenderProcessGone={() => reportError('Android stopped the reader, often because memory is low. Close other apps and tap Retry. A smaller comic may help if it happens again.')}
      />
    </View>
  );
});
