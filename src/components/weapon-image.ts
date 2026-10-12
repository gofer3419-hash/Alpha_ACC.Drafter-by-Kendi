import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {Weapon} from '../types/unit';

@customElement('weapon-image')
export class WeaponImage extends LitElement {
  static get styles() {
    return css`
      :host {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        width: 9.375rem;
      }

      img {
        width: 100%;
        max-height: 3.5rem;
      }

      /* The icon shape filled with the button burgundy */
      .icon {
        width: 100%;
        /* A parent can fix the height so all icons share one box */
        height: var(--weapon-icon-height, auto);
        aspect-ratio: 236 / 88;
        max-height: 3.5rem;
        background-color: var(--acc-burgundy-light);
        -webkit-mask-repeat: no-repeat;
        mask-repeat: no-repeat;
        -webkit-mask-position: center;
        mask-position: center;
        -webkit-mask-size: contain;
        mask-size: contain;
      }


    `;
  }

  @property()
  get weapon(): Weapon | undefined {
    return this._weapon;
  }

  set weapon(value: Weapon | undefined) {
    if(value?.weaponName !== this._weapon?.weaponName) {
      this.showFallback = false;
    }

    this._weapon = value;
  }

  @state()
  _weapon?: Weapon;

  @state()
  showFallback = false;

  render(): TemplateResult {
    if (this.weapon) {
      return html`
        ${this.showFallback
          ? html`<img
              src=${'/404-32x32.png'}
              alt=${'Image could not be found'}
              title=${this._weapon?.weaponName}
            /> `
          : html`<div
                class="icon"
                role="img"
                aria-label=${this._weapon?.weaponName ?? ''}
                title=${this._weapon?.weaponName ?? ''}
                style="-webkit-mask-image: url('${this.generateSrc()}'); mask-image: url('${this.generateSrc()}')"
              ></div>
              <img
                hidden
                src=${this.generateSrc()}
                alt=""
                @error=${() => {
                  this.showFallback = true;
                }}
              />`}
      `;
    }
    return html``;
  }

  generateSrc() {
    const imageTexture = this._weapon?.imageTexture;
    return `/images/weapons/${imageTexture}.png`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'weapon-image': WeaponImage;
  }
}
