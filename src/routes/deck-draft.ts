import {BeforeEnterObserver, Router, RouterLocation} from '@vaadin/router';
import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, query, state} from 'lit/decorators.js';
import '@vaadin/button';
import '../components/deck-draft/deck-draft-division-picker';
import '../components/deck-draft/deck-draft-unit-picker';
import '../components/deck-draft/deck-draft-deck-display';
import '../components/deck/deck-header';
import '../components/deck/deck-title';
import '../components/deck/summary-view';
import 'side-drawer';
import {BundleManagerService} from '../services/bundle-manager';
import {Dataset, isDataset} from '../types/dataset';
import {Division} from '../types/deck-builder';
import {Unit, UnitMap} from '../types/unit';
import {Deck} from '../classes/deck';
import {exportDeckToCode, getDeckCode} from '../utils/export-deck-to-code';
import {SideDrawer} from 'side-drawer';
import {DeckDraftFactory} from '../classes/deck-drafter/DeckDraftFactory';
import {DeckDraftController} from '../classes/deck-drafter/DeckDraftController';
import {applySideTheme, loadDraftSide} from '../utils/theme';

export type DeckDraftState = UnitPickState | DivisionPickState;

export interface DivisionPickState {
  phase: 'DIVISION_PICK';
  data: {
    choices: string[];
  };
}

export interface UnitPickState {
  phase: 'UNIT_PICK';
  data: {
    choices: PackChoice[];
    division: string;
    deckCode: string;
  };
}

// type guard for UnitPickState

function isUnitPickState(state: DeckDraftState): state is UnitPickState {
  return state.phase === 'UNIT_PICK';
}

export interface PackChoice {
  unit: string;
  transport: string | null;
  veterancy: number;
}

@customElement('deck-draft-route')
export class DeckDraftRoute extends LitElement implements BeforeEnterObserver {
  static get styles() {
    return css`
      :host {
        height: 100%;
      }

      .container {
        display: flex;
        max-height: 100%;
      }

      .content {
        flex: 1 1 80%;
        padding-bottom: 60px;
        overflow-y: auto;
      }

      summary-view {
        width: 100%;
      }

      .complete {
        display: flex;
        justify-content: center;
      }

      deck-draft-deck-display {
        flex: 1 1 20%;
      }

      .card {
        display: flex;
        flex-direction: column;
        background-color: var(--lumo-contrast-5pct);
        padding: var(--lumo-space-m);
      }

      .deck-summary-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        box-sizing: border-box;
        margin: var(--lumo-space-m);
        padding: var(--lumo-space-l);
        background-color: hsla(0, 0%, 11%, 0.92);
        border: 1px solid var(--lumo-contrast-20pct);
        border-top: 3px solid var(--acc-burgundy);
      }

      .deck-title {
        display: flex;
        justify-content: space-between;
        width: 100%;
      }

      .button-bar {
        display: flex;
        gap: var(--lumo-space-s);
      }

      .deck-code-box {
        display: flex;
        flex-direction: column;
        gap: var(--lumo-space-xs);
        margin: var(--lumo-space-m) 0;
        padding: var(--lumo-space-m);
        background-color: rgba(0, 0, 0, 0.35);
        border: 1px solid var(--lumo-contrast-20pct);
        border-left: 3px solid var(--lumo-secondary-color);
      }

      .deck-code-box label {
        font-size: var(--lumo-font-size-s);
        letter-spacing: 0.05em;
        color: var(--lumo-secondary-color);
      }

      .deck-code-box textarea {
        box-sizing: border-box;
        width: 100%;
        min-height: 5.625rem;
        padding: var(--lumo-space-s);
        font-family: monospace;
        font-size: var(--lumo-font-size-s);
        word-break: break-all;
        color: var(--lumo-body-text-color);
        background-color: var(--lumo-contrast-10pct);
        border: 1px solid var(--lumo-contrast-30pct);
        outline: none;
        resize: vertical;
        user-select: text;
        -webkit-user-select: text;
      }

      .deck-code-box textarea:focus {
        border-color: var(--acc-burgundy);
        box-shadow: 0 0 10px var(--acc-burgundy-glow);
      }

      @media (max-width: 1000px) {
        .hide-on-mobile {
          display: none;
        }
      }

      @media (min-width: 1001px) {
        .hide-on-desktop {
          display: none !important;
        }

        .content {
          padding-bottom: 0;
        }
      }

      side-drawer {
        background-color: var(--lumo-base-color);
        max-width: 95vw;
      }

      .button-drawer {
        position: fixed;
        bottom: 0;
        height: 3.75rem;
        width: 100%;
        background-color: var(--lumo-base-color);
        z-index: 1;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-top: 1px solid var(--lumo-contrast-20pct);
      }

      .button-drawer > vaadin-button {
        flex: 1 1 100%;
        margin-left: var(--lumo-space-s);
        margin-right: var(--lumo-space-s);
      }
    `;
  }

