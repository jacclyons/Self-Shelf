/** Messages the reader engine (WebView) posts back to React Native. */
export type ReaderEvent =
  | { type: 'ready' }
  | { type: 'loaded'; kind: 'epub' | 'pdf'; title?: string; author?: string; pageCount?: number; chapters: Chapter[] }
  | {
      type: 'location';
      percent: number;
      location: string;
      chapter?: string | null;
      page?: number | null;
      pageCount?: number | null;
      pagesInChapter?: number | null;
      atStart?: boolean;
      atEnd?: boolean;
    }
  | { type: 'selection'; text: string; location: string }
  /** The engine's answer to `selectionAction`: what to act on, resolved at the moment of the tap. */
  | { type: 'selectionAction'; action: SelectionAction; text: string; location: string }
  | { type: 'tap'; zone: 'left' | 'right' | 'center' }
  | { type: 'locations'; data: string }
  | { type: 'totalLocations'; total: number }
  /** Escape from inside the engine; the host decides what closing means. */
  | { type: 'dismiss' }
  | { type: 'error'; message: string }
  | { type: 'log'; message: string };

/** The two things the selection menu can do with a passage. */
export type SelectionAction = 'highlight' | 'note';

export interface Chapter {
  label: string;
  href: string | null;
  depth: number;
}

export interface ReaderPosition {
  percent: number;
  location: string;
  chapter?: string | null;
  page?: number | null;
  pageCount?: number | null;
  pagesInChapter?: number | null;
  atStart?: boolean;
  atEnd?: boolean;
}
