import { Deck } from "../classes/deck";
import { notificationService } from "../services/notification";

/**
 * Copies by selecting the text of a real, visible field and running the old
 * copy command. It works synchronously inside the click handler, on http and
 * https alike, so it is tried first.
 */
function copyFromField(field: HTMLTextAreaElement | HTMLInputElement): boolean {
  try {
    field.focus();
    field.select();
    field.setSelectionRange(0, field.value.length);
    return document.execCommand('copy');
  } catch (err) {
    return false;
  }
}

/** Same, with a temporary hidden text field (no visible field on the page). */
function copyWithHiddenField(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.top = '0';
  field.style.left = '0';
  field.style.opacity = '0';
  document.body.appendChild(field);
  const copied = copyFromField(field);
  document.body.removeChild(field);
  return copied;
}

/**
 * Copies text to the clipboard.
 *
 * 1. selection + copy command (needs no secure page, keeps the click gesture),
 * 2. navigator.clipboard (only exists on https or localhost).
 */
export async function copyText(
  text: string,
  field?: HTMLTextAreaElement | HTMLInputElement | null
): Promise<boolean> {
  if (field ? copyFromField(field) : copyWithHiddenField(text)) {
    return true;
  }

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Clipboard API failed', err);
    }
  }

  return false;
}

/** Deck code of a deck, or undefined when it cannot be generated. */
export function getDeckCode(deck?: Deck | null): string | undefined {
  try {
    return deck ? deck.toDeckCode() : undefined;
  } catch (err) {
    console.error(err);
    return undefined;
  }
}

/**
 * Copies the code of the deck. When a visible field with the code is given,
 * the text is selected there, so even if copying is blocked the code stays
 * selected and Ctrl+C works.
 *
 * @returns true when the code reached the clipboard
 */
export async function exportDeckToCode(
  deck?: Deck | null,
  field?: HTMLTextAreaElement | HTMLInputElement | null
): Promise<boolean> {
  const deckCode = getDeckCode(deck);
  if (!deckCode) {
    notificationService.instance?.addNotification({
      content: 'Nie udało się wygenerować kodu decku',
      duration: 5000,
      theme: 'error',
    });
    return false;
  }

  if (await copyText(deckCode, field)) {
    notificationService.instance?.addNotification({
      content: 'Skopiowano kod decku do schowka',
      duration: 3000,
      theme: '',
    });
    return true;
  }

  // Copying is blocked: keep the code selected so it can be copied by hand.
  if (field) {
    field.focus();
    field.select();
    notificationService.instance?.addNotification({
      content: 'Schowek zablokowany: kod jest zaznaczony, naciśnij Ctrl+C',
      duration: 6000,
      theme: 'error',
    });
  } else {
    window.prompt('Skopiuj kod decku (Ctrl+C):', deckCode);
  }
  return false;
}
