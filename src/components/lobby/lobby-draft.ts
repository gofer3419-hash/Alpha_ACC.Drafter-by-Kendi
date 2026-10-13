import {css, html, TemplateResult} from 'lit';
import {customElement, query, state} from 'lit/decorators.js';
import '@vaadin/button';
import '../deck-draft/deck-draft-division-picker';
import '../deck-draft/deck-draft-unit-picker';
import {DeckDraftUnitPicker} from '../deck-draft/deck-draft-unit-picker';
import '../deck-draft/deck-draft-deck-display';
import '../deck/deck-header';
import '../deck/deck-title';
import '../deck/summary-view';
import 'side-drawer';
import {
  DeckDraftRoute,
  DeckDraftState,
  PackChoice,
  UnitPickState,
} from '../../routes/deck-draft';
import {DeckDraftFactory} from '../../classes/deck-drafter/DeckDraftFactory';
import {DeckDraftController} from '../../classes/deck-drafter/DeckDraftController';
import {BundleManagerService} from '../../services/bundle-manager';
import {
  DraftView,
  lobby,
  LobbyMember,
  LobbySnapshot,
  SLOT_NAMES,
} from '../../services/lobby';
import {notificationService} from '../../services/notification';
import {allowedDivisionDescriptors} from '../../utils/owned-dlc';
import {copyText, getDeckCode} from '../../utils/export-deck-to-code';
import {applySideTheme} from '../../utils/theme';
import {Unit, UnitMap} from '../../types/unit';
import {Deck} from '../../classes/deck';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How long the cards stay on screen with the taken one highlighted. The next
 * cards are drawn and their images loaded meanwhile, behind the shown ones.
 */
const SHOW_PICK_MS = 2500;
/** Do not wait longer than this for the images of the new cards */
const PRELOAD_MAX_MS = 2500;

/** Loads the images of the coming cards so they appear at once */
function preloadImages(urls: string[]): Promise<void> {
  const loads = urls.map(
    (url) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = url;
      })
  );
  return Promise.race([Promise.all(loads).then(() => undefined), sleep(PRELOAD_MAX_MS)]);
}

/**
 * The draft of one player inside a team lobby.
 *
 * Everything behind the cards (units, deck, deck code) lives only in this
 * browser. The server only passes on which card position (left / middle /
 * right) the player on turn took; every player applies that position to his
 * own, private cards.
 */
