import { ColorPicker, Host } from '@expo/ui/swift-ui';
import { labelsHidden } from '@expo/ui/swift-ui/modifiers';

import type { ColorWellProps } from './ColorWell';

/**
 * iOS twin of `ColorWell.tsx`: SwiftUI's own `ColorPicker`. With its label
 * hidden it's just the familiar rainbow-ringed well, and tapping it opens the
 * system colour sheet (grid, spectrum, sliders and eyedropper).
 */
export const colorWellAvailable = true;

export function ColorWell({ color, onChange, label }: ColorWellProps) {
  return (
    <Host matchContents>
      <ColorPicker
        // Still read by VoiceOver when hidden.
        label={label}
        selection={color}
        supportsOpacity={false}
        onSelectionChange={(hex) => onChange(hex.slice(0, 7))}
        modifiers={[labelsHidden()]}
      />
    </Host>
  );
}
