import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReaderFont, ReaderSettings, ReaderTheme } from '@/state/reader';
import { maxReaderWidth } from '@/ui/theme';

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

/** The engine's own API, exposed on the iframe's window once it is ready. */
interface EngineApi {
  load(payload: unknown): void | Promise<void>;
  dispose(): void;
  setSettings(settings: unknown): void;
  setTheme(theme: unknown): void;
  next(): void;
  prev(): void;
  goTo(location: string, flash?: boolean): void;
  goToPercent(percent: number): void;
  highlight(id: string, location: string, color: string): void;
  unhighlight(location: string): void;
  selectionAction(action: SelectionAction): void;
  clearSelection(): void;
  search(id: number, query: string): void;
  cancelSearch(): void;
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

/**
 * Web twin of `ReaderView.tsx`.
 *
 * The engine is the same `reader.html`, but the host around it differs:
 *
 *   - it runs in a same-origin iframe rather than a WKWebView, so instead of
 *     injecting source we call `window.JS` on the frame directly, and events
 *     arrive as `postMessage` rather than `onMessage`;
 *   - the book is an absolute URL the engine fetches from Jellyfin, not a
 *     relative path under a shared `file://` root;
 *   - WKWebView's custom selection menu has no browser equivalent, so the
 *     Highlight / Add Note actions are rendered here as a floating bar.
 */
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
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
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
    // Browsers often fire iframe load even for error pages, and may omit error.
    // This watches only the engine handshake, not a slow book or solid archive.
    readyTimer.current = setTimeout(() => {
      reportError('The reader page did not start. Check your connection and tap Retry. If it still fails, reload Self-Shelf and check that browser extensions are not blocking the reader.');
    }, 20_000);
    return () => {
      if (readyTimer.current) clearTimeout(readyTimer.current);
      readyTimer.current = null;
    };
  }, [reportError]);

  useEffect(() => {
    // Do not steal keyboard or screen-reader focus from Close while opening.
    if (loaded) frameRef.current?.contentWindow?.focus();
  }, [loaded]);

  const engine = useCallback((): EngineApi | null => {
    const win = frameRef.current?.contentWindow as (Window & { JS?: EngineApi }) | null;
    return win?.JS ?? null;
  }, []);

  const attachFrame = useCallback((frame: HTMLIFrameElement | null) => {
    if (!frame && frameRef.current) {
      // An in-flight load Promise can retain the iframe Window after detachment.
      try { engine()?.dispose(); } catch { /* The frame may already be gone. */ }
    }
    frameRef.current = frame;
  }, [engine]);

  useImperativeHandle(
    ref,
    () => ({
      next: () => engine()?.next(),
      prev: () => engine()?.prev(),
      goTo: (location, flash) => engine()?.goTo(location, !!flash),
      goToPercent: (percent) => engine()?.goToPercent(percent),
      highlight: (id, location, color) => engine()?.highlight(id, location, color),
      unhighlight: (location) => engine()?.unhighlight(location),
      clearSelection: () => {
        setSelection(null);
        engine()?.clearSelection();
      },
      search: (id, query) => engine()?.search(id, query),
      cancelSearch: () => engine()?.cancelSearch(),
    }),
    [engine],
  );

  const settingsPayload = useMemo(
    () => JSON.stringify(engineSettings(settings, font, insets)),
    [settings, font, insets],
  );
  const themePayload = useMemo(() => JSON.stringify(theme), [theme]);

  const lastSent = useRef({ settings: '', theme: '' });

  useEffect(() => {
    if (!ready || lastSent.current.settings === settingsPayload) return;
    lastSent.current.settings = settingsPayload;
    engine()?.setSettings(JSON.parse(settingsPayload));
  }, [ready, settingsPayload, engine]);

  useEffect(() => {
    if (!ready || lastSent.current.theme === themePayload) return;
    lastSent.current.theme = themePayload;
    engine()?.setTheme(JSON.parse(themePayload));
  }, [ready, themePayload, engine]);

  useEffect(() => {
    function handle(event: MessageEvent) {
      // Only this frame's messages; the page may host other embeds.
      if (event.source !== frameRef.current?.contentWindow) return;
      if (typeof event.data !== 'string') return;

      let parsed: ReaderEvent;
      try {
        parsed = JSON.parse(event.data) as ReaderEvent;
      } catch {
        return;
      }

      if (parsed.type === 'ready') {
        if (loadStarted.current) return;
        loadStarted.current = true;
        if (readyTimer.current) clearTimeout(readyTimer.current);
        readyTimer.current = null;
        const failed = () => reportError('The reader could not start opening this file. Tap Retry. If it still fails, check your server connection and that the file opens in another reader.');
        try {
          const api = engine();
          if (!api) {
            failed();
            return;
          }
          setReady(true);
          lastSent.current = { settings: settingsPayload, theme: themePayload };
          Promise.resolve(api.load({
            managedLoading: true,
            kind,
            url: bookUri,
            location: initialLocation ?? null,
            percent: initialPercent ?? 0,
            locations: cachedLocations ?? null,
            settings: JSON.parse(settingsPayload),
            theme: JSON.parse(themePayload),
          })).catch(failed);
        } catch {
          failed();
          return;
        }
      }

      if (parsed.type === 'loaded') setLoaded(true);

      // The floating bar stands in for the native selection menu.
      if (parsed.type === 'selection') setSelection(parsed.text);
      if (parsed.type === 'tap' || parsed.type === 'location') setSelection(null);
      if (parsed.type === 'selectionAction') {
        setSelection(null);
        engine()?.clearSelection();
        onSelectionAction(parsed.action, parsed.text, parsed.location);
        return;
      }

      onEvent(parsed);
    }

    window.addEventListener('message', handle);
    return () => window.removeEventListener('message', handle);
  }, [
    bookUri,
    cachedLocations,
    engine,
    initialLocation,
    initialPercent,
    kind,
    onEvent,
    onSelectionAction,
    reportError,
    settingsPayload,
    themePayload,
  ]);

  // The engine resolves the selection and answers with `selectionAction`.
  const act = useCallback(
    (action: SelectionAction) => engine()?.selectionAction(action),
    [engine],
  );

  // Prose gets a column: a 2000px line length is unreadable, and the engine
  // measures its own pages against whatever width it is given. Comics and PDFs
  // are images and want every pixel of the window.
  const paged = kind === 'epub';

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]}>
      <View
        style={[
          { flex: 1, width: '100%', backgroundColor: theme.bg },
          paged ? { maxWidth: maxReaderWidth, alignSelf: 'center' } : null,
        ]}
      >
        <iframe
          ref={attachFrame}
          src={engineUri}
          title="Reader"
          tabIndex={loaded ? 0 : -1}
          aria-hidden={!loaded}
          onError={() => reportError('The reader page could not be loaded. Check your connection and tap Retry, or reload Self-Shelf.')}
          onLoad={() => {
            try {
              if (typeof engine()?.load === 'function') return;
            } catch {
              // A redirect or blocked document can make the frame inaccessible.
            }
            reportError('The reader page is missing or blocked. Tap Retry. If it still fails, reload Self-Shelf and check your browser’s content blockers.');
          }}
          style={{ border: 'none', width: '100%', height: '100%', backgroundColor: theme.bg, visibility: loaded ? 'visible' : 'hidden' }}
        />
      </View>

      {loaded && selection ? (
        <View style={styles.bar}>
          {(['highlight', 'note'] as const).map((action) => (
            <Pressable key={action} onPress={() => act(action)} style={styles.action}>
              <Text style={styles.label}>{action === 'highlight' ? 'Highlight' : 'Add Note'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 96,
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(28,28,30,0.96)',
    boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
  },
  action: { paddingVertical: 10, paddingHorizontal: 18 },
  label: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
