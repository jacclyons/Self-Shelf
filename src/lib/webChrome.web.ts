/**
 * Page-level conventions a browser expects that a native app has no notion of:
 * pointer cursors, a keyboard focus ring, and not selecting the furniture.
 *
 * This is injected at runtime rather than written into the HTML shell because
 * Expo only renders `+html.tsx` when the web build is statically rendered, and
 * JellyShelf ships as a single-page app so it can be served from anywhere —
 * including next to Jellyfin itself.
 */

const STYLE_ID = 'jellyshelf-web-chrome';

const css = `
  /* The app paints its own background; this stops a white flash on load. */
  html, body { background-color: #0C0B0E; }
  @media (prefers-color-scheme: light) {
    html, body { background-color: #F7F3EC; }
  }

  body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    /* No grey flash on tap, and no rubber-band past the app's own scrollers. */
    -webkit-tap-highlight-color: transparent;
    overscroll-behavior: none;
  }

  /* A pointing device should be told what is clickable. */
  [role="button"], [role="link"], [role="tab"], button, a { cursor: pointer; }
  [aria-disabled="true"] { cursor: default; }

  /* Mouse users get no ring; keyboard users get a clear one. Text fields draw
     their own focus state in the app, so they keep only that. */
  :focus { outline: none; }
  :focus-visible {
    outline: 2px solid #7FCA83;
    outline-offset: 2px;
    border-radius: 10px;
  }
  input:focus-visible, textarea:focus-visible { outline: none; }

  /* Chrome is furniture, not content: dragging across it should not select it.
     The book's own text stays selectable — it lives in the reader's document. */
  #root { -webkit-user-select: none; user-select: none; }
  input, textarea { -webkit-user-select: text; user-select: text; }
`;

export function installWebChrome() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}