  @state()
  protected divisions?: Division[];

  @state()
  protected units?: Unit[];

  @state()
  protected unitMap?: UnitMap;

  @state()
  protected showDeckDrawer = false;

  @query('side-drawer')
  drawer!: SideDrawer;

  openDeckDrawer() {
    this.showDeckDrawer = true;
    this.drawer.open = true;
  }

  closeDeckDrawer() {
    this.showDeckDrawer = false;
    this.drawer.open = false;
  }

  @state({
    hasChanged: () => {
      return true;
    },
  })
  protected activeDeck: Deck | null = null;

  @state({
    hasChanged: () => {
      return true;
    },
  })
  protected state?: DeckDraftState;

  engineController?: DeckDraftController;

  @state()
  protected disableButtons = false;

  @state()
  completing = false;

  /** True once the deck code was copied (or the user chose to leave without it) */
  protected codeCopied = false;

  @query('#deck-code')
  codeField?: HTMLTextAreaElement;

  async copyDeckCode() {
    const copied = await exportDeckToCode(this.activeDeck, this.codeField);
    if (copied) {
      this.codeCopied = true;
    }
  }

  /** Data set of this draft, from the URL (/drafter/:dataset/:sessionId) */
  protected draftDataset: Dataset = 'wif';

  protected get startPage() {
    return `/drafter/${this.draftDataset}`;
  }

  async onBeforeEnter(location: RouterLocation) {
    const dataset = location.params.dataset;
    if (!isDataset(dataset)) {
      Router.go('/');
      return;
    }
    this.draftDataset = dataset;
    // A reload keeps the colour of the chosen side
    applySideTheme(loadDraftSide(dataset));

    let divisions: Division[];
    let units: Unit[];
    try {
      divisions = await BundleManagerService.getDivisions(dataset);
      units = await BundleManagerService.getUnits(dataset);
    } catch (error) {
      console.error(error);
      Router.go(this.startPage);
      return;
    }

    const unitMap = {} as UnitMap;
    for (const unit of units) {
      unitMap[unit.descriptorName] = unit;
    }

    this.divisions = divisions;
    this.units = units;
    this.unitMap = unitMap;

    try {
      const engine = await DeckDraftFactory.createEngineFromLocalStorage(
        dataset
      );
      const engineController = new DeckDraftController(engine);
      engineController.registerCallback(() => {
        this.handleState(engine.state as DeckDraftState);
      });
      this.engineController = engineController;
      this.handleState(engine.state as DeckDraftState);
    } catch (error) {
      // No draft in progress: go back to the drafter start page
      console.error(error);
      Router.go(this.startPage);
    }
  }

  protected handleState(state: UnitPickState | DivisionPickState) {
    this.state = state;
    if (
      isUnitPickState(state) &&
      this.unitMap &&
      this.divisions &&
      state.data.deckCode !== undefined
    ) {
      if (state.data.deckCode !== '') {
        const deck = Deck.fromDeckCode(state.data.deckCode, {
          unitMap: this.unitMap,
          divisions: this.divisions,
        });

        this.activeDeck = deck;
      } else {
        const division = this.divisions.find(
          (division) =>
            division.descriptor === (this.state as UnitPickState).data.division
        ) as Division;

        const deck: Deck = new Deck({
          unitMap: this.unitMap,
          division: division,
        });

        this.activeDeck = deck;
      }
    }
  }