@customElement('lobby-draft')
export class LobbyDraft extends DeckDraftRoute {
  static get styles() {
    return [
      super.styles,
      css`
        :host {
          display: block;
          height: auto;
        }

        .turnbar {
          display: flex;
          flex-direction: column;
          gap: var(--lumo-space-s);
          box-sizing: border-box;
          margin: var(--lumo-space-s) var(--lumo-space-m) 0;
          padding: var(--lumo-space-s) var(--lumo-space-m);
          background-color: hsla(0, 0%, 11%, 0.92);
          border: 1px solid var(--lumo-contrast-20pct);
          border-left: 4px solid var(--lumo-contrast-40pct);
        }

        .turnbar.mine {
          border-left-color: var(--lumo-primary-text-color);
          box-shadow: 0 0 22px var(--acc-burgundy-glow);
        }

        .turn-title {
          font-size: var(--lumo-font-size-l);
          font-weight: 700;
          letter-spacing: 0.08em;
          color: var(--lumo-secondary-color);
        }

        .mine .turn-title {
          color: var(--lumo-primary-text-color);
        }

        .turn-note {
          font-size: var(--lumo-font-size-s);
          color: var(--lumo-secondary-text-color);
        }

        .chosen {
          font-size: var(--lumo-font-size-m);
          font-weight: 700;
          color: var(--lumo-body-text-color);
        }

        .queue {
          display: flex;
          flex-wrap: wrap;
          gap: var(--lumo-space-xs);
        }

        .chip {
          padding: 2px var(--lumo-space-s);
          font-size: var(--lumo-font-size-s);
          background-color: var(--lumo-contrast-5pct);
          border-bottom: 3px solid var(--lumo-contrast-30pct);
        }

        .chip.blue {
          border-bottom-color: #2f6fdf;
        }

        .chip.red {
          border-bottom-color: #d63a3a;
        }

        .chip.current {
          background-color: var(--lumo-primary-color-50pct);
          font-weight: 700;
        }

        .chip.done {
          opacity: 0.5;
          text-decoration: line-through;
        }

        .chip.offline {
          opacity: 0.5;
          font-style: italic;
        }

        .loading {
          padding: var(--lumo-space-l);
          text-align: center;
          color: var(--lumo-secondary-text-color);
        }

        .mates {
          box-sizing: border-box;
          width: 100%;
          margin: 0 var(--lumo-space-m) var(--lumo-space-m);
          padding: var(--lumo-space-l);
          background-color: hsla(0, 0%, 11%, 0.92);
          border: 1px solid var(--lumo-contrast-20pct);
          border-top: 3px solid var(--lumo-primary-color);
        }

        .mates h3 {
          margin: 0 0 var(--lumo-space-s);
          letter-spacing: 0.12em;
          color: var(--lumo-secondary-color);
        }

        .mate-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: var(--lumo-space-s);
          margin-bottom: var(--lumo-space-m);
        }

        .mate-tabs button {
          padding: var(--lumo-space-xs) var(--lumo-space-m);
          font: inherit;
          font-weight: 700;
          color: var(--lumo-body-text-color);
          background-color: var(--lumo-contrast-5pct);
          border: 1px solid var(--lumo-contrast-30pct);
          cursor: pointer;
        }

        .mate-tabs button.active {
          background-color: var(--lumo-primary-color-50pct);
          border-color: var(--lumo-primary-color);
        }

        .mate-tabs button.waiting {
          opacity: 0.5;
          font-style: italic;
          cursor: default;
        }

        .blind {
          box-sizing: border-box;
          margin: var(--lumo-space-m);
          padding: var(--lumo-space-l);
          text-align: center;
          background-color: hsla(0, 0%, 11%, 0.92);
          border: 1px solid var(--lumo-contrast-20pct);
          border-top: 3px solid var(--acc-burgundy);
        }

        .blind h3 {
          margin: 0 0 var(--lumo-space-s);
          letter-spacing: 0.12em;
          color: var(--lumo-secondary-color);
        }

        .blind-cards {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: var(--lumo-space-m);
          margin: var(--lumo-space-l) 0;
        }

        .blind-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--lumo-space-s);
          width: 11rem;
          height: 15rem;
          font: inherit;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: var(--lumo-body-text-color);
          background-color: var(--lumo-contrast-5pct);
          background-image: repeating-linear-gradient(
            45deg,
            transparent 0 10px,
            var(--lumo-contrast-5pct) 10px 20px
          );
          border: 2px solid var(--lumo-contrast-30pct);
          cursor: pointer;
        }

        .blind-card:hover:not([disabled]) {
          border-color: var(--lumo-primary-color);
          box-shadow: 0 0 22px var(--acc-burgundy-glow);
          transform: translateY(-4px);
        }

        .blind-card[disabled] {
          opacity: 0.5;
          cursor: default;
        }

        .blind-card .mark {
          font-size: var(--lumo-font-size-xxxl, 2.5rem);
          color: var(--lumo-secondary-color);
        }

        .private-note {
          margin-top: var(--lumo-space-s);
          font-size: var(--lumo-font-size-s);
          color: var(--lumo-secondary-text-color);
        }
      `,
    ];
  }

  /** Card position being shown before it is applied (-1 = none) */
  @state()
  private highlight = -1;

  @state()
  private applying = false;

  @query('deck-draft-unit-picker')
  private picker?: DeckDraftUnitPicker;

  /**
   * Cards kept on screen while the round is applied behind them (null = show
   * the current cards of the draft)
   */
  @state()
  private shownChoices: PackChoice[] | null = null;

  /** Bumped when new cards should slide in */
  @state()
  private revealKey = 0;

  @state()
  private loadError = '';

  /** Round in which this player already sent his pick (waiting for the server) */
  private sentAtRound = -1;
  private appliedRound = 0;
  private appliedKey = '';
  private syncing = false;
  private again = false;
  private ready = false;
  private applyingDivision = false;
  /** Deck code last sent to the server (so it is sent once per deck) */
  private sharedCode = '';
  private mateDecks = new Map<string, Deck | null>();

