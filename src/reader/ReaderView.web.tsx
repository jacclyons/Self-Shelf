import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReaderFont, ReaderSettings, ReaderTheme } from '@/state/reader';
import { maxReaderWidth } from '@/ui/theme';

import type { ReaderEvent } from './protocol';

export interface ReaderHandle {
  next(): void;
  prev(): void;
  goTo(location: string): void;
  goToPercent(percent: number): void;
  highlight(id: string, location: string, color: string): void;
  unhighlight(location: string): void;
  clearSelection(): void;
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
  onSelectionAction(action: 'highlight' | 'note', text: string): void;
}

/** The engine's own API, exposed on the iframe's window once it is ready. */
interface EngineApi {
  load(payload: unknown): void;
  setSettings(settings: unknown): void;
  setTheme(theme: unknown): void;
  next(): void;
  prev(): void;
  goTo(location: string): void;
  goToPercent(percent: number): void;
  highlight(id: string, location: string, color: string): void;
  unhighlight(location: string): void;
  clearSelection(): void;
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
  const [selection, setSelection] = useState<string | null>(null);

  const engine = useCallback((): EngineApi | null => {
    const win = frameRef.current?.contentWindow as (Window & { JS?: EngineApi }) | null;
    return win?.JS ?? null;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      next: () => engine()?.next(),
      prev: () => engine()?.prev(),
      goTo: (location) => engine()?.goTo(location),
      goToPercent: (percent) => engine()?.goToPercent(percent),
      highlight: (id, location, color) => engine()?.highlight(id, location, color),
      unhighlight: (location) => engine()?.unhighlight(location),
      clearSelection: () => {
        setSelection(null);
        engine()?.clearSelection();
      },
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
        setReady(true);
        // Without this the arrow keys go nowhere until the reader is clicked.
        frameRef.current?.contentWindow?.focus();
        lastSent.current = { settings: settingsPayload, theme: themePayload };
        engine()?.load({
          kind,
          url: bookUri,
          location: initialLocation ?? null,
          percent: initialPercent ?? 0,
          locations: cachedLocations ?? null,
          settings: JSON.parse(settingsPayload),
          theme: JSON.parse(themePayload),
        });
      }

      // The floating bar stands in for the native selection menu.
      if (parsed.type === 'selection') setSelection(parsed.text);
      if (parsed.type === 'tap' || parsed.type === 'location') setSelection(null);

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
    settingsPayload,
    themePayload,
  ]);

  const act = useCallback(
    (action: 'highlight' | 'note') => {
      const text = selection ?? '';
      setSelection(null);
      engine()?.clearSelection();
      onSelectionAction(action, text);
    },
    [selection, engine, onSelectionAction],
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
          ref={frameRef}
          src={engineUri}
          title="Reader"
          style={{ border: 'none', width: '100%', height: '100%', backgroundColor: theme.bg }}
        />
      </View>

      {selection ? (
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
