import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

/**
 * Closes a screen that was pushed on top of something else.
 *
 * On device you can only reach these screens by navigating to them, so there is
 * always something behind. On web every route is also a URL: reloading inside
 * the reader, or opening a shared link to a book, starts a fresh history where
 * `back()` has nowhere to go and silently does nothing — a close button that
 * looks broken. Falling back to a sensible destination keeps the way out
 * working however the screen was reached.
 */
export function useDismissTo(fallback: Href) {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}