  /** Teammate whose deck is open at the end of the draft */
  @state()
  private selectedMate = '';

  private onLobbyChange = () => {
    this.requestUpdate();
    void this.sync();
  };

  connectedCallback() {
    super.connectedCallback();
    lobby.addEventListener('change', this.onLobbyChange);
    void this.setup();
  }

  disconnectedCallback() {
    lobby.removeEventListener('change', this.onLobbyChange);
    super.disconnectedCallback();
  }

  /** Loads the game data and creates (or restores) this player's own draft */
  private async setup() {
    const snapshot = lobby.snapshot;
    if (!snapshot || this.ready) {
      return;
    }
    try {
      const dataset = snapshot.dataset;
      this.draftDataset = dataset;
      applySideTheme(lobby.side);

      const divisions = await BundleManagerService.getDivisions(dataset);
      const units: Unit[] = await BundleManagerService.getUnits(dataset);
      const unitMap = {} as UnitMap;
      for (const unit of units) {
        unitMap[unit.descriptorName] = unit;
      }
      this.divisions = divisions;
      this.units = units;
      this.unitMap = unitMap;

      // Own storage key: a reload or a lost connection keeps this very draft
      const key = `lobbyDraft_${snapshot.code}_${lobby.pid}`;
      this.appliedKey = `${key}_applied`;

      let engine;
      try {
        engine = await DeckDraftFactory.createEngineFromLocalStorage(dataset, key);
        this.appliedRound = Number(localStorage.getItem(this.appliedKey) || 0);
      } catch (error) {
        engine = await DeckDraftFactory.createClientEngine(
          dataset,
          {
            side: lobby.side ?? undefined,
            allowedDivisions: await allowedDivisionDescriptors(dataset),
          },
          key
        );
        this.appliedRound = 0;
        localStorage.setItem(this.appliedKey, '0');
      }

      const controller = new DeckDraftController(engine);
      controller.registerCallback(() => {
        this.handleState(engine.state as DeckDraftState);
      });
      this.engineController = controller;
      this.handleState(engine.state as DeckDraftState);
      this.ready = true;
      void this.sync();
    } catch (error) {
      console.error(error);
      this.loadError = 'Nie udało się przygotować draftu. Odśwież stronę.';
    }
  }

  /* ---------------------------------------------------------------- */
  /* Following the server                                              */
  /* ---------------------------------------------------------------- */

  /** One run at a time; a change that arrives meanwhile triggers another run */
  private async sync() {
    if (this.syncing) {
      this.again = true;
      return;
    }
    this.syncing = true;
    try {
      do {
        this.again = false;
        await this.step();
      } while (this.again);
    } catch (error) {
      console.error('Draft sync failed', error);
      // Never leave old cards shown or locked after an error
      this.shownChoices = null;
      this.highlight = -1;
      this.applying = false;
    } finally {
      this.syncing = false;
    }
  }

