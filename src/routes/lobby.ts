import {BeforeEnterObserver, RouterLocation} from '@vaadin/router';
import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import '@vaadin/button';
import '../components/lobby/lobby-draft';
// @ts-ignore
import AccLogo from '../../images/acc-logo.webp';
import {Dlc} from '../services/bundle-manager';
import {
  lobby,
  LobbyMember,
  LobbySnapshot,
  NICK_HELP,
  TeamColor,
} from '../services/lobby';
import {notificationService} from '../services/notification';
import {Dataset, DATASETS} from '../types/dataset';
import {copyText} from '../utils/export-deck-to-code';
import {getDlcs, loadOwnedDlc, saveOwnedDlc} from '../utils/owned-dlc';
import {MAX_PLAYERS_PER_TEAM, shuffleTeams} from '../utils/teams';
import {
  categoryLabel,
  drawMap,
  findMap,
  FORMATS,
  formatForTeamSize,
  mapLabel,
  MAPS,
} from '../utils/maps';
import {applySideTheme} from '../utils/theme';

const MAX_PLAYERS = MAX_PLAYERS_PER_TEAM * 2;

/**
 * Team lobby: one player creates it, the others join with the code and a
 * nick. Then the teams are drawn (as often as the host likes, or set by hand)
 * and the team draft starts.
 */
@customElement('lobby-route')
export class LobbyRoute extends LitElement implements BeforeEnterObserver {
  static get styles() {
    return css`
      :host {
        display: block;
      }

      .page {
        box-sizing: border-box;
        width: 100%;
        max-width: 47.5rem;
        margin: 0 auto;
        padding: var(--lumo-space-l) var(--lumo-space-m);
      }

      .page.wide {
        max-width: none;
        padding: 0;
      }

      .panel {
        box-sizing: border-box;
        margin-bottom: var(--lumo-space-m);
        padding: var(--lumo-space-l);
        background-color: hsla(0, 0%, 11%, 0.92);
        border: 1px solid var(--lumo-contrast-20pct);
        border-top: 3px solid var(--acc-burgundy);
      }

      .logo {
        display: block;
        width: min(16.25rem, 70%);
        margin: 0 auto var(--lumo-space-m);
      }

      h2,
      h3 {
        margin: 0 0 var(--lumo-space-s);
        letter-spacing: 0.12em;
        color: var(--lumo-secondary-color);
      }

      .entry {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--lumo-space-m);
      }

      @media (max-width: 700px) {
        .entry {
          grid-template-columns: 1fr;
        }
      }

      label {
        display: block;
        margin: var(--lumo-space-s) 0 2px;
        font-size: var(--lumo-font-size-s);
        color: var(--lumo-secondary-text-color);
      }

      input,
      select {
        box-sizing: border-box;
        width: 100%;
        padding: var(--lumo-space-s) var(--lumo-space-m);
        font: inherit;
        color: var(--lumo-body-text-color);
        background-color: rgba(0, 0, 0, 0.45);
        border: 1px solid var(--lumo-contrast-30pct);
        outline: none;
      }

      input:focus,
      select:focus {
        border-color: var(--acc-burgundy);
        box-shadow: 0 0 10px var(--acc-burgundy-glow);
      }

      input.code {
        text-transform: uppercase;
        letter-spacing: 0.4em;
        text-align: center;
        font-size: var(--lumo-font-size-xl);
      }

      .panel vaadin-button.wide {
        width: 100%;
        margin-top: var(--lumo-space-m);
      }

      .error {
        min-height: 1.4em;
        margin-top: var(--lumo-space-s);
        color: var(--lumo-error-text-color);
      }

      .notice {
        margin-bottom: var(--lumo-space-m);
        padding: var(--lumo-space-s) var(--lumo-space-m);
        color: var(--lumo-body-text-color);
        background-color: var(--lumo-primary-color-10pct);
        border-left: 3px solid var(--lumo-primary-text-color);
      }

      .offline {
        margin-bottom: var(--lumo-space-m);
        padding: var(--lumo-space-s) var(--lumo-space-m);
        color: var(--lumo-warning-text-color, #ffb74d);
        border-left: 3px solid var(--lumo-warning-text-color, #ffb74d);
      }

      .hint {
        font-size: var(--lumo-font-size-s);
        color: var(--lumo-secondary-text-color);
      }

      .room-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--lumo-space-s);
      }

      .code-big {
        font-size: var(--lumo-font-size-xxxl, 2.5rem);
        font-weight: 800;
        letter-spacing: 0.3em;
        color: var(--lumo-primary-text-color);
      }

      ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .member {
        display: flex;
        align-items: center;
        gap: var(--lumo-space-s);
        padding: var(--lumo-space-xs) var(--lumo-space-s);
        margin-bottom: var(--lumo-space-xs);
        background-color: var(--lumo-contrast-5pct);
        border-left: 3px solid var(--lumo-contrast-30pct);
      }

      .member.blue {
        border-left-color: #2f6fdf;
      }

      .member.red {
        border-left-color: #d63a3a;
      }

      .dot {
        flex: none;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background-color: #3ddc84;
      }

      .off .dot {
        background-color: var(--lumo-contrast-40pct);
      }

      .off .nick {
        opacity: 0.55;
      }

      .nick {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 700;
      }

      .tag {
        flex: none;
        font-size: var(--lumo-font-size-xs);
        color: var(--lumo-secondary-text-color);
      }

      .teams {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--lumo-space-m);
      }

      @media (max-width: 600px) {
        .teams {
          grid-template-columns: 1fr;
        }
      }

      .team {
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

      .team h3 {
        color: var(--lumo-body-text-color);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--lumo-space-s);
        margin-top: var(--lumo-space-m);
      }

      .dlc {
        display: flex;
        align-items: center;
        gap: var(--lumo-space-s);
        padding: 2px 0;
        cursor: pointer;
      }

      .dlc input {
        width: 1.125rem;
        height: 1.125rem;
        accent-color: var(--lumo-primary-color);
      }

      .draft-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--lumo-space-xs) var(--lumo-space-m);
        color: var(--lumo-secondary-text-color);
        font-size: var(--lumo-font-size-s);
      }
    `;
  }

