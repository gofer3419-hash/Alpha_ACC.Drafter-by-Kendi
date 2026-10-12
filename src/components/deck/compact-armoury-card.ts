import {customElement /*, property*/} from 'lit/decorators.js';
import {html, css, TemplateResult} from 'lit';
import {ArmouryWithTransportCard} from './armoury-with-transport-card';
import {getIconForVeterancy} from '../../utils/get-icon-for-veterancy';
import {getIconForTrait} from '../../utils/get-icon-for-trait';
import {getIconForSpecialty} from '../../utils/get-icon-for-specialty';
import { Deck } from '../../classes/deck';

@customElement('compact-armoury-card')
export class CompactArmouryCard extends ArmouryWithTransportCard {
  static styles = [
    css`
      .main {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        position: relative;
        width: 100%;
        height: 100%;
        border-radius: var(--lumo-border-radius-m);
        overflow: hidden;
        flex: 1 1 0;
      }

      unit-image {
        width: 100%;
        flex: 1 1 100%;
      }

      .details {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        position: absolute;
        bottom: 13px;
        background-color: hsla(240, 7%, 11%, 0.8);
        width: 100%;
        overflow: hidden;
      }

      .name {

        font-size: 9px;
        width: 100%;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
        margin-left: var(--lumo-space-xs);
        margin-right: var(--lumo-space-xs);
      }

      .unit-name {
        background-color: var(--lumo-contrast-10pct);
        display: flex;
        width: 100%;
        flex: 1 1 0%;
        align-items: center;
        justify-content: center;
        height: 0.8125rem;
      }

      .cmd-points {
        position: absolute;
        top: 0;
        right: 0;
        font-size: var(--lumo-font-size-xs);
        padding-left: var(--lumo-space-xs);
        padding-right: var(--lumo-space-xs);
        background-color: hsla(240, 7%, 11%, 0.8);
        border-bottom-left-radius: var(--lumo-border-radius-m);
      }

      .availability {
        position: absolute;
        top: 0;
        left: 0;
        background-color: hsla(240, 7%, 11%, 0.8);
        border-bottom-right-radius: var(--lumo-border-radius-m);
        font-size: var(--lumo-font-size-xs);
        padding-left: var(--lumo-space-xs);
        padding-right: var(--lumo-space-xs);
      }

      .veterancy {
        position: absolute;
        top: 1.25rem;
        right: 0;
        background-color: rgba(0, 0, 0, 0.75);
        border-radius: var(--lumo-border-radius-s);
        padding: 1px 3px;
        display: flex;
      }

      /* Traits of the unit, top centre between availability and points */
      .traits {
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 1px;
        padding: 1px 2px;
        background-color: rgba(0, 0, 0, 0.75);
        border-bottom-left-radius: var(--lumo-border-radius-s);
        border-bottom-right-radius: var(--lumo-border-radius-s);
      }

      .traits vaadin-icon {
        width: 1rem;
        height: 1rem;
        color: var(--lumo-body-text-color);
      }

      /* Command units: accent frame and a CMD tag in the name bar */
      .main.command {
        box-shadow: inset 0 0 0 2px var(--lumo-secondary-color);
      }

      .cmd-tag {
        flex: none;
        margin-left: 2px;
        padding: 0 3px;
        font-size: 0.5625rem;
        font-weight: 700;
        line-height: 0.8125rem;
        letter-spacing: 0.05em;
        color: #111;
        background-color: var(--lumo-secondary-color);
      }

      .veterancy vaadin-icon {
        width: 1.25rem;
        height: 1.25rem;
      }
    `,
  ];

  render(): TemplateResult {
    if (this.pack && this.deck) {
      const unit = this.deck.getUnitForPack(this.pack);
      const veterancyQuantities = Deck.getVeterancyQuantitiesForPack(
        this.pack
      );

      if (unit) {
        let cmdPoints = unit.commandPoints;

        if (this.transport) {
          cmdPoints += this.transport.commandPoints;
        }

        // Traits with an icon; the command trait is shown as the CMD tag
        const traits = (unit.specialities || []).filter(
          (trait) => trait !== '_leader' && !!getIconForSpecialty(trait)
        );

        return html`
          <div class="main ${unit.isCommand ? 'command' : ''}">
            <unit-image .unit=${unit}></unit-image>
            <div class="cmd-points">${cmdPoints}</div>
            <div class="availability">
              x${veterancyQuantities[this.activeVeterancy]}
            </div>
            <div class="veterancy">
              ${getIconForVeterancy(this.activeVeterancy)}
            </div>
            ${traits.length
              ? html`<div class="traits">
                  ${traits.map((trait) => getIconForTrait(trait))}
                </div>`
              : ''}
            ${this.transport?.name
              ? html` <div class="details">
                  <div class="name">${this.transport?.name}</div>
                </div>`
              : ''}

            <div class="unit-name">
              ${unit.isCommand ? html`<span class="cmd-tag" title="Jednostka dowódcza">CMD</span>` : ''}
              <div class="name">${unit.name}</div>
            </div>
          </div>
        `;
      }
    }
    return html`NO PACK OR NO DECK`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'compact-armoury-card': CompactArmouryCard;
  }
}
