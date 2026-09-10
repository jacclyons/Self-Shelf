import type { AppearanceChoice, Scheme } from '@/state/appearance';

/**
 * Browser twin of `appChrome.ts`.
 *
 * `color-scheme` is what tells the browser to render its own furniture — form
 * controls, scrollbars, the overscroll gutter — light or dark. Without it a
 * user who picks Dark while their OS is set to Light gets a dark app framed by
 * white scrollbars. `theme-color` does the same for mobile browser chrome.
 *
 * These are inline styles so they win over the default in `webChrome.web.ts`,
 * which is only there to cover the moment before this runs.
 */
export function applyAppChrome(
  scheme: Scheme,
  background: string,
  _choice: AppearanceChoice,
) {
  if (typeof document === 'undefined') return;

  document.documentElement.style.colorScheme = scheme;
  document.documentElement.style.backgroundColor = background;
  document.body.style.backgroundColor = background;

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = background;
}
