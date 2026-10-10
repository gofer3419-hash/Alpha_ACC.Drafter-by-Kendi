import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement} from 'lit/decorators.js';
import '../components/notification-manager';
// @ts-ignore
import AccLogo from '../../images/acc-logo.webp';

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
        height: var(--app-header-bar);
        flex: 0 0 var(--app-header-bar);
        margin-top: var(--app-header-offset);
        box-sizing: border-box;
        display: flex;
        align-items: center;
        padding: 0 var(--lumo-space-m);
        background: linear-gradient(
          to bottom,
          hsla(0, 0%, 8%, 0.92),
          hsla(0, 0%, 12%, 0.88)
        );
        border-top: 1px solid hsla(346, 92%, 45%, 0.45);
        border-bottom: 2px solid var(--acc-burgundy);
        box-shadow: 0 2px 14px var(--acc-burgundy-glow),
          0 6px 18px rgba(0, 0, 0, 0.5);
      }

      header a {
        display: flex;
        align-items: center;
        height: 100%;
      }

      header img {
        height: 104px;
        margin: -6px 0;
        width: auto;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.7));
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
          <img src=${AccLogo} alt="ACC.DRAFTER" />
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
