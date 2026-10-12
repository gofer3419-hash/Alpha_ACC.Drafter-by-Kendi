/**
 * Side theme: after the player picks a side the whole site turns blue (NATO)
 * or red (PAKT). The colours come from one hue variable (--acc-h, see
 * styles/app.css), selected by the data-side attribute on <html>.
 */
export type ThemeSide = 'NATO' | 'PACT';

const storageKey = (dataset: string) => `acc.side.${dataset}`;

export function applySideTheme(side?: ThemeSide | null) {
  const root = document.documentElement;
  if (side) {
    root.setAttribute('data-side', side.toLowerCase());
  } else {
    root.removeAttribute('data-side');
  }
}

/** Remembers the side of the draft in progress, so a reload keeps the theme */
export function saveDraftSide(dataset: string, side: ThemeSide) {
  try {
    localStorage.setItem(storageKey(dataset), side);
  } catch (error) {
    console.warn(error);
  }
}

export function loadDraftSide(dataset: string): ThemeSide | null {
  try {
    const side = localStorage.getItem(storageKey(dataset));
    return side === 'NATO' || side === 'PACT' ? side : null;
  } catch (error) {
    return null;
  }
}
