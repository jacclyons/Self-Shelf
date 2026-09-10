import { Alert } from 'react-native';

export interface AlertAction {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

/**
 * Confirmations and notices. Split per platform because react-native-web's
 * `Alert.alert` is a silent no-op, which would quietly swallow every
 * destructive confirmation in the app.
 */
export function showAlert(title: string, message?: string, actions?: AlertAction[]) {
  Alert.alert(title, message, actions);
}
