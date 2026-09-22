/**
 * Motion preferences shared by the pieces of the app that animate for effect
 * rather than to show state: the 3D shelf and the ambient backdrop.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Follows the system Reduce Motion switch, including changes while mounted. */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}
