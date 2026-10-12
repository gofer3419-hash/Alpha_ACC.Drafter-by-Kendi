import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import '@vaadin/button';
import '@vaadin/text-area';
import {
  MAX_PLAYERS_PER_TEAM,
  Teams,
  parsePlayerNames,
  shuffleTeams,
} from '../utils/teams';

@customElement('team-shuffle-route')
export class TeamShuffleRoute extends LitElement {
  static get styles() {
    return css`
      :host {
        display: block;
        max-width: 40rem;
        margin: 0 auto;
        padding: var(--lumo-space-l) var(--lumo-space-m);
      }

      vaadin-text-area {
        width: 100%;
        min-height: 13.75rem;
      }

      .error {
        color: var(--lumo-error-text-color);
        min-height: 1.5em;
        margin-bottom: var(--lumo-space-s);
      }

      .teams {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--lumo-space-m);
        margin-top: var(--lumo-space-l);
      }

      .team {
        border-radius: var(--lumo-border-radius-m);
        padding: var(--lumo-space-m);
      }

      .team.blue {
        background-color: rgba(47, 111, 223, 0.15);
        border-top: 4px solid #2f6fdf;
      }

      .team.red {
        background-color: rgba(214, 58, 58, 0.15);
        border-top: 4px solid #d63a3a;
      }

      h2 {
        margin: 0 0 var(--lumo-space-s);
        font-size: var(--lumo-font-size-l);
      }

      ol {
        margin: 0;
        padding-left: 1.4em;
      }

      li {
        padding: var(--lumo-space-xs) 0;
      }
    `;
  }

  @state()
  private playersText = '';

  @state()
  private teams: Teams | null = null;

  @state()
  private error = '';

  private shuffle() {
    const names = parsePlayerNames(this.playersText);
    const max = MAX_PLAYERS_PER_TEAM * 2;
    if (names.length < 2) {
      this.error = 'Wpisz co najmniej 2 graczy.';
      return;
    }
    if (names.length > max) {
      this.error = `Maksymalnie ${max} graczy (${MAX_PLAYERS_PER_TEAM} na stronę).`;
      return;
    }
    this.error = '';
    this.teams = shuffleTeams(names, this.teams);
  }

  private renderTeam(title: string, players: string[], color: string) {
    return html`
      <div class="team ${color}">
        <h2>${title}</h2>
        <ol>
          ${players.map((player) => html`<li>${player}</li>`)}
        </ol>
      </div>
    `;
  }

  render(): TemplateResult {
    return html`
      <vaadin-text-area
        label="Gracze (jeden w linii, maksymalnie ${MAX_PLAYERS_PER_TEAM *
        2})"
        .value=${this.playersText}
        @value-changed=${(e: CustomEvent) => {
          this.playersText = e.detail.value;
        }}
      ></vaadin-text-area>
      <div class="error">${this.error}</div>
      <vaadin-button theme="primary large" @click=${() => this.shuffle()}>
        Losuj drużyny
      </vaadin-button>

      ${this.teams
        ? html`<div class="teams">
            ${this.renderTeam('Niebiescy', this.teams.blue, 'blue')}
            ${this.renderTeam('Czerwoni', this.teams.red, 'red')}
          </div>`
        : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'team-shuffle-route': TeamShuffleRoute;
  }
}
