import { Deck } from "../classes/deck";
import { notificationService } from "../services/notification";

/**
 * Copies text to the clipboard.
 *
 * navigator.clipboard only exists on secure pages (https or localhost); when
 * the drafter is opened over the network (e.g. http://<Radmin IP>:8080) it is
 * missing, so fall back to the older copy command on a hidden text field.
 */
async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Clipboard API failed, trying fallback', err);
    }
  }

  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.top = '0';
  field.style.left = '0';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.focus();
  field.select();
  field.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (err) {
    copied = false;
  }
  document.body.removeChild(field);
  return copied;
}

export async function exportDeckToCode(deck?: Deck) {
  let deckCode: string;
  try {
    if (!deck) {
      throw new Error('No deck to export');
    }
    deckCode = deck.toDeckCode();
  } catch (err) {
    notificationService.instance?.addNotification({
      content: 'Nie udało się wygenerować kodu decku',
      duration: 5000,
      theme: 'error',
    });
    console.error(err);
    return;
  }

  if (await copyText(deckCode)) {
    notificationService.instance?.addNotification({
      content: 'Skopiowano kod decku do schowka',
      duration: 3000,
      theme: '',
    });
    return;
  }

  // Copying is blocked: show the code so it can be copied by hand (Ctrl+C).
  window.prompt('Skopiuj kod decku (Ctrl+C):', deckCode);
}
