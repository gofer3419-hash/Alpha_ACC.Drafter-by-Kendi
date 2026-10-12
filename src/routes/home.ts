import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import '@vaadin/icon';
import {isSoundMuted, setSoundMuted} from '../utils/sound';
import {applySideTheme} from '../utils/theme';

@customElement('home-route')
export class HomeRoute extends LitElement {
  static get styles() {
    return css`
      :host {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: calc(100vh - var(--app-header-height));
        padding: var(--lumo-space-l);
        box-sizing: border-box;
      }

      nav {
        display: flex;
        flex-direction: column;
        gap: var(--lumo-space-m);
        width: 100%;
        max-width: 22.5rem;
      }

      a {
        display: block;
        padding: var(--lumo-space-l);
        border-radius: var(--lumo-border-radius-l);
        background-color: var(--lumo-primary-color);
        color: var(--lumo-primary-contrast-color);
        text-align: center;
        text-decoration: none;
        font-size: var(--lumo-font-size-xl);
        font-weight: 600;
      }

      a:hover {
        filter: brightness(1.2);
      }

      .sound {
        align-self: center;
        display: inline-flex;
        align-items: center;
        gap: var(--lumo-space-xs);
        margin-top: var(--lumo-space-s);
        padding: var(--lumo-space-xs) var(--lumo-space-s);
        border: none;
        border-radius: var(--lumo-border-radius-m);
        background: none;
        color: var(--lumo-secondary-text-color);
        font: inherit;
        font-size: var(--lumo-font-size-s);
        cursor: pointer;
      }

      .sound:hover {
        color: var(--lumo-body-text-color);
        background-color: var(--lumo-contrast-5pct);
      }

      .sound vaadin-icon {
        width: 1.125rem;
        height: 1.125rem;
      }
    `;
  }

  @state()
  private muted = isSoundMuted();

  connectedCallback() {
    super.connectedCallback();
    // Back at the menu: default colours
    applySideTheme(null);
  }

  private toggleSound() {
    this.muted = !this.muted;
    setSoundMuted(this.muted);
  }

  render(): TemplateResult {
    return html`
      <nav>
        <a href="/lobby">Lobby: draft drużynowy</a>
        <a href="/teams">Losowanie drużyn</a>
        <a href="/drafter/wif">WiF Deck Drafter</a>
        <a href="/drafter/vanilla">VANILLA Deck Drafter</a>
        <button
          class="sound"
          aria-pressed=${this.muted}
          @click=${() => this.toggleSound()}
        >
          <vaadin-icon
            icon=${this.muted ? 'vaadin:volume-off' : 'vaadin:volume-up'}
          ></vaadin-icon>
          ${this.muted ? 'Włącz dźwięk' : 'Wyłącz dźwięk'}
        </button>
      </nav>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'home-route': HomeRoute;
  }
}