  @state()
  private nickInput = lobby.savedNick;

  @state()
  private codeInput = '';

  @state()
  private datasetInput: Dataset = 'wif';

  @state()
  private error = '';

  @state()
  private busy = false;

  @state()
  private dlcs: Dlc[] = [];

  @state()
  private owned = new Set<string>(loadOwnedDlc());

  private dlcLoadedFor: Dataset | null = null;

  private onChange = () => {
    this.syncTheme();
    this.requestUpdate();
    void this.loadDlcs();
  };

  onBeforeEnter(location: RouterLocation) {
    const code = new URLSearchParams(location.search).get('code');
    if (code) {
      this.codeInput = code.toUpperCase().slice(0, 4);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    lobby.addEventListener('change', this.onChange);
    void lobby.start().then(() => this.onChange());
    this.syncTheme();
  }

  disconnectedCallback() {
    lobby.removeEventListener('change', this.onChange);
    super.disconnectedCallback();
  }

  /** Blue for NATO, red for PAKT once the teams are set */
  private syncTheme() {
    const snapshot = lobby.snapshot;
    applySideTheme(snapshot && snapshot.phase !== 'waiting' ? lobby.side : null);
  }

  /** Vanilla only: the player ticks the DLC he owns */
  private async loadDlcs() {
    const dataset = lobby.snapshot?.dataset;
    if (!dataset || this.dlcLoadedFor === dataset) {
      return;
    }
    this.dlcLoadedFor = dataset;
    try {
      this.dlcs = await getDlcs(dataset);
    } catch (error) {
      this.dlcs = [];
    }
  }

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  private async run(task: () => Promise<string | null>) {
    this.busy = true;
    this.error = '';
    const error = await task();
    this.busy = false;
    if (error) {
      this.error = error;
    }
  }

  private create() {
    return this.run(() => lobby.create(this.nickInput, this.datasetInput));
  }

  private join() {
    return this.run(() => lobby.join(this.codeInput, this.nickInput));
  }

  private act(action: string, body: Record<string, unknown> = {}) {
    return this.run(() => lobby.act(action, body));
  }

  private async leave() {
    const code = lobby.snapshot?.code;
    if (
      lobby.snapshot?.phase === 'drafting' &&
      !window.confirm('Draft trwa. Na pewno wyjść z lobby? Stracisz swój deck.')
    ) {
      return;
    }
    // Drop this browser's private draft of the lobby
    if (code) {
      try {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith(`lobbyDraft_${code}_`)) {
            localStorage.removeItem(key);
          }
        }
      } catch (error) {
        console.warn(error);
      }
    }
    await lobby.leave();
  }

  private async copyLink() {
    const code = lobby.snapshot?.code ?? '';
    const link = `${location.origin}/lobby?code=${code}`;
    const copied = await copyText(link);
    notificationService.instance?.addNotification({
      content: copied ? 'Skopiowano link do lobby' : `Link: ${link}`,
      duration: 3000,
      theme: copied ? '' : 'error',
    });
  }

  /** Random draw; with a previous draw the pairing is always different */
  private shuffle() {
    const snapshot = lobby.snapshot;
    if (!snapshot) {
      return;
    }
    const pids = snapshot.members.map((m) => m.pid);
    const previous =
      snapshot.phase === 'teams'
        ? {
            blue: this.teamPids('blue'),
            red: this.teamPids('red'),
          }
        : null;
    const teams = shuffleTeams(pids, previous);
    return this.act('teams', {blue: teams.blue, red: teams.red});
  }

  private teamPids(team: TeamColor): string[] {
    return (lobby.snapshot?.members ?? [])
      .filter((m) => m.team === team)
      .map((m) => m.pid);
  }

  private moveToOtherTeam(member: LobbyMember) {
    const blue = this.teamPids('blue').filter((p) => p !== member.pid);
    const red = this.teamPids('red').filter((p) => p !== member.pid);
    (member.team === 'blue' ? red : blue).push(member.pid);
    return this.act('teams', {blue, red});
  }

  /**
   * Map category: the host's choice, or (until he chooses) the one that fits
   * the number of players in the lobby
   */
  private mapFormat(): number {
    const snapshot = lobby.snapshot;
    if (snapshot?.mapFormat) {
      return snapshot.mapFormat;
    }
    return formatForTeamSize(Math.ceil((snapshot?.members.length ?? 2) / 2));
  }

  private chooseMapFormat(format: number) {
    return this.act('map', {format});
  }

  /** Host draws a map from the chosen category (never the same twice in a row) */
  private drawLobbyMap() {
    const format = this.mapFormat();
    const pool = MAPS.filter((m) => m.format === format);
    const previous = findMap(lobby.snapshot?.map ?? '');
    const map = drawMap(pool, previous);
    // The category is sent too, so everybody sees what it was drawn from
    return this.act('map', {format, map: map ? mapLabel(map) : ''});
  }

  /** Host chooses how divisions are picked (own choice or blind, mutual) */
  private renderDivModePanel(snapshot: LobbySnapshot, host: boolean): TemplateResult {
    const blind = snapshot.divMode === 'blind';
    return html`
      <div class="panel">
        <h3>WYBÓR DYWIZJI</h3>
        ${host
          ? html`
              <div class="actions" style="margin-top: 0">
                <vaadin-button
                  theme=${blind ? '' : 'primary'}
                  ?disabled=${this.busy}
                  @click=${() => this.act('divmode', {mode: 'self'})}
                >
                  Każdy wybiera sam
                </vaadin-button>
                <vaadin-button
                  theme=${blind ? 'primary' : ''}
                  ?disabled=${this.busy}
                  @click=${() => this.act('divmode', {mode: 'blind'})}
                >
                  Nawzajem, w ciemno
                </vaadin-button>
              </div>
            `
          : html`<div>${blind ? 'Nawzajem, w ciemno' : 'Każdy wybiera sam'}</div>`}
        <div class="hint" style="margin-top: var(--lumo-space-xs)">
          ${blind
            ? 'Gracz 1 wybiera kartę dla gracza 2, 2 dla 3 i tak dalej, a ostatni dla pierwszego (kolejność losuje serwer). Każdy dostaje 3 losowe dywizje, ale nikt ich nie widzi: wybiera się tylko pozycję karty.'
            : 'Każdy gracz dostaje 3 losowe dywizje i sam wybiera jedną. Nikt nie widzi cudzych.'}
        </div>
      </div>
    `;
  }

  /** Map category and draw: shown to the lobby when the draft is finished */
  private renderMapPanel(snapshot: LobbySnapshot, host: boolean): TemplateResult {
    const format = this.mapFormat();
    return html`
      <div class="panel">
        <h3>MAPA</h3>
        ${host
          ? html`
              <div class="hint">Na ile graczy ma być mapa?</div>
              <div class="actions" style="margin-top: var(--lumo-space-xs)">
                ${FORMATS.map(
                  (f) => html`<vaadin-button
                    theme=${f === format ? 'primary' : ''}
                    ?disabled=${this.busy}
                    @click=${() => this.chooseMapFormat(f)}
                  >
                    ${categoryLabel(f)}
                  </vaadin-button>`
                )}
              </div>
            `
          : html`<div class="hint">Kategoria: ${categoryLabel(format)}</div>`}
        <div class="code-big" style="font-size: var(--lumo-font-size-xxl)">
          ${snapshot.map ?? 'nie wylosowano'}
        </div>
        ${host
          ? html`<vaadin-button
              theme="primary"
              ?disabled=${this.busy}
              @click=${() => this.drawLobbyMap()}
            >
              ${snapshot.map ? 'Losuj mapę ponownie' : 'Losuj mapę'}
            </vaadin-button>`
          : ''}
      </div>
    `;
  }

  private swapSides() {
    return this.act('teams', {blue: this.teamPids('red'), red: this.teamPids('blue')});
  }

  private toggleDlc(id: string, checked: boolean) {
    const next = new Set(this.owned);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.owned = next;
    saveOwnedDlc([...next]);
  }

  /* ---------------------------------------------------------------- */
  /* Views                                                             */
  /* ---------------------------------------------------------------- */

  private renderEntry(): TemplateResult {
    const nickField = html`
      <label for="nick">Twój nick</label>
      <input
        id="nick"
        maxlength="20"
        autocomplete="off"
        placeholder="np. Kendi"
        .value=${this.nickInput}
        @input=${(e: InputEvent) =>
          (this.nickInput = (e.target as HTMLInputElement).value)}
      />
    `;
    return html`
      <div class="page">
        <img class="logo" src=${AccLogo} alt="ACC.DRAFTER" />
        ${lobby.notice ? html`<div class="notice">${lobby.notice}</div>` : ''}
        <div class="panel">
          ${nickField}
          <div class="hint" style="margin-top: 4px">${NICK_HELP}</div>
        </div>
        <div class="entry">
          <div class="panel">
            <h2>STWÓRZ LOBBY</h2>
            <label for="dataset">Gra</label>
            <select
              id="dataset"
              .value=${this.datasetInput}
              @change=${(e: Event) =>
                (this.datasetInput = (e.target as HTMLSelectElement).value as Dataset)}
            >
              ${(Object.keys(DATASETS) as Dataset[]).map(
                (key) =>
                  html`<option value=${key} ?selected=${key === this.datasetInput}>
                    ${DATASETS[key].title}
                  </option>`
              )}
            </select>
            <vaadin-button
              class="wide"
              theme="primary large"
              ?disabled=${this.busy || this.nickInput.trim().length < 2}
              @click=${() => this.create()}
            >
              Stwórz
            </vaadin-button>
          </div>
          <div class="panel">
            <h2>DOŁĄCZ DO LOBBY</h2>
            <label for="code">Kod lobby</label>
            <input
              id="code"
              class="code"
              maxlength="4"
              autocomplete="off"
              placeholder="ABCD"
              .value=${this.codeInput}
              @input=${(e: InputEvent) =>
                (this.codeInput = (e.target as HTMLInputElement).value.toUpperCase())}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                  this.join();
                }
              }}
            />
            <vaadin-button
              class="wide"
              theme="primary large"
              ?disabled=${this.busy ||
              this.nickInput.trim().length < 2 ||
              this.codeInput.trim().length < 4}
              @click=${() => this.join()}
            >
              Dołącz
            </vaadin-button>
          </div>
        </div>
        <div class="error">${this.error}</div>
      </div>
    `;
  }

  private renderMember(member: LobbyMember, canKick: boolean): TemplateResult {
    return html`
      <li class="member ${member.team ?? ''} ${member.connected ? '' : 'off'}">
        <span class="dot"></span>
        <span class="nick">${member.nick}</span>
        ${member.host ? html`<span class="tag">host</span>` : ''}
        ${member.pid === lobby.pid ? html`<span class="tag">(Ty)</span>` : ''}
        ${member.connected ? '' : html`<span class="tag">offline</span>`}
        ${canKick && member.pid !== lobby.pid
          ? html`<vaadin-button
              theme="tertiary small"
              @click=${() => this.act('kick', {pid: member.pid})}
              >Usuń</vaadin-button
            >`
          : ''}
      </li>
    `;
  }

  private renderDlc(dataset: Dataset): TemplateResult {
    if (dataset !== 'vanilla' || this.dlcs.length === 0) {
      return html``;
    }
    return html`
      <div class="panel">
        <h3>TWOJE DLC</h3>
        <div class="hint">
          Dywizje z gry bazowej są zawsze w puli. Zaznacz DLC, które masz.
        </div>
        ${this.dlcs.map(
          (dlc) => html`
            <label class="dlc">
              <input
                type="checkbox"
                .checked=${this.owned.has(dlc.id)}
                @change=${(e: Event) =>
                  this.toggleDlc(dlc.id, (e.target as HTMLInputElement).checked)}
              />
              <span>${dlc.name}</span>
            </label>
          `
        )}
      </div>
    `;
  }

  private renderRoomHead(code: string): TemplateResult {
    return html`
      <div class="panel">
        <div class="room-head">
          <div>
            <div class="hint">Kod lobby (podaj go innym graczom)</div>
            <div class="code-big">${code}</div>
          </div>
          <div class="actions" style="margin: 0">
            <vaadin-button @click=${() => this.copyLink()}>Kopiuj link</vaadin-button>
            <vaadin-button theme="tertiary" @click=${() => this.leave()}>
              Wyjdź z lobby
            </vaadin-button>
          </div>
        </div>
      </div>
    `;
  }

  private renderWaiting(): TemplateResult {
    const snapshot = lobby.snapshot!;
    const host = lobby.isHost;
    const hostMember = snapshot.members.find((m) => m.host);
    return html`
      <div class="page">
        ${this.renderRoomHead(snapshot.code)}
        <div class="panel">
          <h2>GRACZE (${snapshot.members.length}/${MAX_PLAYERS})</h2>
          <ul>
            ${snapshot.members.map((m) => this.renderMember(m, host))}
          </ul>
          <label for="ds">Gra</label>
          ${host
            ? html`<select
                id="ds"
                .value=${snapshot.dataset}
                @change=${(e: Event) =>
                  this.act('dataset', {dataset: (e.target as HTMLSelectElement).value})}
              >
                ${(Object.keys(DATASETS) as Dataset[]).map(
                  (key) =>
                    html`<option value=${key} ?selected=${key === snapshot.dataset}>
                      ${DATASETS[key].title}
                    </option>`
                )}
              </select>`
            : html`<div>${DATASETS[snapshot.dataset].title}</div>`}
        </div>
        ${this.renderDlc(snapshot.dataset)}
        ${this.renderDivModePanel(snapshot, host)}
        <div class="panel">
          ${host
            ? html`
                <div class="hint">
                  Gdy wszyscy są w lobby, losujesz drużyny. Losowanie możesz
                  powtarzać albo ustawić drużyny ręcznie.
                </div>
                <vaadin-button
                  class="wide"
                  theme="primary large"
                  ?disabled=${this.busy || snapshot.members.length < 2}
                  @click=${() => this.shuffle()}
                >
                  Losuj drużyny
                </vaadin-button>
                ${snapshot.members.length < 2
                  ? html`<div class="hint">Potrzeba co najmniej 2 graczy.</div>`
                  : ''}
              `
            : html`
                <div class="hint">Czekasz, aż host wylosuje drużyny…</div>
                ${hostMember && !hostMember.connected
                  ? html`<vaadin-button
                      theme="tertiary"
                      @click=${() => this.act('takehost')}
                    >
                      Host jest offline: przejmij lobby
                    </vaadin-button>`
                  : ''}
              `}
          <div class="error">${this.error}</div>
        </div>
      </div>
    `;
  }

  private renderTeam(color: TeamColor, title: string, host: boolean): TemplateResult {
    const members = (lobby.snapshot?.members ?? []).filter((m) => m.team === color);
    const otherFull =
      (lobby.snapshot?.members ?? []).filter((m) => m.team !== color).length >=
      MAX_PLAYERS_PER_TEAM;
    return html`
      <div class="team ${color}">
        <h3>${title} (${members.length})</h3>
        <ul>
          ${members.map(
            (m) => html`
              <li class="member ${color} ${m.connected ? '' : 'off'}">
                <span class="dot"></span>
                <span class="nick">${m.nick}</span>
                ${m.pid === lobby.pid ? html`<span class="tag">(Ty)</span>` : ''}
                ${host
                  ? html`<vaadin-button
                      theme="tertiary small"
                      ?disabled=${this.busy || otherFull || members.length < 2}
                      title="Przenieś do drugiej drużyny"
                      @click=${() => this.moveToOtherTeam(m)}
                      >${color === 'blue' ? '→ PAKT' : '← NATO'}</vaadin-button
                    >`
                  : ''}
              </li>
            `
          )}
        </ul>
      </div>
    `;
  }

  private renderTeams(): TemplateResult {
    const snapshot = lobby.snapshot!;
    const host = lobby.isHost;
    const blue = this.teamPids('blue').length;
    const red = this.teamPids('red').length;
    return html`
      <div class="page">
        ${this.renderRoomHead(snapshot.code)}
        <div class="teams">
          ${this.renderTeam('blue', 'NIEBIESCY: NATO', host)}
          ${this.renderTeam('red', 'CZERWONI: PAKT', host)}
        </div>
        ${Math.abs(blue - red) > 1
          ? html`<div class="notice" style="margin-top: var(--lumo-space-m)">
              Drużyny nie są równe (${blue} na ${red}).
            </div>`
          : ''}
        ${this.renderDlc(snapshot.dataset)}
        <div style="margin-top: var(--lumo-space-m)"></div>
        ${this.renderDivModePanel(snapshot, host)}
        <div class="panel">
          ${host
            ? html`
                <div class="hint">
                  Nie pasuje? Losuj ponownie, zamień strony albo przenieś graczy
                  ręcznie. Gdy drużyny są dobre, zacznij draft.
                </div>
                <div class="actions">
                  <vaadin-button ?disabled=${this.busy} @click=${() => this.shuffle()}>
                    Losuj ponownie
                  </vaadin-button>
                  <vaadin-button ?disabled=${this.busy} @click=${() => this.swapSides()}>
                    Zamień strony (NATO ↔ PAKT)
                  </vaadin-button>
                  <vaadin-button
                    theme="tertiary"
                    ?disabled=${this.busy}
                    @click=${() => this.act('back')}
                  >
                    Wróć do poczekalni
                  </vaadin-button>
                </div>
                <vaadin-button
                  class="wide"
                  theme="primary large"
                  ?disabled=${this.busy}
                  @click=${() => this.act('start')}
                >
                  Rozpocznij draft
                </vaadin-button>
              `
            : html`<div class="hint">Host ustawia drużyny. Czekasz na start draftu…</div>`}
          <div class="error">${this.error}</div>
        </div>
      </div>
    `;
  }

  private renderDraft(): TemplateResult {
    const snapshot = lobby.snapshot!;
    return html`
      <div class="page wide">
        <div class="draft-head">
          <span>Lobby ${snapshot.code} · ${lobby.side === 'NATO' ? 'NATO' : 'PAKT'}${snapshot.map ? ` · Mapa: ${snapshot.map}` : ''}</span>
          <vaadin-button theme="tertiary small" @click=${() => this.leave()}>
            Wyjdź z lobby
          </vaadin-button>
        </div>
        ${snapshot.phase === 'finished'
          ? html`<div class="page" style="padding-bottom: 0">
              ${this.renderMapPanel(snapshot, lobby.isHost)}
            </div>`
          : ''}
        <lobby-draft></lobby-draft>
      </div>
    `;
  }

  render(): TemplateResult {
    if (!lobby.started) {
      return html`<div class="page"><div class="hint">Łączę…</div></div>`;
    }
    const snapshot = lobby.snapshot;
    const banner = lobby.online
      ? ''
      : html`<div class="offline">
          Utracono połączenie z serwerem. Łączę ponownie…
        </div>`;

    if (!snapshot) {
      return this.renderEntry();
    }
    const view =
      snapshot.phase === 'waiting'
        ? this.renderWaiting()
        : snapshot.phase === 'teams'
        ? this.renderTeams()
        : this.renderDraft();
    return html`${banner}${view}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'lobby-route': LobbyRoute;
  }
}
