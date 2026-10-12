import {css, html, LitElement, PropertyValues, TemplateResult} from 'lit';
import {customElement, property, query, queryAll} from 'lit/decorators.js';
import {playSound} from '../../utils/sound';
import {Deck} from '../../classes/deck';
import {PackChoice} from '../../routes/deck-draft';
import {Unit} from '../../types/unit';
import './deck-draft-button';
import './deck-draft-unit-select-card';
import anime from 'animejs/lib/anime.es.js';
// @ts-ignore
import Wz93 from '../../../images/wz93.svg';

@customElement('deck-draft-unit-picker')
export class DeckDraftUnitPicker extends LitElement {
  static get styles() {
    return css`
      :host {
        width: 100%;
        overflow: hidden;
      }
      .instruction {
        margin-bottom: var(--lumo-space-s);
      }

      .instruction > * {
        overflow: hidden; /* Ensures the content is not revealed until the animation */
        white-space: nowrap; /* Keeps the content on a single line */
        margin: 0 auto; /* Gives that scrolling effect as the typing happens */
        letter-spacing: 0.15em; /* Adjust as needed */
        text-align: center;
        font-size: var(--lumo-font-size-xxl);
        font-weight: bold;
        color: var(--lumo-secondary-color);
        padding: var(--lumo-space-s);
        padding-bottom: var(--lumo-space-xs);
      }

      .division {
        animation-fill-mode: forwards;
      }

      /* Cards sit side by side and are stretched to the same height; inside,
         the select card grows and the button stays pinned to the bottom, so
         buttons are on one line whatever the card content. */
      .divisions {
        display: flex;
        align-items: stretch;
        overflow-x: auto;
        justify-content: flex-start;
        justify-content: safe center;
        gap: var(--lumo-space-m);
        width: 100%;
        box-sizing: border-box;
        padding: var(--lumo-space-m);
      }

      img {
        width: 18.75rem;
        overflow: hidden;
      }

      vaadin-icon {
        font-size: 2rem;
      }

      .deck-draft-card {
        display: flex;
        flex-direction: column;
        flex: 0 0 auto;
        box-sizing: border-box;
        width: min(23.75rem, 88vw);
        padding: var(--lumo-space-s);
        background-color: hsla(0, 0%, 11%, 0.92);
        border: 1px solid var(--lumo-contrast-20pct);
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }

      .deck-draft-card:hover {
        border-color: var(--acc-burgundy);
        box-shadow: 0 0 18px var(--acc-burgundy-glow);
      }

      /* Team lobby: the card position everybody takes this round gets a
         thick neon frame, the other cards fade back */
      .deck-draft-card.picked {
        border: 3px solid var(--lumo-primary-text-color);
        box-shadow: 0 0 0 2px var(--lumo-primary-text-color),
          0 0 26px 6px var(--acc-burgundy-glow),
          0 0 60px 12px var(--acc-burgundy-glow);
        transform: translateY(-4px);
        transition: border-color 0.2s ease, box-shadow 0.2s ease,
          transform 0.2s ease;
      }

      .deck-draft-card.dimmed {
        /* !important: the card animation leaves an inline opacity */
        opacity: 0.25 !important;
        transition: opacity 0.3s ease;
      }

      /* Team lobby: while the round is applied the cards hide behind a
         wz.93 curtain with the emblem of this player's division */
      .stage {
        position: relative;
      }

      .curtain {
        position: absolute;
        inset: 0;
        z-index: 5;
        display: flex;
        align-items: center;
        justify-content: center;
        background-size: cover;
        background-position: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.35s ease;
      }

      .curtain::before {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(
          ellipse at center,
          rgba(0, 0, 0, 0.15) 0%,
          rgba(0, 0, 0, 0.55) 70%,
          rgba(0, 0, 0, 0.75) 100%
        );
      }

      .curtain.on {
        opacity: 1;
        pointer-events: auto;
      }

      .curtain img.emblem {
        position: relative;
        width: auto;
        height: min(14rem, 60%);
        max-width: 60%;
        object-fit: contain;
        filter: drop-shadow(0 0.4rem 1rem rgba(0, 0, 0, 0.8));
        transform: scale(0.92);
        transition: transform 0.6s ease;
      }

      .curtain.on img.emblem {
        transform: scale(1);
      }

      deck-draft-button {
        max-width: 25rem;
      }

      vaadin-button {
        flex: none;
        margin: var(--lumo-space-s) 0 0;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
    `;
  }

  @queryAll('.division')
  divs?: HTMLDivElement[];

  @query('.divisions')
  row?: HTMLElement;

  private rowObserver?: ResizeObserver;
  private minRowHeight = 0;

  firstUpdated() {
    this.playAnimation();
    this.keepRowHeight();
  }

  disconnectedCallback() {
    this.rowObserver?.disconnect();
    super.disconnectedCallback();
  }

  /**
   * The row of cards may only grow during a draft. If one round has taller
   * cards, the next rounds keep that height, so buttons and icons stay put
   * instead of jumping up and down with every pick.
   */
  private keepRowHeight() {
    if (!this.row || typeof ResizeObserver === 'undefined') {
      return;
    }
    this.rowObserver = new ResizeObserver(() => {
      if (!this.row) {
        return;
      }
      const height = this.row.offsetHeight;
      if (height > this.minRowHeight) {
        this.minRowHeight = height;
        this.row.style.minHeight = `${height}px`;
      }
    });
    this.rowObserver.observe(this.row);
  }

