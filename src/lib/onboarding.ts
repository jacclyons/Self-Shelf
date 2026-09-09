import { kvGet, kvSet } from '@/state/db';

/**
 * First-run walkthrough. The gate in `_layout` reads this synchronously on every
 * navigation, so it has to stay a plain SQLite lookup rather than async storage.
 *
 * Versioned: bumping the key re-shows the walkthrough to existing installs, which
 * is the only sane way to reintroduce it after the screens change materially.
 */
const ONBOARDING_KEY = 'onboarding.seen.v1';

export function hasSeenOnboarding(): boolean {
  return kvGet<boolean>(ONBOARDING_KEY, false);
}

export function markOnboardingSeen() {
  kvSet(ONBOARDING_KEY, true);
}
