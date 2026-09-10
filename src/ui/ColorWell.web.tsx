import type { ColorWellProps } from './ColorWell';

/**
 * Browser twin of `ColorWell.tsx`, drawn to look like the iOS well: a rainbow
 * ring around the current colour. A real `<input type="color">` sits invisibly
 * on top, so a click opens the browser's own picker.
 */
export const colorWellAvailable = true;

const WHEEL =
  'conic-gradient(#FF3B30, #FFCC00, #34C759, #00C7BE, #007AFF, #AF52DE, #FF2D55, #FF3B30)';

export function ColorWell({ color, onChange, label }: ColorWellProps) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'block',
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: WHEEL,
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: 4,
          borderRadius: '50%',
          background: color,
          // A hairline of white between the ring and the colour, as on iOS.
          boxShadow: '0 0 0 1.5px #FFFFFF',
        }}
      />
      <input
        type="color"
        aria-label={label}
        value={color.toLowerCase()}
        onChange={(e) => onChange(e.target.value)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          padding: 0,
          border: 0,
          opacity: 0,
          cursor: 'pointer',
        }}
      />
    </label>
  );
}
