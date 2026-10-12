import { css, html, LitElement, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import './country-flag';
import { Division } from '../types/deck-builder';

@customElement('division-flag')
export class DivisionFlag extends LitElement {
  static get styles() {
    return css`
      :host {
        width: 2.5rem;
        display: flex;
        justify-content: center;
        align-items: center;
      }

      img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        overflow: hidden;
      }

      country-flag {
        width: 100%;
      }
    `;
  }

  @property()
  division?: Division

  @property()
  divisionId?: string

  /** No emblem image for this division (e.g. mod divisions): show the country flag */
  @state()
  missingEmblem = false

  willUpdate(changed: Map<string, unknown>) {
    if (changed.has('division') || changed.has('divisionId')) {
      this.missingEmblem = false;
    }
  }

  render(): TemplateResult {
    let displayName;
    if (this.divisionId) {
      const divisionId = this.divisionId;
      displayName = divisionId;
    }

    if (this.division) {
      displayName = this.division?.name ?? this.division?.descriptor ?? 'invalid division'
    }

    if (this.missingEmblem && this.division?.country) {
      return html`<country-flag .country=${this.division.country} title=${displayName ?? ''}></country-flag>`;
    }

    return html`<img
      src="/divisions/${this.division?.descriptor || this.divisionId}.png"
      alt=${displayName}
      title=${displayName}
      @error=${() => (this.missingEmblem = true)}
    />`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'division-flag': DivisionFlag;
  }
}
