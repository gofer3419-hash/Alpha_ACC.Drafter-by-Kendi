import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, property} from 'lit/decorators.js';

import Belgium from '../../images/flags/BEL_FLAG.png';
import EastGermany from '../../images/flags/RDA_FLAG.png';
import France from '../../images/flags/FR_FLAG.png';
import SovietUnion from '../../images/flags/SOV_FLAG.png';
import UK from '../../images/flags/UK_FLAG.png';
import USA from '../../images/flags/US_FLAG.png';
import WestGermany from '../../images/flags/RFA_FLAG.png';
import Poland from '../../images/flags/POL_FLAG.png';
import Netherlands from '../../images/flags/NL_FLAG.png';
import Luxembourg from '../../images/flags/LUX_FLAG.png';
// @ts-ignore
import Canada from '../../images/flags/CAN_FLAG.png';
// @ts-ignore
import Czechoslovakia from '../../images/flags/TCH_FLAG.png';
import { Country } from '../types/deck-builder';

@customElement('country-flag')
export class CountryFlag extends LitElement {
  static get styles() {
    return css`
      :host {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
      }

      img {
        width: 100%;
      }

      .code {
        font-size: var(--lumo-font-size-xs);
        font-weight: 700;
        letter-spacing: 0.05em;
        border: 1px solid var(--lumo-contrast-30pct);
        border-radius: var(--lumo-border-radius-s);
        padding: 2px 4px;
      }
    `;
  }

  @property()
  country?: Country;

  render(): TemplateResult {
    let image = '';
    switch (this.country) {
      case Country.BEL:
        image = Belgium;
        break;
      case Country.DDR:
        image = EastGermany;
        break;
      case Country.FR:
        image = France;
        break;
      case Country.SOV:
        image = SovietUnion;
        break;
      case Country.UK:
        image = UK;
        break;
      case Country.US:
        image = USA;
        break;
      case Country.RFA:
        image = WestGermany;
        break;
      case Country.POL:
        image = Poland
        break;
      case Country.NL:
        image = Netherlands;
        break;
      case Country.LUX:
        image = Luxembourg;
        break;
      case Country.CAN:
        image = Canada;
        break;
      case Country.TCH:
        image = Czechoslovakia;
        break;
    }
    if (!image) {
      // No flag image for this country (e.g. DK, ESP): show its code
      return html`<span class="code" title=${this.country ?? ''}
        >${this.country ?? ''}</span
      >`;
    }
    return html`<img src=${image} alt=${this.country} title=${this.country} />`;
  }
}


declare global {
  interface HTMLElementTagNameMap {
    'country-flag': CountryFlag;
  }
}