import {BeforeEnterObserver, Router, RouterLocation} from '@vaadin/router';
import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import '@vaadin/button';
// @ts-ignore
import WaryesImage from '../../images/waryes-transparent.png';
import {DeckDraftFactory} from '../classes/deck-drafter/DeckDraftFactory';
import {DraftSide} from '../classes/deck-drafter/DeckDraftClientEngine';
import {BundleManagerService, Dlc} from '../services/bundle-manager';
import {Dataset, DATASETS, isDataset} from '../types/dataset';

/** "1 dywizja", "3 dywizje", "5 dywizji" */
function divisionsLabel(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (count === 1) {
    return '1 dywizja';
  }
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return `${count} dywizje`;
  }
  return `${count} dywizji`;
}

/** Remembers which DLC the player owns (vanilla drafter) */
const OWNED_DLC_STORAGE_KEY = 'vanillaOwnedDlc';

function loadOwnedDlc(): string[] {
  try {
    const raw = localStorage.getItem(OWNED_DLC_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch (error) {
    return [];
  }
}

function saveOwnedDlc(ids: string[]) {
  try {
    localStorage.setItem(OWNED_DLC_STORAGE_KEY, JSON.stringify(ids));
  } catch (error) {
    console.error(error);
  }
}

@customElement('deck-drafter-route')
export class DeckDrafterRoute
  extends LitElement
  implements BeforeEnterObserver
{
  static get styles() {
    return css`
      :host {
        display: flex;
        align-items: flex-start;
        justify-content: center;
        flex: 1 1 100%;
        position: relative;
        height: calc(100vh - var(--app-header-height));
      }

      simple-chip {
        --background: var(--lumo-secondary-color-10pct);
        --color: var(--lumo-secondary-color);
        display: inline-flex;
        justify-content: center;
        margin-left: auto;
        margin-right: auto;
        letter-spacing: 0.1em;
        margin-left: 0.5em;
      }

      section {
        height: 100%;
        width: 100%;
        perspective: 50vmax;
        overflow: hidden;
        background-image: linear-gradient(
          to top,
          hsla(75, 10%, 6%, 0.92),
          hsla(350, 60%, 10%, 0.85),
          hsla(348, 75%, 18%, 0.75),
          hsla(346, 85%, 28%, 0.6),
          hsla(346, 92%, 40%, 0.5)
        );
      }

      div.crawl {
        background-size: 40px 40px;
        background-image: linear-gradient(
            to right,
            rgba(255, 255, 255, 0.2) 1px,
            transparent 1px
          ),
          linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0.2) 1px,
            transparent 1px
          );
        height: inherit;
        transform: rotateX(50deg);
        transform-origin: top center;
        animation: 15s linear infinite crawlingWall;
        background-position-y: top;
      }

      .card {
        display: flex;
        flex-direction: column;

        border-radius: var(--lumo-border-radius);
        padding: var(--lumo-space-m);
        overflow-y: auto;
        max-height: 100%;
        background-color: var(--lumo-base-color);
        margin-top: var(--lumo-space-m);
      }

      @media (max-width: 500px) {
        .card {
          margin-top: 0;
        }
      }

      .card::before {
        opacity: 0.9;

        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        height: 100%;
        border-radius: inherit;
      }

      .center {
        position: absolute;
        z-index: 1;
        max-width: 600px;
      }

      .card img {
        max-width: 320px;
      }

      .header {
        display: flex;
        align-items: center;
        flex-direction: column;
        position: relative;
      }

      .header span {
        font-size: 2rem;
        font-weight: bold;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        display: flex;
        align-items: center;
      }

      .center * {
        z-index: 2;
      }

      .button-container {
        padding-top: var(--lumo-space-l);
        display: flex;
        justify-content: space-evenly;
        align-items: flex-end;
        
      }

      .button-container vaadin-button {
        min-width: 140px;
      }

      vaadin-button.nato {
        background-color: #2f6fdf;
      }

      vaadin-button.pact {
        background-color: #d63a3a;
      }

      .button-with-label {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content:space-between;

      }

      .label > simple-chip {
        height: 16px;
        font-size: var(--lumo-font-size-xs);
      }

      .label {
        display: flex;
        align-items: center;
      }

      .dlc-list {
        display: flex;
        flex-direction: column;
        gap: var(--lumo-space-xs);
        margin-top: var(--lumo-space-s);
      }

      .dlc-list label {
        display: flex;
        align-items: center;
        gap: var(--lumo-space-s);
        cursor: pointer;
        padding: var(--lumo-space-xs) 0;
      }

      .dlc-list input {
        width: 18px;
        height: 18px;
        accent-color: var(--lumo-primary-color);
      }

      .dlc-list .count {
        color: var(--lumo-secondary-text-color);
        font-size: var(--lumo-font-size-s);
      }

      .dlc-actions {
        display: flex;
        gap: var(--lumo-space-s);
        margin-top: var(--lumo-space-s);
      }

      .side-label {
        font-weight: 600;
      }

      .side-label.nato {
        color: #4f86ea;
      }

      .side-label.pact {
        color: #e25353;
      }

      .error {
        color: var(--lumo-error-text-color);
      }

      @keyframes crawlingWall {
        to {
          background-position-y: bottom;
        }
      }
    `;
  }

  @state()
  disableDraftButton = false;

  /** Data set of this drafter, from the URL (/drafter/:dataset) */
  @state()
  draftDataset: Dataset = 'wif';

  /** Vanilla only: side picked, now choosing DLC */
  @state()
  chosenSide: DraftSide | null = null;

  @state()
  dlcs: Dlc[] = [];

  @state()
  ownedDlc = new Set<string>();

  /** Divisions of the data set, used to count divisions per side and DLC */
  @state()
  divisions: {descriptor: string; alliance: string}[] = [];

  @state()
  error = '';

  async onBeforeEnter(location: RouterLocation) {
    const dataset = location.params.dataset;
    if (!isDataset(dataset)) {
      Router.go('/');
      return;
    }
    this.draftDataset = dataset;
    this.chosenSide = null;
    this.error = '';

    try {
      this.divisions = await BundleManagerService.getDivisions(dataset);
      this.dlcs = await BundleManagerService.getDlcs(dataset);
      const known = new Set(this.dlcs.map((dlc) => dlc.id));
      this.ownedDlc = new Set(loadOwnedDlc().filter((id) => known.has(id)));
    } catch (error) {
      console.error(error);
      this.error = 'Dane gry dla tego draftera nie są jeszcze dostępne.';
    }
  }

  private get hasDlcChoice() {
    return this.dlcs.length > 0;
  }

  /** Base game divisions plus the divisions of the owned DLC */
  private allowedDivisions(): string[] {
    const fromDlc = new Map<string, string>();
    for (const dlc of this.dlcs) {
      for (const division of dlc.divisions) {
        fromDlc.set(division, dlc.id);
      }
    }
    return this.divisions
      .map((division) => division.descriptor)
      .filter((descriptor) => {
        const dlcId = fromDlc.get(descriptor);
        return dlcId === undefined || this.ownedDlc.has(dlcId);
      });
  }

  private countForSide(descriptors: string[], side: DraftSide) {
    const alliance = side === 'NATO' ? 'ECoalition/Allied' : 'ECoalition/Axis';
    const wanted = new Set(descriptors);
    return this.divisions.filter(
      (division) =>
        wanted.has(division.descriptor) && division.alliance === alliance
    ).length;
  }

  private chooseSide(side: DraftSide) {
    if (this.hasDlcChoice) {
      this.chosenSide = side;
    } else {
      this.startClientDraft(side);
    }
  }

  private setOwnedDlc(ids: Iterable<string>) {
    this.ownedDlc = new Set(ids);
    saveOwnedDlc([...this.ownedDlc]);
  }

  private toggleDlc(id: string, owned: boolean) {
    const next = new Set(this.ownedDlc);
    if (owned) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.setOwnedDlc(next);
  }

  async startClientDraft(side: DraftSide) {
    try {
      this.disableDraftButton = true;
      await DeckDraftFactory.createClientEngine(this.draftDataset, {
        side,
        allowedDivisions: this.hasDlcChoice
          ? this.allowedDivisions()
          : undefined,
      });
      const sessionId = `local`;
      Router.go(
        `/drafter/${this.draftDataset}/${encodeURIComponent(sessionId)}`
      );
    } catch (error) {
      console.error('Error creating draft session:', error);
      this.disableDraftButton = false;
    }
  }

  renderSideButtons(): TemplateResult {
    const disabled = this.disableDraftButton || this.error !== '';
    return html`
      <div class="button-container">
        <vaadin-button
          class="nato"
          theme="primary large"
          ?disabled="${disabled}"
          @click="${() => this.chooseSide('NATO')}"
        >
          NATO
        </vaadin-button>
        <vaadin-button
          class="pact"
          theme="primary large"
          ?disabled="${disabled}"
          @click="${() => this.chooseSide('PACT')}"
        >
          PAKT
        </vaadin-button>
      </div>
    `;
  }

  renderDlcChoice(side: DraftSide): TemplateResult {
    const allowed = this.allowedDivisions();
    const available = this.countForSide(allowed, side);
    return html`
      <div>
        <p>
          Strona:
          <span class="side-label ${side === 'NATO' ? 'nato' : 'pact'}"
            >${side === 'NATO' ? 'NATO' : 'PAKT'}</span
          >. Zaznacz posiadane DLC. Dywizje z gry bazowej są zawsze w puli.
        </p>
        <div class="dlc-list">
          ${this.dlcs.map((dlc) => {
            const count = this.countForSide(dlc.divisions, side);
            return html`
              <label>
                <input
                  type="checkbox"
                  .checked=${this.ownedDlc.has(dlc.id)}
                  @change=${(e: Event) =>
                    this.toggleDlc(
                      dlc.id,
                      (e.target as HTMLInputElement).checked
                    )}
                />
                <span>${dlc.name}</span>
                <span class="count"
                  >(${divisionsLabel(count)})</span
                >
              </label>
            `;
          })}
        </div>
        <div class="dlc-actions">
          <vaadin-button
            theme="tertiary"
            @click=${() => this.setOwnedDlc(this.dlcs.map((d) => d.id))}
            >Zaznacz wszystkie</vaadin-button
          >
          <vaadin-button
            theme="tertiary"
            @click=${() => this.setOwnedDlc([])}
            >Wyczyść</vaadin-button
          >
        </div>
        <p>Dywizji w puli: ${available}</p>
      </div>
      <div class="button-container">
        <vaadin-button
          theme="large"
          ?disabled="${this.disableDraftButton}"
          @click="${() => (this.chosenSide = null)}"
        >
          Wstecz
        </vaadin-button>
        <vaadin-button
          class="${side === 'NATO' ? 'nato' : 'pact'}"
          theme="primary large"
          ?disabled="${this.disableDraftButton || available === 0}"
          @click="${() => this.startClientDraft(side)}"
        >
          Rozpocznij draft
        </vaadin-button>
      </div>
    `;
  }

  render(): TemplateResult {
    return html`
      <section>
        <div class="crawl"></div>
      </section>

      <div class="card center">
        <div class="header">
          <img src=${WaryesImage} alt="WarYes Logo" />
          <h2 style="margin: 0">${DATASETS[this.draftDataset].title}</h2>
        </div>
        <div>
          <p>
            Witaj w Deck Drafterze! W tym trybie losujesz dywizję do gry
            w WARNO.
          </p>
          <p>
            Najpierw wybierz stronę, NATO albo PAKT${this.hasDlcChoice
              ? ', a potem posiadane DLC'
              : ''}. Potem dostaniesz serię wyborów: najpierw 3 dywizje tej
            strony, a następnie kolejne jednostki, po jednej, aż deck będzie
            gotowy. Transport i weterankę jednostek losuje drafter.
          </p>
          <p>
            Na koniec dostaniesz kod decku, który zaimportujesz w grze.
          </p>
        </div>
        ${this.error ? html`<p class="error">${this.error}</p>` : ''}
        ${this.chosenSide
          ? this.renderDlcChoice(this.chosenSide)
          : this.renderSideButtons()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'deck-drafter-route': DeckDrafterRoute;
  }
}