  private async step() {
    if (!this.ready || !this.engineController) {
      return;
    }
    const state = this.state;
    const snapshot = lobby.snapshot;
    const draft = snapshot?.draft;

    // Blind division mode: the previous player picked a position, this
    // browser takes that position from its own private division cards
    if (state?.phase === 'DIVISION_PICK' && draft?.blind) {
      const slot = draft.divAssigned?.[lobby.pid];
      if (slot !== undefined && !this.applyingDivision) {
        this.applyingDivision = true;
        try {
          await this.engineController.chooseOption(slot);
        } finally {
          this.applyingDivision = false;
        }
        this.again = true;
      }
      return;
    }

    if (!state || !snapshot || !draft || state.phase !== 'UNIT_PICK') {
      return;
    }

    // Division chosen (also after a reload): tell the server
    if (!draft.ready.includes(lobby.pid)) {
      await lobby.act('ready');
    }
    if (draft.stage === 'division') {
      return;
    }

    // Apply every round of the log this browser has not applied yet, in order
    for (;;) {
      const current = lobby.snapshot?.draft;
      if (!current || this.appliedRound >= current.round) {
        break;
      }
      const entry = current.log.find((e) => e.round === this.appliedRound + 1);
      if (!entry) {
        break;
      }
      const choices = (this.state as UnitPickState).data.choices;
      const live = entry.round === current.round && current.stage === 'units';
      const shownSince = Date.now();
      let frozen = false;
      if (choices.length > 0) {
        // Deck not full yet: take the same position (or the last card if
        // this player has fewer cards left than the picker)
        const slot = Math.min(entry.slot, choices.length - 1);
        this.applying = true;
        if (live) {
          // The current cards stay on screen with the taken one highlighted;
          // everything below happens behind them
          this.shownChoices = choices.slice();
          this.highlight = slot;
          frozen = true;
        }
        await this.engineController.chooseOption(slot);
        if (live) {
          await preloadImages(this.choiceImageUrls());
        }
      }
      this.appliedRound = entry.round;
      localStorage.setItem(this.appliedKey, String(this.appliedRound));
      const full = (this.state as UnitPickState).data.choices.length === 0;
      if (full) {
        await this.shareDeck();
      }
      await lobby.act('ack', {round: this.appliedRound, done: full});
      if (frozen) {
        // Then the cards flip: the old ones turn edge-on, the new ones
        // (already rendered underneath) turn back to face the player
        await sleep(Math.max(0, SHOW_PICK_MS - (Date.now() - shownSince)));
        await this.picker?.flipOut();
        this.shownChoices = null;
        this.highlight = -1;
        this.revealKey += 1;
      } else {
        this.highlight = -1;
      }
      this.applying = false;
    }

    // A deck that is full at the start of the rounds still has to say so
    const after = lobby.snapshot?.draft;
    const full = (this.state as UnitPickState).data.choices.length === 0;
    if (after && full) {
      // Also after a reload: the server may have lost nothing, but a repeat is harmless
      await this.shareDeck();
      if (!after.done.includes(lobby.pid)) {
        await lobby.act('ack', {round: this.appliedRound, done: true});
      }
    }
  }

  /** Unit and transport images of the cards on offer */
  private choiceImageUrls(): string[] {
    const state = this.state;
    if (state?.phase !== 'UNIT_PICK') {
      return [];
    }
    const urls: string[] = [];
    for (const choice of state.data.choices) {
      for (const descriptor of [choice.unit, choice.transport]) {
        if (descriptor) {
          urls.push(`/images/units/${descriptor}.webp`);
        }
      }
    }
    return urls;
  }

