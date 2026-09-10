import { Alert } from 'react-native';

/**
 * Ask for a single line of text. `Alert.prompt` is iOS-only, so this is split
 * per platform rather than called directly.
 */
export function promptForText(
  title: string,
  message: string,
  onDone: (value: string | null) => void,
) {
  Alert.prompt(title, message, (value) => onDone(value || null), 'plain-text');
}
