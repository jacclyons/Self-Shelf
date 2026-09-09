import { useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/ui/Bits';
import { Press } from '@/ui/Press';
import { radius, type as type_ } from '@/ui/theme';
import {
  FONT_SIZE_RANGE,
  READER_FONTS,
  READER_THEMES,
  type ReaderSettings,
  type ReaderTheme,
} from '@/state/reader';

import { Sheet } from './Sheet';

interface AppearanceSheetProps {
  visible: boolean;
  onClose(): void;
  settings: ReaderSettings;
  onChange(patch: Partial<ReaderSettings>): void;
  theme: ReaderTheme;
  kind: 'epub' | 'pdf' | 'comic';
}

/**
 * The "aA" panel, laid out the way Books does it: size and layout on top,
 * brightness, then the theme grid, with the fiddly typography controls tucked
 * behind Customize so the common case stays two taps.
 */
export function AppearanceSheet({
  visible,
  onClose,
  settings,
  onChange,
  theme,
  kind,
}: AppearanceSheetProps) {
  const { width } = useWindowDimensions();
  const [customizing, setCustomizing] = useState(false);

  const muted = theme.dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
  const chipBg = theme.dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.055)';
  const tileBorder = theme.dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)';

  const sheetPadding = 20;
  const gridGap = 10;
  const tileWidth = (width - 20 - sheetPadding * 2 - gridGap * 2) / 3;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Themes & Settings"
      maxHeight="86%"
      dark={theme.dark}
    >
      <View style={{ paddingHorizontal: sheetPadding, gap: 18 }}>
        {kind === 'epub' ? (
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: chipBg,
              borderRadius: radius.md,
              overflow: 'hidden',
            }}
          >
            <SizeStep
              label="A"
              size={15}
              color={theme.fg}
              disabled={settings.fontSize <= FONT_SIZE_RANGE.min}
              onPress={() =>
                onChange({
                  fontSize: Math.max(FONT_SIZE_RANGE.min, settings.fontSize - FONT_SIZE_RANGE.step),
                })
              }
            />
            <View style={{ width: 1, backgroundColor: tileBorder }} />
            <SizeStep
              label="A"
              size={23}
              color={theme.fg}
              disabled={settings.fontSize >= FONT_SIZE_RANGE.max}
              onPress={() =>
                onChange({
                  fontSize: Math.min(FONT_SIZE_RANGE.max, settings.fontSize + FONT_SIZE_RANGE.step),
                })
              }
            />
          </View>
        ) : null}

        {kind === 'comic' ? (
          <Segmented
            label="Reading Direction"
            muted={muted}
            background={chipBg}
            accent={theme.accent}
            fg={theme.fg}
            value={settings.rtl ? 'rtl' : 'ltr'}
            options={[
              { label: 'Left to Right', value: 'ltr' as const },
              { label: 'Right to Left', value: 'rtl' as const },
            ]}
            onChange={(value) => onChange({ rtl: value === 'rtl' })}
          />
        ) : null}

        {/* --------------------------- theme grid --------------------------- */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
          {READER_THEMES.map((option) => {
            const selected = settings.themeId === option.id;
            return (
              <Press
                key={option.id}
                haptic="selection"
                scaleTo={0.94}
                onPress={() => onChange({ themeId: option.id })}
              >
                <View
                  style={{
                    width: tileWidth,
                    height: tileWidth * 0.72,
                    borderRadius: radius.md,
                    backgroundColor: option.bg,
                    borderWidth: selected ? 2.5 : 1,
                    borderColor: selected ? theme.accent : tileBorder,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                  }}
                >
                  <Text
                    style={{
                      color: option.fg,
                      fontSize: 25,
                      fontWeight: option.bold ? '800' : '500',
                      fontFamily: 'Georgia',
                    }}
                  >
                    Aa
                  </Text>
                  <Text style={{ color: option.fg, fontSize: 11, opacity: 0.66 }}>
                    {option.name}
                  </Text>
                </View>
              </Press>
            );
          })}
        </View>

        {/* ---------------------------- customize --------------------------- */}
        {kind === 'epub' ? (
          <Press haptic="light" scaleTo={0.98} onPress={() => setCustomizing((v) => !v)}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                paddingVertical: 13,
                borderRadius: radius.md,
                backgroundColor: chipBg,
              }}
            >
              <Icon name="gearshape" size={14} color={theme.fg} />
              <Text style={[type_.subhead, { color: theme.fg, fontWeight: '500' }]}>
                Customize
              </Text>
              <Icon
                name={customizing ? 'chevron.up' : 'chevron.down'}
                size={11}
                color={muted}
              />
            </View>
          </Press>
        ) : null}

        {customizing && kind === 'epub' ? (
          <View style={{ gap: 22, paddingBottom: 6 }}>
            <View style={{ gap: 10 }}>
              <Label text="Font" muted={muted} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {READER_FONTS.map((font) => {
                  const selected = settings.fontId === font.id;
                  return (
                    <Press
                      key={font.id}
                      haptic="selection"
                      scaleTo={0.94}
                      onPress={() => onChange({ fontId: font.id })}
                    >
                      <View
                        style={{
                          paddingHorizontal: 15,
                          paddingVertical: 10,
                          borderRadius: radius.pill,
                          backgroundColor: selected ? theme.accent : chipBg,
                        }}
                      >
                        {/* Each option is set in its own face, so you can see
                            what you're choosing rather than read its name. */}
                        <Text
                          style={{
                            fontSize: 16,
                            color: selected ? '#fff' : theme.fg,
                            fontFamily: font.preview,
                            fontWeight: font.preview ? '400' : '600',
                          }}
                        >
                          {font.name}
                        </Text>
                      </View>
                    </Press>
                  );
                })}
              </View>
            </View>

            <Segmented
              label="Line Spacing"
              muted={muted}
              background={chipBg}
              accent={theme.accent}
              fg={theme.fg}
              value={settings.lineHeight}
              options={[
                { label: 'Tight', value: 1.35 },
                { label: 'Normal', value: 1.6 },
                { label: 'Loose', value: 1.95 },
              ]}
              onChange={(lineHeight) => onChange({ lineHeight })}
            />

            <Segmented
              label="Margins"
              muted={muted}
              background={chipBg}
              accent={theme.accent}
              fg={theme.fg}
              value={settings.margin}
              options={[
                { label: 'Narrow', value: 14 },
                { label: 'Normal', value: 26 },
                { label: 'Wide', value: 44 },
              ]}
              onChange={(margin) => onChange({ margin })}
            />

            <View
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Label text="Justify Text" muted={muted} />
              <Toggle
                value={settings.justify}
                accent={theme.accent}
                background={chipBg}
                onChange={(justify) => onChange({ justify })}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

function Label({ text, muted }: { text: string; muted: string }) {
  return (
    <Text
      style={[
        type_.caption2,
        { color: muted, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: '600' },
      ]}
    >
      {text}
    </Text>
  );
}

function SizeStep({
  label,
  size,
  onPress,
  disabled,
  color,
}: {
  label: string;
  size: number;
  onPress: () => void;
  disabled?: boolean;
  color: string;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      haptic="light"
      scaleTo={0.96}
      style={{ flex: 1, opacity: disabled ? 0.3 : 1 }}
    >
      <View style={{ height: 50, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color, fontSize: size, fontWeight: '500' }}>{label}</Text>
      </View>
    </Press>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  muted,
  background,
  accent,
  fg,
}: {
  label: string;
  value: T;
  options: { label: string; value: T }[];
  onChange(value: T): void;
  muted: string;
  background: string;
  accent: string;
  fg: string;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Label text={label} muted={muted} />
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: background,
          borderRadius: radius.md,
          padding: 3,
        }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Press
              key={String(option.value)}
              haptic="selection"
              scaleTo={0.97}
              style={{ flex: 1 }}
              onPress={() => onChange(option.value)}
            >
              <View
                style={{
                  paddingVertical: 10,
                  borderRadius: radius.md - 3,
                  backgroundColor: selected ? accent : 'transparent',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={[
                    type_.footnote,
                    { color: selected ? '#fff' : fg, fontWeight: selected ? '600' : '400' },
                  ]}
                >
                  {option.label}
                </Text>
              </View>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

function Toggle({
  value,
  onChange,
  accent,
  background,
}: {
  value: boolean;
  onChange(value: boolean): void;
  accent: string;
  background: string;
}) {
  return (
    <Press haptic="selection" scaleTo={0.94} onPress={() => onChange(!value)}>
      <View
        style={{
          width: 50,
          height: 30,
          borderRadius: 15,
          padding: 3,
          backgroundColor: value ? accent : background,
          alignItems: value ? 'flex-end' : 'flex-start',
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: '#fff',
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
          }}
        />
      </View>
    </Press>
  );
}