  /**
   * Sends the finished deck code to the server. The server keeps it hidden
   * until every deck is full, then shows it to the owner's team only.
   */
  private async shareDeck() {
    const code = getDeckCode(this.activeDeck);
    if (!code || code === this.sharedCode) {
      return;
    }
    const error = await lobby.act('share', {code});
    if (!error) {
      this.sharedCode = code;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Clicks                                                            */
  /* ---------------------------------------------------------------- */

  private async onDivisionChosen(choice: number) {
    if (!this.engineController) {
      return;
    }
    try {
      this.disableButtons = true;
      await this.engineController.chooseOption(choice);
      await lobby.act('ready');
    } finally {
      this.disableButtons = false;
      void this.sync();
    }
  }

  /** The player on turn chose a card: the server tells everybody the position */
  private async onUnitChosen(choice: number) {
    const draft = lobby.snapshot?.draft;
    if (!draft || !this.myTurn(draft)) {
      return;
    }
    this.sentAtRound = draft.round;
    this.requestUpdate();
    const error = await lobby.act('pick', {slot: choice});
    if (error) {
      this.sentAtRound = -1;
      notificationService.instance?.addNotification({
        content: error,
        duration: 4000,
        theme: 'error',
      });
      this.requestUpdate();
    }
  }

  private myTurn(draft: DraftView): boolean {
    const state = this.state;
    return (
      draft.stage === 'units' &&
      draft.current === lobby.pid &&
      !draft.pending &&
      this.appliedRound >= draft.round &&
      this.sentAtRound !== draft.round &&
      !this.applying &&
      state?.phase === 'UNIT_PICK' &&
      state.data.choices.length > 0
    );
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  private nick(snapshot: LobbySnapshot, pid: string | null): string {
    return snapshot.members.find((m) => m.pid === pid)?.nick ?? '?';
  }

  private chip(member: LobbyMember, draft: DraftView): TemplateResult {
    const classes = [
      member.team ?? '',
      draft.current === member.pid ? 'current' : '',
      draft.done.includes(member.pid) ? 'done' : '',
      member.connected ? '' : 'offline',
    ].join(' ');
    return html`<span class="chip ${classes}">${member.nick}</span>`;
  }

  private renderTurnBar(snapshot: LobbySnapshot, draft: DraftView): TemplateResult {
    const mine = this.myTurn(draft);
    const full =
      this.state?.phase === 'UNIT_PICK' && this.state.data.choices.length === 0;
    let title: string;
    let note = '';

    if (draft.stage === 'division' && draft.blind) {
      title = draft.ready.includes(lobby.pid)
        ? 'CZEKASZ NA POZOSTAŁYCH GRACZY'
        : 'LOSOWANIE DYWIZJI';
      note = `Gotowych: ${draft.ready.length}/${snapshot.members.length}. Każdy wybiera pozycję karty dla następnego gracza, nikt nie zna niczyich dywizji.`;
    } else if (draft.stage === 'division') {
      title = draft.ready.includes(lobby.pid)
        ? 'CZEKASZ NA POZOSTAŁYCH GRACZY'
        : 'WYBIERZ DYWIZJĘ';
      note = `Gotowych: ${draft.ready.length}/${snapshot.members.length}. Dywizję wybierasz sam i nikt jej nie widzi.`;
    } else if (draft.stage === 'finished') {
      title = 'DRAFT ZAKOŃCZONY';
      note = 'Wszyscy mają pełne decki.';
    } else if (full) {
      title = 'TWÓJ DECK JEST PEŁNY';
      note = 'Wypadasz z kolejki. Pozostali gracze dalej wybierają.';
    } else if (mine) {
      title = 'TWOJA TURA: WYBIERZ KARTĘ';
      note = 'Pozostali gracze wezmą tę samą pozycję karty (lewą, środkową albo prawą).';
    } else if (draft.pending) {
      title = `${this.nick(snapshot, draft.pending.by).toUpperCase()} WYBRAŁ: ${SLOT_NAMES[draft.pending.slot]}`;
      note = 'Ta pozycja jest właśnie brana z Twoich kart.';
    } else if (draft.current) {
      title = `TURA: ${this.nick(snapshot, draft.current).toUpperCase()}`;
      note = 'Czekasz na jego wybór.';
    } else {
      title = 'CZEKAMY NA GRACZY';
      note = 'Ktoś jest offline albo nadrabia rundy.';
    }

    const queue = draft.order
      .map((pid) => snapshot.members.find((m) => m.pid === pid))
      .filter((m): m is LobbyMember => !!m);

    return html`
      <div class="turnbar ${mine ? 'mine' : ''}">
        <div class="turn-title">${title}</div>
        <div class="turn-note">${note}</div>
        ${draft.stage === 'units'
          ? html`<div class="queue">${queue.map((m) => this.chip(m, draft))}</div>`
          : ''}
        ${lobby.isHost && draft.stage === 'units' && !draft.pending && draft.current
          ? html`<div>
              <vaadin-button
                theme="tertiary small"
                @click=${() => lobby.act('skip')}
              >
                Pomiń turę gracza (np. gdy się rozłączył)
              </vaadin-button>
            </div>`
          : ''}
        <div class="turn-note">
          Twoje wybory są prywatne: inni widzą tylko pozycję karty (lewa, środkowa,
          prawa), nigdy jednostki.
        </div>
      </div>
    `;
  }

  /** Deck of a teammate from its code (cached; null when it cannot be read) */
  private mateDeck(code: string): Deck | null {
    if (!this.unitMap || !this.divisions) {
      return null;
    }
    const cached = this.mateDecks.get(code);
    if (cached !== undefined) {
      return cached;
    }
    let deck: Deck | null = null;
    try {
      deck = Deck.fromDeckCode(code, {
        unitMap: this.unitMap,
        divisions: this.divisions,
      });
    } catch (error) {
      console.error(error);
    }
    this.mateDecks.set(code, deck);
    return deck;
  }

  /** After the whole draft: the decks of this player's teammates */
  private renderMates(snapshot: LobbySnapshot): TemplateResult {
    if (snapshot.phase !== 'finished') {
      return html``;
    }
    const mates = snapshot.members.filter(
      (m) => m.team === lobby.me?.team && m.pid !== lobby.pid
    );
    if (mates.length === 0) {
      return html``;
    }
    const decks = snapshot.decks ?? {};
    const selected =
      mates.find((m) => m.pid === this.selectedMate) ??
      mates.find((m) => decks[m.pid]) ??
      mates[0];
    const code = decks[selected.pid];
    const deck = code ? this.mateDeck(code) : null;
    return html`
      <div class="content complete">
        <div class="mates">
          <h3>DECKI DRUŻYNY</h3>
          <div class="mate-tabs">
            ${mates.map(
              (m) => html`<button
                class="${m.pid === selected.pid ? 'active' : ''} ${decks[m.pid]
                  ? ''
                  : 'waiting'}"
                @click=${() => (this.selectedMate = m.pid)}
              >
                ${m.nick}
              </button>`
            )}
          </div>
          ${deck
            ? html`
                <deck-header .deck=${deck}>
                  <div class="deck-title" slot="title">
                    <deck-title .deck=${deck} .name=${deck.division?.name}>
                    </deck-title>
                    <div class="button-bar">
                      <vaadin-button
                        theme="primary large"
                        @click=${() => this.copyMateCode(code)}
                      >
                        Kopiuj kod
                      </vaadin-button>
                    </div>
                  </div>
                </deck-header>
                <summary-view .deck=${deck}></summary-view>
              `
            : html`<p class="loading">
                ${code
                  ? 'Nie udało się wczytać tego decku.'
                  : `${selected.nick} nie przesłał jeszcze decku (może być offline).`}
              </p>`}
        </div>
      </div>
    `;
  }

  private async copyMateCode(code: string) {
    const copied = await copyText(code);
    notificationService.instance?.addNotification({
      content: copied ? 'Skopiowano kod decku' : `Kod decku: ${code}`,
      duration: copied ? 3000 : 8000,
      theme: copied ? '' : 'error',
    });
  }

  /**
   * Blind division mode. The player sees three face-down cards and picks one
   * position for the NEXT player in the queue (the last picks for the first).
   * Nobody sees any division; the position is applied to the receiver's own
   * private cards.
   */
  private renderBlindDivision(snapshot: LobbySnapshot, draft: DraftView): TemplateResult {
    const order = draft.order;
    const index = order.indexOf(lobby.pid);
    const next = order.length > 0 ? order[(index + 1) % order.length] : null;
    const picked = (draft.divPicked ?? []).includes(lobby.pid);
    const missing = order.filter((p) => !(draft.divPicked ?? []).includes(p));
    const assigned = draft.divAssigned?.[lobby.pid] !== undefined;

    let body: TemplateResult;
    if (picked) {
      body = html`<p>
        Wybrałeś kartę dla <b>${this.nick(snapshot, next)}</b>.
        ${assigned
          ? 'Twoja dywizja jest właśnie losowana.'
          : 'Czekasz, aż ktoś wybierze kartę dla Ciebie.'}
      </p>`;
    } else {
      body = html`
        <p>
          Wybierz kartę dla gracza <b>${this.nick(snapshot, next)}</b>.
          Nie wiesz, jaką dywizję ma pod nią: to losowe, a Twoją dywizję
          wybierze ktoś inny.
        </p>
        <div class="blind-cards">
          ${SLOT_NAMES.map(
            (name, slot) => html`<button
              class="blind-card"
              ?disabled=${this.disableButtons}
              @click=${() => this.onBlindPick(slot)}
            >
              <span class="mark">?</span>${name}
            </button>`
          )}
        </div>
      `;
    }
    return html`
      <div class="blind">
        <h3>WYBÓR DYWIZJI NAWZAJEM</h3>
        ${body}
        ${lobby.isHost && missing.length > 0
          ? html`<vaadin-button
              theme="tertiary small"
              @click=${() => lobby.act('divrandom')}
            >
              Wylosuj za graczy, którzy jeszcze nie wybrali (np. offline)
            </vaadin-button>`
          : ''}
      </div>
    `;
  }

  private async onBlindPick(slot: number) {
    this.disableButtons = true;
    const error = await lobby.act('divpick', {slot});
    this.disableButtons = false;
    if (error) {
      notificationService.instance?.addNotification({
        content: error,
        duration: 4000,
        theme: 'error',
      });
    }
  }

  private renderComplete(): TemplateResult {
    return html`
      <div class="content complete">
        <div class="deck-summary-container">
          <deck-header .deck=${this.activeDeck}>
            <div class="deck-title" slot="title">
              <deck-title
                .deck=${this.activeDeck}
                .name=${this.activeDeck?.division?.name}
              >
              </deck-title>
              <div class="button-bar">
                <vaadin-button theme="primary large" @click=${() => this.copyDeckCode()}>
                  Kopiuj kod
                </vaadin-button>
              </div>
            </div>
          </deck-header>
          <div class="deck-code-box">
            <label for="deck-code">
              Kod decku (do importu w grze). Widzisz go tylko Ty:
            </label>
            <textarea
              id="deck-code"
              readonly
              rows="3"
              .value=${getDeckCode(this.activeDeck) ?? ''}
              @focus=${(e: FocusEvent) => (e.target as HTMLTextAreaElement).select()}
              @click=${(e: MouseEvent) => (e.target as HTMLTextAreaElement).select()}
            ></textarea>
          </div>
          <summary-view .deck=${this.activeDeck}></summary-view>
        </div>
      </div>
    `;
  }

  render(): TemplateResult {
    const snapshot = lobby.snapshot;
    const draft = snapshot?.draft;
    if (this.loadError) {
      return html`<p class="loading">${this.loadError}</p>`;
    }
    if (!snapshot || !draft || !this.state || !this.engineController) {
      return html`<p class="loading">Przygotowuję draft…</p>`;
    }
    const bar = this.renderTurnBar(snapshot, draft);

    if (this.state.phase === 'DIVISION_PICK' && draft.blind) {
      return html`${bar}${this.renderBlindDivision(snapshot, draft)}`;
    }

    if (this.state.phase === 'DIVISION_PICK') {
      return html`
        ${bar}
        <deck-draft-division-picker
          class="content"
          .choices=${this.state.data.choices}
          .divisions=${this.divisions}
          .disable=${this.disableButtons}
          @division-chosen=${(e: CustomEvent) =>
            this.onDivisionChosen(e.detail.choice)}
        ></deck-draft-division-picker>
      `;
    }

    if (this.state.phase === 'UNIT_PICK') {
      const cards = this.shownChoices ?? this.state.data.choices;
      if (cards.length === 0) {
        return html`${bar}${this.renderComplete()}${this.renderMates(snapshot)}`;
      }
      const mine = this.myTurn(draft);
      return html`
        ${bar}
        <side-drawer
          @open=${() => this.openDeckDrawer()}
          @close=${() => this.closeDeckDrawer()}
          ?open=${this.showDeckDrawer}
        >
          <deck-draft-deck-display .deck=${this.activeDeck}></deck-draft-deck-display>
        </side-drawer>
        <div class="button-drawer hide-on-desktop">
          <vaadin-button @click=${() => this.openDeckDrawer()} theme="large primary"
            >Pokaż deck</vaadin-button
          >
        </div>
        <div class="container">
          ${this.activeDeck === null
            ? ''
            : html`<deck-draft-deck-display
                class="hide-on-mobile"
                .deck=${this.activeDeck}
              ></deck-draft-deck-display>`}
          <deck-draft-unit-picker
            class="content"
            .choices=${cards}
            .units=${this.units}
            .deck=${this.activeDeck}
            .round=${draft.round}
            .revealKey=${this.revealKey}
            .animateOnEnable=${false}
            .highlight=${this.highlight}
            .disable=${!mine}
            .buttonLabel=${mine ? 'Dodaj' : 'Czekasz'}
            @unit-chosen=${(e: CustomEvent) => this.onUnitChosen(e.detail.choice)}
          ></deck-draft-unit-picker>
        </div>
      `;
    }

    return html``;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'lobby-draft': LobbyDraft;
  }
}
