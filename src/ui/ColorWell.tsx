/**
 * A round colour well that opens the platform's own colour picker, used for
 * the custom accent in Settings. Twins: `ColorWell.ios.tsx` (SwiftUI's
 * `ColorPicker`) and `ColorWell.web.tsx` (the browser's `<input type="color">`).
 *
 * This file is the Android build, which has no system picker to hand, so it
 * renders nothing and Settings leaves the custom slot out.
 */
export interface ColorWellProps {
  /** The colour to show and to open the picker on, as `#RRGGBB`. */
  color: string;
  /** Called with `#RRGGBB` as the user picks, repeatedly while they drag. */
  onChange(color: string): void;
  /** What a screen reader calls the well. */
  label: string;
}

export const colorWellAvailable = false;

export function ColorWell(_props: ColorWellProps) {
  return null;
}
