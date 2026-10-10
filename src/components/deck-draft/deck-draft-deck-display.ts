import {css, CSSResultGroup, html, LitElement, TemplateResult} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import '@vaadin/details';
import {DetailsOpenedChangedEvent} from '@vaadin/details';
import {Deck, DeckUnit} from '../../classes/deck';
import {UnitCategory} from '../../types/deck-builder';
import {getCodeForFactoryDescriptor} from '../../utils/get-code-for-factory-descriptor';
import '../deck/compact-armoury-card';

/**
 * Read-only view of the deck being drafted, grouped by category.
 * (Standalone version of the deck builder's DeckView without saving/sharing.)
 */
@customElement('deck-draft-deck-display')
export class DeckDraftDeckDisplay extends LitElement {
  static get styles() {
    return css`
      .deck {
        height: 100%;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      h3.deck-title {
        overflow: hidden;
        text-overflow: ellipsis;
        margin: 0;
      }

      h3 {
        margin: 0;
      }

      .deck-header {
        border-bottom: 1px solid var(--lumo-contrast-20pct);
        padding-top: var(--lumo-space-s);
        padding-bottom: var(--lumo-space-s);
        padding-left: var(--lumo-space-s);
        padding-right: var(--lumo-space-s);
      }

      .deck-category-cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        place-items: center;
      }

      .deck-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .deck-category-headings {
        display: flex;
        flex-direction: column;
        width: 100%;
        flex: 1 1 0;
      }

      .activation-points {
        color: var(--lumo-contrast-80pct);
        display: flex;
        justify-content: flex-end;
      }

      vaadin-details::part(summary-content) {
        width: 100%;
      }

      .deck-card-categories {
        flex: 1 1 100%;
        overflow-y: auto;
        padding-left: var(--lumo-space-s);
        padding-right: var(--lumo-space-s);
      }

      .category-empty-state {
        color: var(--lumo-contrast-60pct);
        text-align: center;
      }

      .deck-category-heading-title {
        color: var(--lumo-contrast);
      }

      .deck-category-heading-row {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        color: var(--lumo-contrast-80pct);
        font-size: var(--lumo-font-size-m);
      }

      .deck-category-cards > deck-card {
        margin-top: var(--lumo-space-xs);
      }

      .slot-costs {
        display: flex;
        flex-direction: row;
      }

      .slot-costs > span {
        color: var(--lumo-contrast-50pct);
      }

      .slot-costs > .in-use {
        color: var(--lumo-primary-color);
      }

      .slot-costs > .is-next {
        color: var(--lumo-contrast);
      }

      .total-unit-cost {
        border-top: 1px solid var(--lumo-contrast-20pct);
        padding: var(--lumo-space-s);
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
        color: var(--lumo-contrast);
      }

      .total-unit-cost > span.warning {
        color: orange;
      }

      .total-unit-cost > span {
        margin-left: var(--lumo-space-s);
        margin-right: var(--lumo-space-s);
      }

      .deck-category-cards {
        grid-gap: var(--lumo-space-xs);
      }
    ` as CSSResultGroup;
  }

  @property({
    hasChanged(_value: Deck, _oldValue: Deck) {
      return true;
    },
  })
  deck?: Deck;

  @state()
  openAreas: {
    [key in UnitCategory]?: boolean;
  } = {};

  render(): TemplateResult {
    if (!this.deck) {
      return html``;
    }

    return html`
      <div class="deck">
        <div class="deck-header">
          <div class="deck-header-row">
            <h3 class="deck-title">
              ${this.deck.division.name ?? this.deck.division.descriptor}
            </h3>
          </div>
          <div class="deck-header-row">
            <div class="activation-points">
              ${this.deck.totalSpentActivationPoints} /
              ${this.deck.division.maxActivationPoints} pkt aktywacji
            </div>
          </div>
        </div>
        <div class="deck-card-categories">${this.renderDeck(this.deck)}</div>
        <div class="total-unit-cost">
          Suma punktów: <span>${this.deck.getSumOfUnitsCosts()}</span>
        </div>
      </div>
    `;
  }

  openedAreasChanged(category: UnitCategory, open: boolean) {
    this.openAreas[category] = open;

    this.dispatchEvent(
      new CustomEvent('open-areas-changed', {
        detail: {
          openAreas: this.openAreas,
        },
      })
    );
  }

  renderDeck(deck: Deck) {
    const renderOutput: TemplateResult[] = [];
    for (const category of deck.unitCategories) {
      renderOutput.push(this.renderDeckCategory(category, deck));
    }
    return html`${renderOutput}`;
  }

  renderSlotCosts(slotCosts: number[], nextSlotIndex: number) {
    return html`<div class="slot-costs">
      [${slotCosts.map((el, index) => {
        const isLast = index !== slotCosts.length - 1;
        let isNext = false;
        let isInUse = false;

        if (index === nextSlotIndex) {
          isNext = true;
        } else if (index < nextSlotIndex) {
          isInUse = true;
        }

        return html`<div
            class="${isInUse ? 'in-use' : ''} ${isNext ? 'is-next' : ''}"
            >${el}</div>
          ${isLast ? ', ' : ''}`;
      })}]
    </div> `;
  }

  protected renderDeckCard(deckUnit: DeckUnit, deck: Deck) {
    return html`
      <compact-armoury-card
        .pack=${deckUnit.pack}
        .transport=${deckUnit.transport}
        .selectedVeterancy=${deckUnit.veterancy}
        .deck=${deck}
      ></compact-armoury-card>
    `;
  }

  renderDeckCategory(category: UnitCategory, deck: Deck) {
    const deckUnitsInCategory =
      deck.unitsInDeckGroupedUnitsByCategory[category];
    const deckUnitsInCategoryToRender: TemplateResult[] = [];

    const numberOfCardsInCategory = deckUnitsInCategory.length;

    for (const deckUnit of deckUnitsInCategory) {
      deckUnitsInCategoryToRender.push(this.renderDeckCard(deckUnit, deck));
    }

    return html`<vaadin-details
      ?opened=${true}
      class="deck-section"
      @opened-changed=${(event: DetailsOpenedChangedEvent) =>
        this.openedAreasChanged(category, event.detail.value)}
    >
      <div class="deck-category-headings" slot="summary">
        <div class="deck-category-heading-row">
          <h3 class="deck-category-heading-title">
            ${getCodeForFactoryDescriptor(category)}
          </h3>
          <div class="unit-count">
            ${deck.getTotalUnitCountForCategory(category)} jedn.
          </div>
        </div>
        <div class="deck-category-heading-row">
          <div class="slot-count">
            ${numberOfCardsInCategory} /
            ${deck.getTotalSlotsForCategory(category)} slotów
          </div>
          <div class="total-points-in-category">
            ${deck.getSumOfUnitCostsForCategory(category)} pkt
          </div>
        </div>
        <div class="deck-category-heading-row">
          ${this.renderSlotCosts(
            this.deck?.slotCosts[category] || [],
            this.deck?.getNextSlotCostIndexForCategory(category) || 0
          )}
        </div>
      </div>
      <div class="deck-category-cards">
        ${deckUnitsInCategoryToRender.length > 0
          ? deckUnitsInCategoryToRender
          : html`<div class="category-empty-state"
              >Brak kart w kategorii</div>`}
      </div>
    </vaadin-details>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'deck-draft-deck-display': DeckDraftDeckDisplay;
  }
}
