import {Division} from '../types/deck-builder';
import {Unit} from '../types/unit';
import {Dataset, DATASETS} from '../types/dataset';
import {isSpecialtyCommand} from '../utils/is-specialty-command';
import {isSpecialtyRecon} from '../utils/is-specialty-recon';

export enum BucketFolder {
  WARNO = 'warno',
}

type UnitDivisionJsonBundle = {
  units: Unit[];
  divisions: Division[];
};

interface LoadedBundle {
  units: Unit[];
  divisions: Division[];
}

/** A DLC that adds divisions (vanilla data set) */
export interface Dlc {
  id: string;
  name: string;
  /** Division descriptors added by this DLC */
  divisions: string[];
}

/**
 * Loads and caches the game data of each data set (see types/dataset.ts).
 */
class BundleManager {
  private bundles = new Map<Dataset, Promise<LoadedBundle>>();
  private dlcs = new Map<Dataset, Promise<Dlc[]>>();

  private load(dataset: Dataset): Promise<LoadedBundle> {
    let bundle = this.bundles.get(dataset);
    if (!bundle) {
      bundle = this.fetchBundle(dataset);
      // Allow a retry if loading failed
      bundle.catch(() => this.bundles.delete(dataset));
      this.bundles.set(dataset, bundle);
    }
    return bundle;
  }

  private async fetchBundle(dataset: Dataset): Promise<LoadedBundle> {
    const url = DATASETS[dataset].dataUrl;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not load ${url} (${response.status})`);
    }
    const bundle = (await response.json()) as UnitDivisionJsonBundle;
    return {
      units: bundle.units.map((unit) => this.parseUnit(unit)),
      divisions: bundle.divisions.map((division) => ({
        ...division,
        deckCode: DATASETS[dataset].deckCode,
      })),
    };
  }

  async getUnits(dataset: Dataset): Promise<Unit[]> {
    return (await this.load(dataset)).units;
  }

  async getDivisions(dataset: Dataset): Promise<Division[]> {
    return (await this.load(dataset)).divisions;
  }

  /** DLC list of a data set; empty when the data set has none. */
  getDlcs(dataset: Dataset): Promise<Dlc[]> {
    let dlcs = this.dlcs.get(dataset);
    if (!dlcs) {
      dlcs = this.fetchDlcs(dataset);
      dlcs.catch(() => this.dlcs.delete(dataset));
      this.dlcs.set(dataset, dlcs);
    }
    return dlcs;
  }

  private async fetchDlcs(dataset: Dataset): Promise<Dlc[]> {
    const url = DATASETS[dataset].dlcUrl;
    if (!url) {
      return [];
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not load ${url} (${response.status})`);
    }
    return (await response.json()) as Dlc[];
  }

  parseUnit(unit: Unit): Unit {
    const newUnit: Unit = {
      ...unit,
      _display: unit.name !== '',
      _searchNameHelper: unit.name.toLowerCase(),
      mod: BucketFolder.WARNO,
    };

    if (isSpecialtyCommand(unit.specialities[0])) {
      newUnit.name = `(CMD) ${unit.name}`;
    } else if (isSpecialtyRecon(unit.specialities[0])) {
      newUnit.name = `(REC) ${unit.name}`;
    }

    return newUnit;
  }
}

export const BundleManagerService = new BundleManager();
