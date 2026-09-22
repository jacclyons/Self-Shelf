/** Progress is per stage, not an invented percentage of the entire opening process. */
export interface ReaderLoadingProgress {
  stage: 'download' | 'reading' | 'unpacking' | 'rendering';
  fraction?: number;
  bytes?: number;
  completed?: number;
  total?: number;
}

/** Messages the reader engine (WebView) posts back to React Native. */
export type ReaderEvent =
  | { type: 'ready' }
  | ({ type: 'loading' } & ReaderLoadingProgress)
  | { type: 'loaded'; kind: 'epub' | 'pdf' | 'comic'; title?: string; author?: string; pageCount?: number; chapters: Chapter[] }
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
  /**
   * Hits for the `search` command that carries this id, a chapter (or PDF
   * page) at a time. The last message has `done` and no hits of its own.
   */
  | { type: 'search'; id: number; results: SearchHit[]; done: boolean }
  | { type: 'totalLocations'; total: number }
  /** Escape from inside the engine; the host decides what closing means. */
  | { type: 'dismiss' }
  | { type: 'error'; message: string }
  | { type: 'log'; message: string };

/** The two things the selection menu can do with a passage. */
export type SelectionAction = 'highlight' | 'note';

/** One full-text match: the hit and a run of words either side of it. */
export interface SearchHit {
  /** Somewhere `goTo` can take you: a range CFI for EPUBs, a page number for PDFs. */
  location: string;
  /** The chapter the hit is in, from the table of contents, if it has one. */
  chapter: string | null;
  /** PDFs only. */
  page?: number;
  before: string;
  match: string;
  after: string;
}

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
