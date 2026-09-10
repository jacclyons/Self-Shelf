import type { SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { useTheme } from './theme';

/**
 * Browser twin of `Icon.tsx`.
 *
 * SF Symbols are an iOS system font with no web equivalent, so the glyphs the
 * app asks for are redrawn here on a 24x24 grid. They are stroked with round
 * caps to sit closer to SF Symbols than a filled Material set would, and they
 * ship as paths rather than a webfont so a self-hosted install never reaches
 * out to a CDN for its chrome.
 *
 * Names are the SF Symbol names used elsewhere in the app; anything unmapped
 * falls back to a neutral dot so layout never shifts.
 */

type IconName = SymbolViewProps['name'];

/** Filled SF variants map onto the same drawing, painted rather than stroked. */
const FILLABLE = new Set([
  'book.fill',
  'bookmark.fill',
  'heart.fill',
  'person.fill',
  'books.vertical.fill',
  'checkmark.circle.fill',
  'arrow.down.circle.fill',
  'exclamationmark.triangle.fill',
  'checkmark.seal.fill',
]);

function glyph(name: string, filled: boolean): ReactNode {
  const solid = filled ? 'currentColor' : 'none';

  switch (name) {
    case 'book.closed':
    case 'book.fill':
      // Filled, the spine has to be a separate shape: a stroked line over a
      // solid body would vanish into it at the sizes this is used at.
      return filled ? (
        <>
          <Path d="M5.4 5.2A2.2 2.2 0 0 1 7.6 3h.9v18h-.9a2.2 2.2 0 0 1-2.2-2.2z" fill={solid} stroke="none" />
          <Path d="M10 3h8.6v18H10z" fill={solid} stroke="none" />
        </>
      ) : (
        <>
          <Path d="M5.5 5.2A2.2 2.2 0 0 1 7.7 3H18.5v18H7.7a2.2 2.2 0 0 1-2.2-2.2z" />
          <Path d="M8.6 3v18" />
        </>
      );

    case 'sun.max':
      return (
        <>
          <Circle cx="12" cy="12" r="4.3" />
          <Path d="M12 2.6v2.3M12 19.1v2.3M21.4 12h-2.3M5.2 12H2.9M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6L17 17M7 7L5.4 5.4" />
        </>
      );

    case 'moon':
      return <Path d="M20.4 14.2A8.8 8.8 0 0 1 9.8 3.6a8.8 8.8 0 1 0 10.6 10.6z" />;

    case 'circle.lefthalf.filled':
      return (
        <>
          <Circle cx="12" cy="12" r="8.6" />
          <Path d="M12 3.4a8.6 8.6 0 0 0 0 17.2z" fill="currentColor" stroke="none" />
        </>
      );

    case 'heart':
      return (
        <Path d="M12 20.4C6.8 16.7 3.6 13.7 3.6 10.2A4.4 4.4 0 0 1 12 8a4.4 4.4 0 0 1 8.4 2.2c0 3.5-3.2 6.5-8.4 10.2z" />
      );

    case 'bookmark':
      return <Path d="M6.8 3.6h10.4v17l-5.2-4.3-5.2 4.3z" />;

    case 'books.vertical':
    case 'books.vertical.fill':
      return (
        <>
          <Rect x="4" y="4" width="4" height="16" rx="1.2" fill={solid} />
          <Rect x="10" y="4" width="4" height="16" rx="1.2" fill={solid} />
          <Path d="M16.4 5.4l3.4 1 -3.2 13.2 -3.4-1z" fill={solid} />
        </>
      );

    case 'bookmark.fill':
      return <Path d="M6.8 3.6h10.4v17l-5.2-4.3-5.2 4.3z" fill={solid} />;

    case 'heart.fill':
      return (
        <Path
          d="M12 20.4C6.8 16.7 3.6 13.7 3.6 10.2A4.4 4.4 0 0 1 12 8a4.4 4.4 0 0 1 8.4 2.2c0 3.5-3.2 6.5-8.4 10.2z"
          fill={solid}
        />
      );

    case 'checkmark':
      return <Path d="M4.6 12.6l4.8 4.8L19.4 6.8" />;

    case 'checkmark.circle.fill':
    case 'checkmark.seal':
    case 'checkmark.seal.fill':
      return (
        <>
          <Circle cx="12" cy="12" r="8.6" fill={solid} />
          <Path d="M8 12.3l2.9 2.9L16.2 9.6" stroke={filled ? '#fff' : 'currentColor'} />
        </>
      );

    case 'chevron.down':
      return <Path d="M5.4 9.2L12 15.8l6.6-6.6" />;
    case 'chevron.up':
      return <Path d="M5.4 14.8L12 8.2l6.6 6.6" />;
    case 'chevron.right':
      return <Path d="M9.2 5.4L15.8 12l-6.6 6.6" />;

    case 'xmark':
      return (
        <>
          <Path d="M6.2 6.2l11.6 11.6" />
          <Path d="M17.8 6.2L6.2 17.8" />
        </>
      );

    case 'plus':
      return (
        <>
          <Path d="M12 5v14" />
          <Path d="M5 12h14" />
        </>
      );

    case 'magnifyingglass':
      return (
        <>
          <Circle cx="10.8" cy="10.8" r="6.2" />
          <Path d="M15.4 15.4L20 20" />
        </>
      );

    case 'sparkle.magnifyingglass':
      return (
        <>
          <Circle cx="10.4" cy="10.4" r="5.8" />
          <Path d="M14.8 14.8L19.6 19.6" />
          <Path d="M10.4 7.2l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" />
        </>
      );

    case 'sparkles':
      return (
        <>
          <Path d="M11 3.4l1.7 4.4 4.4 1.7-4.4 1.7L11 15.6 9.3 11.2 4.9 9.5l4.4-1.7z" />
          <Path d="M17.6 14.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
        </>
      );

    case 'arrow.down.circle':
    case 'arrow.down.circle.fill':
      return (
        <>
          <Circle cx="12" cy="12" r="8.6" fill={solid} />
          <Path d="M12 7.6v8" stroke={filled ? '#fff' : 'currentColor'} />
          <Path d="M8.6 12.2L12 15.6l3.4-3.4" stroke={filled ? '#fff' : 'currentColor'} />
        </>
      );

    case 'arrow.up.arrow.down':
      return (
        <>
          <Path d="M7.2 20V4.6" />
          <Path d="M3.8 8L7.2 4.6 10.6 8" />
          <Path d="M16.8 4v15.4" />
          <Path d="M13.4 16l3.4 3.4L20.2 16" />
        </>
      );

    case 'exclamationmark.triangle':
    case 'exclamationmark.triangle.fill':
      return (
        <>
          <Path d="M12 3.8l9.2 15.8H2.8z" fill={solid} />
          <Path d="M12 9.6v4.2" stroke={filled ? '#fff' : 'currentColor'} />
          <Path d="M12 16.9v.1" stroke={filled ? '#fff' : 'currentColor'} />
        </>
      );

    case 'gearshape':
      return (
        <>
          <Circle cx="12" cy="12" r="3.1" />
          <Path d="M12 2.6v2.8M12 18.6v2.8M21.4 12h-2.8M5.4 12H2.6M18.6 5.4l-2 2M7.4 16.6l-2 2M18.6 18.6l-2-2M7.4 7.4l-2-2" />
        </>
      );

    case 'info.circle':
      return (
        <>
          <Circle cx="12" cy="12" r="8.6" />
          <Path d="M12 11.2v5.4" />
          <Path d="M12 7.8v.1" />
        </>
      );

    case 'iphone':
      return (
        <>
          <Rect x="6.6" y="2.4" width="10.8" height="19.2" rx="2.6" />
          <Path d="M10.6 5.2h2.8" />
        </>
      );

    case 'list.bullet':
      return (
        <>
          <Path d="M9 6.6h11M9 12h11M9 17.4h11" />
          <Path d="M4.6 6.6v.1M4.6 12v.1M4.6 17.4v.1" />
        </>
      );

    case 'lock':
      return (
        <>
          <Rect x="4.6" y="10.4" width="14.8" height="10.2" rx="2.4" />
          <Path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6" />
        </>
      );

    case 'person':
    case 'person.fill':
      return (
        <>
          <Circle cx="12" cy="7.8" r="3.6" fill={solid} />
          <Path d="M4.8 20.4a7.2 7.2 0 0 1 14.4 0" fill={solid} />
        </>
      );

    case 'qrcode':
      return (
        <>
          <Rect x="3.6" y="3.6" width="6.4" height="6.4" rx="1.2" />
          <Rect x="14" y="3.6" width="6.4" height="6.4" rx="1.2" />
          <Rect x="3.6" y="14" width="6.4" height="6.4" rx="1.2" />
          <Path d="M14 14h3v3h-3zM17.4 17.4h3v3h-3z" />
        </>
      );

    case 'safari':
      return (
        <>
          <Circle cx="12" cy="12" r="8.6" />
          <Path d="M15.8 8.2l-2.2 5.4-5.4 2.2 2.2-5.4z" />
        </>
      );

    case 'server.rack':
      return (
        <>
          <Rect x="3.4" y="4.2" width="17.2" height="6.2" rx="1.8" />
          <Rect x="3.4" y="13.6" width="17.2" height="6.2" rx="1.8" />
          <Path d="M7 7.3v.1M7 16.7v.1" />
        </>
      );

    case 'textformat.size':
      return (
        <>
          <Path d="M2.8 18.4l4-9.6 4 9.6" />
          <Path d="M4.2 15.2h5.2" />
          <Path d="M12.6 18.4l4.4-11.2 4.4 11.2" />
          <Path d="M14.2 14.6h6.4" />
        </>
      );

    case 'stop.circle':
      return (
        <>
          <Circle cx="12" cy="12" r="8.6" />
          <Rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1.4" />
        </>
      );

    case 'trash':
      return (
        <>
          <Path d="M3.8 6.4h16.4" />
          <Path d="M9.4 6.4V4.6a1.4 1.4 0 0 1 1.4-1.4h2.4a1.4 1.4 0 0 1 1.4 1.4v1.8" />
          <Path d="M5.8 6.4l1 13a1.8 1.8 0 0 0 1.8 1.6h6.8a1.8 1.8 0 0 0 1.8-1.6l1-13" />
        </>
      );

    case 'wifi.slash':
      return (
        <>
          <Path d="M2.6 8.6a15 15 0 0 1 18.8 0" />
          <Path d="M6 12.4a10 10 0 0 1 12 0" />
          <Path d="M9.4 16.2a5 5 0 0 1 5.2 0" />
          <Path d="M12 19.8v.1" />
          <Path d="M3.6 3.6l16.8 16.8" />
        </>
      );

    default:
      return <Circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none" />;
  }
}

export function Icon({
  name,
  size = 20,
  color,
  weight = 'semibold',
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  weight?: SymbolViewProps['weight'];
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const tint = color ?? theme.text;
  const filled = FILLABLE.has(name as string);
  const stroke = weight === 'bold' || weight === 'heavy' ? 2.2 : weight === 'light' ? 1.5 : 1.9;

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" color={tint}>
        <G
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {glyph(name as string, filled)}
        </G>
      </Svg>
    </View>
  );
}
