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
  | { type: 'tap'; zone: 'left' | 'right' | 'center' }
  | { type: 'locations'; data: string }
  | { type: 'totalLocations'; total: number }
  | { type: 'error'; message: string }
  | { type: 'log'; message: string };

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
