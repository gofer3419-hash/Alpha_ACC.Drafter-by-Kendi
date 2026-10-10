import { Deck } from "../classes/deck";
import { notificationService } from "../services/notification";

export async function exportDeckToCode(deck?: Deck) {
  try {
    if (deck) {
      const deckCode = deck.toDeckCode();
      await navigator.clipboard.writeText(deckCode);
      notificationService.instance?.addNotification({
        content: 'Skopiowano kod decku do schowka',
        duration: 3000,
        theme: '',
      });
      return;
    } else {
      throw new Error('No deck to export');
    }
  } catch (err) {
    notificationService.instance?.addNotification({
      content: 'Nie udało się wygenerować kodu decku',
      duration: 5000,
      theme: 'error',
    });
    console.error(err);
  }
}