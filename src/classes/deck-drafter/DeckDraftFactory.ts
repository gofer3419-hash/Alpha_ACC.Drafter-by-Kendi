/**
 * Deck Draft Factory
 * Creates DeckDraftClientEngine instances. The draft runs entirely in the
 * browser; its state is kept in localStorage, separately per data set.
 */

import {Dataset} from '../../types/dataset';
import {DeckDraftClientEngine, DraftOptions} from './DeckDraftClientEngine';

export class DeckDraftFactory {
  static async createClientEngine(
    dataset: Dataset,
    options: DraftOptions = {},
    storageKey?: string
  ): Promise<DeckDraftClientEngine> {
    const engine = new DeckDraftClientEngine(dataset);
    if (storageKey) {
      engine.storageKey = storageKey;
    }
    await engine.initializeDraft(options);
    return engine;
  }

  static async createEngineFromLocalStorage(
    dataset: Dataset,
    storageKey?: string
  ): Promise<DeckDraftClientEngine> {
    const engine = new DeckDraftClientEngine(dataset);
    if (storageKey) {
      engine.storageKey = storageKey;
    }
    await engine.initializeUnitAndDivisionData();
    engine.state = await engine.getStateFromLocalStorage();
    return engine;
  }
}