  playAnimation() {
    anime({
      targets: this.divs,
      translateX: [-50, 0],
      duration: 1000,
      delay: anime.stagger(250),
      opacity: [0, 1],
      update: (anim) => {
        const sound = this.shadowRoot?.getElementById(
          'sound'
        ) as HTMLAudioElement;
        sound.volume = 0.1;

        // 3 sounds should be played
        // 1. When the first card is shown
        if (anim.progress > 10 && anim.progress < 11) {
          playSound(sound);
        }

        // 2. When the second card is shown
        if (anim.progress > 35 && anim.progress < 36) {
          playSound(sound);
        }

        // 3. When the third card is shown
        if (anim.progress > 60 && anim.progress < 61) {
          playSound(sound);
        }
      },
    });
  }

  updated(changedProperties: PropertyValues<this>) {
    // only need to check changed properties for an expensive computation.
    if (
      this.animateOnEnable &&
      changedProperties.has('disable') &&
      this.disable === false
    ) {
      this.playAnimation();
    }
    // Team lobby: the new cards slide in once the curtain is lifted
    if (
      changedProperties.has('revealKey') &&
      changedProperties.get('revealKey') !== undefined
    ) {
      this.playAnimation();
    }
  }

  @property({type: Array})
  choices: PackChoice[] = [];

  @property({type: Array})
  units: Unit[] = [];

  @property()
  disable = false;

  /** Team lobby: number of the round (informative only) */
  @property({type: Number})
  round?: number;

  /** Team lobby: a change slides the (new) cards in */
  @property({type: Number})
  revealKey?: number;

  /** Team lobby: show the wz.93 curtain over the cards */
  @property({type: Boolean})
  curtain = false;

  /** Team lobby: division whose emblem sits on the curtain */
  @property()
  emblemDivision = '';

  /** Team lobby: card (0, 1, 2) taken in this round, -1 for none */
  @property({type: Number})
  highlight = -1;

  /** Solo draft: the cards slide in again when the buttons get enabled */
  @property({type: Boolean})
  animateOnEnable = true;

  @property()
  buttonLabel = 'Dodaj';

  @property()
  deck?: Deck;

  choosePack(choice: number) {
    this.dispatchEvent(
      new CustomEvent('unit-chosen', {
        detail: {
          choice,
        },
      })
    );
  }

  render(): TemplateResult {
    return html`
      <div class="instruction"><h2>WYBIERZ JEDNOSTKĘ</h2></div>

      <audio id="sound">
        <source src="/draw.wav" type="audio/wav" />
        <!-- Add additional <source> elements for other audio formats (e.g., OGG, WAV) -->
      </audio>
      <div class="stage">
        <div class="divisions">
          ${this.choices.map((choice, index) =>
            this.renderUnitButton(choice, index)
          )}
        </div>
        <div
          class="curtain ${this.curtain ? 'on' : ''}"
          style="background-image: url(${Wz93})"
          aria-hidden=${this.curtain ? 'false' : 'true'}
        >
          ${this.emblemDivision
            ? html`<img
                class="emblem"
                src="/divisions/${this.emblemDivision}.png"
                alt=""
                @error=${(e: Event) =>
                  ((e.target as HTMLImageElement).style.display = 'none')}
              />`
            : ''}
        </div>
      </div>
    `;
  }

  renderUnitButton(choice: PackChoice, index: number) {
    const unit = this.units.find(
      (unit) => unit.descriptorName === choice.unit
    ) as Unit;
    const transport = this.units.find(
      (unit) => unit.descriptorName === choice.transport
    );

    const pack = this.deck?.getPackForUnitDescriptor(unit.descriptorName);

    return html`
      <div 
        class="deck-draft-card division division-${index + 1} ${this.highlight === index ? 'picked' : ''} ${this.highlight >= 0 && this.highlight !== index ? 'dimmed' : ''}"
        @animationend=${() => {
          const sound = this.shadowRoot?.getElementById(
            'sound'
          ) as HTMLAudioElement;
          sound.volume = 0.1;
          playSound(sound);
        }}
      >

        <deck-draft-unit-select-card
          .pack=${pack}
          .transport=${transport}
          .deck=${this.deck}
          .selectedVeterancy=${choice.veterancy}
        >
        </deck-draft-unit-select-card>
        <vaadin-button
          theme="primary large"
          ?disabled=${this.disable}
          @click=${() => this.choosePack(index)}
        >
          ${this.buttonLabel}
        </vaadin-button>
      </div>
    `;
  }

  generateSrc(unit: Unit) {
    const descriptorName = unit?.descriptorName || '';
    return `/images/units/${descriptorName}.webp`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'deck-draft-unit-picker': DeckDraftUnitPicker;
  }
}

/*
        ${this.disable
          ? html`<deck-draft-button ?disabled=${true}></deck-draft-button
              ><deck-draft-button ?disabled=${true}></deck-draft-button
              ><deck-draft-button ?disabled=${true}></deck-draft-button>`
          : html`${this.choices.map((choice, index) =>
              this.renderUnitButton(choice, index)
            )}`}       
        */
