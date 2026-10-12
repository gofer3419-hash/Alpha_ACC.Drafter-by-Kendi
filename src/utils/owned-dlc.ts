import {BundleManagerService, Dlc} from '../services/bundle-manager';
import {Dataset} from '../types/dataset';

/** Remembers which DLC the player owns (vanilla drafter) */
export const OWNED_DLC_STORAGE_KEY = 'vanillaOwnedDlc';

export function loadOwnedDlc(): string[] {
  try {
    const raw = localStorage.getItem(OWNED_DLC_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch (error) {
    return [];
  }
}

export function saveOwnedDlc(ids: string[]) {
  try {
    localStorage.setItem(OWNED_DLC_STORAGE_KEY, JSON.stringify(ids));
  } catch (error) {
    console.error(error);
  }
}

export async function getDlcs(dataset: Dataset): Promise<Dlc[]> {
  return BundleManagerService.getDlcs(dataset);
}

/**
 * Division descriptors this player may draft: the base game plus the divisions
 * of the owned DLC. undefined = no restriction (data sets without DLC).
 */
export async function allowedDivisionDescriptors(
  dataset: Dataset
): Promise<string[] | undefined> {
  const dlcs = await BundleManagerService.getDlcs(dataset);
  if (dlcs.length === 0) {
    return undefined;
  }
  const owned = new Set(loadOwnedDlc());
  const fromDlc = new Map<string, string>();
  for (const dlc of dlcs) {
    for (const division of dlc.divisions) {
      fromDlc.set(division, dlc.id);
    }
  }
  const divisions = await BundleManagerService.getDivisions(dataset);
  return divisions
    .map((division) => division.descriptor)
    .filter((descriptor) => {
      const dlcId = fromDlc.get(descriptor);
      return dlcId === undefined || owned.has(dlcId);
    });
}