  async chooseOption(choice: number) {
    try {
      if (!this.engineController) {
        return;
      }

      this.disableButtons = true;
      await this.engineController.chooseOption(choice);
    } catch (error) {
      console.error('Error choosing option:', error);
    } finally {
      this.disableButtons = false;
    }
  }

  /**
   * Ends the draft. WarYes opened the finished deck in its deck builder;
   * that is not part of this site, so return to the drafter start page.
   */
  async completeDraft() {
    if (
      !this.codeCopied &&
      !window.confirm(
        'Nie skopiowano kodu decku. Po zakończeniu draftu kod zniknie. Zakończyć mimo to?'
      )
    ) {
      return;
    }

    try {
      this.completing = true;
      if (this.engineController && this.state?.phase === 'UNIT_PICK') {
        await this.engineController.completeDraft();
      }
      Router.go(this.startPage);
    } catch (error) {
      console.error('Error completing draft:', error);
    } finally {
      this.completing = false;
    }
  }

  render(): TemplateResult {

    if (this.state?.phase === 'DIVISION_PICK') {
      return html`
        <deck-draft-division-picker
          class="content"
          .choices=${this.state.data.choices}
          .divisions=${this.divisions}
          .disable=${this.disableButtons}
          @division-chosen=${(e: CustomEvent) =>
            this.chooseOption(e.detail.choice)}
        ></deck-draft-division-picker>
      `;
    }

    if (this.state?.phase === 'UNIT_PICK') {
      return html`
        ${this.state.data.choices.length === 0
          ? html` <div class="content complete">
              <div class="deck-summary-container">
                <deck-header .deck=${this.activeDeck}>
                  <div class="deck-title" slot="title">
                    <deck-title
                      .deck=${this.activeDeck}
                      .name=${this.activeDeck?.division?.name}
                    >
                    </deck-title>
                    <div class="button-bar">
                      <vaadin-button
                        theme="large"
                        @click=${() => this.copyDeckCode()}
                      >
                        Kopiuj kod
                      </vaadin-button>
                      <vaadin-button
                        theme="primary large"
                        @click=${() => this.completeDraft()}
                        .disabled=${this.completing}
                      >
                        Zakończ draft
                      </vaadin-button>
                    </div>
                  </div>
                </deck-header>
                <div class="deck-code-box">
                  <label for="deck-code">
                    Kod decku (do importu w grze). Kliknij w pole, aby go
                    zaznaczyć:
                  </label>
                  <textarea
                    id="deck-code"
                    readonly
                    rows="3"
                    .value=${getDeckCode(this.activeDeck) ?? ''}
                    @focus=${(e: FocusEvent) =>
                      (e.target as HTMLTextAreaElement).select()}
                    @click=${(e: MouseEvent) =>
                      (e.target as HTMLTextAreaElement).select()}
                  ></textarea>
                </div>
                <summary-view .deck=${this.activeDeck}></summary-view>
              </div>
            </div>`
          : html`
              <side-drawer
                @open=${() => this.openDeckDrawer()}
                @close=${() => this.closeDeckDrawer()}
                ?open=${this.showDeckDrawer}
              >
                <deck-draft-deck-display
                  class=""
                  .deck=${this.activeDeck}
                ></deck-draft-deck-display>
              </side-drawer>
              <div class="button-drawer hide-on-desktop">
                <vaadin-button
                  @click=${() => this.openDeckDrawer()}
                  theme="large primary"
                  >Pokaż deck</vaadin-button
                >
              </div>
              <div class="container">
                ${this.activeDeck === null
                  ? ''
                  : html`
                      <deck-draft-deck-display
                        class="hide-on-mobile"
                        .deck=${this.activeDeck}
                      ></deck-draft-deck-display>
                    `}

                <deck-draft-unit-picker
                  class="content"
                  .choices=${this.state.data.choices}
                  .units=${this.units}
                  .disable=${this.disableButtons}
                  .deck=${this.activeDeck}
                  @unit-chosen=${(e: CustomEvent) =>
                    this.chooseOption(e.detail.choice)}
                ></deck-draft-unit-picker>
              </div>
            `}
      `;
    }

    return html``;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'deck-draft-route': DeckDraftRoute;
  }
}
