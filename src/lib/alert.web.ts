export interface AlertAction {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

/**
 * Browser twin of `alert.ts`.
 *
 * `window.confirm` offers exactly two outcomes, so a multi-button alert
 * collapses onto its first non-cancel action — which is how every alert in
 * this app is already shaped (one real choice plus Cancel).
 */
export function showAlert(title: string, message?: string, actions?: AlertAction[]) {
  const body = message ? `${title}\n\n${message}` : title;
  const choices = actions ?? [];
  const cancel = choices.find((action) => action.style === 'cancel');
  const primary = choices.find((action) => action.style !== 'cancel');

  if (choices.length <= 1) {
    window.alert(body);
    primary?.onPress?.();
    return;
  }

  if (window.confirm(body)) primary?.onPress?.();
  else cancel?.onPress?.();
}
