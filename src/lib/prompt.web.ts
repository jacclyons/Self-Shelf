/**
 * Browser twin of `prompt.ts`. `window.prompt` is blunt, but it is the only
 * single-line input the platform offers without building a modal, and it
 * matches the native flow: cancelling still creates the highlight, without a
 * note attached.
 */
export function promptForText(
  title: string,
  message: string,
  onDone: (value: string | null) => void,
) {
  const value = window.prompt(message ? `${title}\n\n${message}` : title);
  onDone(value && value.trim() ? value : null);
}
