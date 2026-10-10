import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement} from 'lit/decorators.js';
import '../components/notification-manager';
// @ts-ignore
import WaryesImage from '../../images/waryes-transparent.png';

/**
 * Root layout: a slim top bar and the routed page below it.
 */
@customElement('application-route')
export class Application extends LitElement {
  static get styles() {
    return css`
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
      }

      header {
        height: 44px;
        flex: 0 0 44px;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        padding: 0 var(--lumo-space-m);
        border-bottom: 1px solid var(--lumo-contrast-10pct);
        background-color: var(--lumo-base-color);
      }

      header a {
        display: flex;
        align-items: center;
      }

      main {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
    `;
  }

  render(): TemplateResult {
    return html`
      <notification-manager></notification-manager>
      <header>
        <a href="/" title="Strona główna">
          <img height="32" src=${WaryesImage} alt="WarYes" />
        </a>
      </header>
      <main>
        <slot></slot>
      </main>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'application-route': Application;
  }
}
