import {css, html, LitElement, TemplateResult} from 'lit';
import {
  customElement,
  property,
  state,
  queryAll,
  query,
} from 'lit/decorators.js';
import {playSound} from '../../utils/sound';
import {Division} from '../../types/deck-builder';
import './deck-draft-button';
import anime from 'animejs/lib/anime.es.js';

@customElement('deck-draft-division-picker')
export class DeckDraftDivisionPicker extends LitElement {
  static get styles() {
    return css`
      :host {
        width: 100%;
      }

      division-flag {
        width: 55%;
        aspect-ratio: 1 / 1;
        margin: var(--lumo-space-m) 0 var(--lumo-space-s);
      }

      h2 {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        width: 100%;
        text-align: center;
      }

      .instruction {
        margin-bottom: var(--lumo-space-l);
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
        padding: var(--lumo-space-xs);
      }

      .divisions {
        display: flex;
        flex-wrap: wrap;
        align-items: stretch;
        justify-content: center;
        gap: var(--lumo-space-m);
        position: relative;
        padding: 0 var(--lumo-space-m) var(--lumo-space-m);
      }

      /* Equal cards: the emblem area grows, the button sits at the bottom */
      .division {
        animation-fill-mode: forwards;
        flex: 1 1 17.5rem;
        max-width: 25rem;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        padding: var(--lumo-space-m);
        background-color: hsla(0, 0%, 11%, 0.92);
        border: 1px solid var(--lumo-contrast-20pct);
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }

      .division:hover {
        border-color: var(--acc-burgundy);
        box-shadow: 0 0 18px var(--acc-burgundy-glow);
      }

      /* Reveal (blind mode): the division chosen for the player is lit, the
         other two stay visible but greyed out. Filter instead of opacity,
         because the entry animation sets opacity inline. */
      .division.picked {
        position: relative;
        border-color: var(--lumo-primary-text-color);
        box-shadow: 0 0 2rem var(--acc-burgundy-glow);
        /* Individual properties: anime.js writes the inline transform of the
           cards, which would cancel a transform set here */
        translate: 0 -0.25rem;
        scale: 1.03;
        z-index: 1;
      }

      .division.dimmed {
        filter: grayscale(1) brightness(0.55);
      }

      .division.picked,
      .division.dimmed {
        transition: filter 0.6s ease, translate 0.6s ease, scale 0.6s ease,
          border-color 0.6s ease,
          box-shadow 0.6s ease;
      }

      .picked-badge {
        align-self: center;
        margin-top: var(--lumo-space-s);
        padding: var(--lumo-space-xs) var(--lumo-space-m);
        font-weight: 700;
        letter-spacing: 0.12em;
        color: var(--lumo-primary-contrast-color);
        background-color: var(--lumo-primary-color);
      }

      .division vaadin-button {
        flex: none;
        margin-top: var(--lumo-space-s);
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .deck-draft-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1 1 auto;
      }
    `;
  }

  @queryAll('.division')
  divs?: HTMLDivElement[];

  @query('.division')
  div?: HTMLDivElement;

  @query('.instruction')
  instructionDiv?: HTMLDivElement;

  firstUpdated() {
    anime({
      targets: this.divs,
      translateX: [-100, 0],
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

  @property({type: Array})
  choices: string[] = [];

  @state()
  divisions: Division[] = [];

  @property()
  disable = false;

  /** Reveal: index (0-2) of the division that was chosen, -1 for none */
  @property({type: Number})
  highlight = -1;

  /** Heading above the cards */
  @property()
  heading = 'WYBIERZ DYWIZJĘ';

  chooseDivision(choice: number) {
    this.disable = true;

    this.playAnimation(choice);

    // delay by 250 ms

    setTimeout(() => {
      this.dispatchEvent(
        new CustomEvent('division-chosen', {
          detail: {
            choice,
          },
        })
      );
    }, 1500);
    
  }

  playAnimation(index: number) {
    // get divisions and play animation
    const divisions = this.shadowRoot?.querySelectorAll(
      '.division'
    ) as NodeListOf<HTMLDivElement>;

    // query the divisions that werent clicked
    const possibleIndexes = [0, 1, 2];
    const indexes = possibleIndexes.filter((i) => i !== index);
    // get the divisions that were not clicked
    const otherDivisions = indexes.map((i) => divisions[i]);

    // get the division that was clicked
    const division = divisions[index];
    //const directions = [1, 0, -1];

    anime({
      targets: division,
      duration: 1000,
      translateX: '0%', // Center horizontally
      translateY: '0%',
      scale: {value: 1.5},
      rotate: '1turn',
    });

    anime({
      targets: otherDivisions,
      duration: 1000,
      opacity: 0,
    });

    anime({
      targets: this.instructionDiv,
      duration: 1000,
      opacity: 0,
    });
  }

  render(): TemplateResult {
    return html`
      <div class="instruction">
        <h2>${this.heading}</h2>
      </div>
      <audio id="sound">
        <source src="/draw.wav" type="audio/wav" />
        <!-- Add additional <source> elements for other audio formats (e.g., OGG, WAV) -->
      </audio>
      <div class="divisions">
        ${this.choices.map(
          (division, index) => html`
            ${this.renderDivisionButton(division, index)}
          `
        )}
      </div>
    `;
  }

  renderDivisionButton(
    divisionDescriptor: string,
    index: number
  ): TemplateResult {
    const division = this.divisions.find(
      (div) => div.descriptor === divisionDescriptor
    );

    return html`
      <div
        class="division division-${index + 1} ${this.highlight === index
          ? 'picked'
          : ''} ${this.highlight >= 0 && this.highlight !== index
          ? 'dimmed'
          : ''}"
      >
        <div class="deck-draft-card">
          <division-flag .division=${division}></division-flag>
          <h2>${division?.name}</h2>
        </div>
        ${this.highlight === index
          ? html`<div class="picked-badge">TWOJA DYWIZJA</div>`
          : ''}

        ${this.disable
          ? html``
          : html`<vaadin-button
              ?disabled=${this.disable}
              theme="primary large"
              @click=${() => this.chooseDivision(index)}
            >
              Wybierz
            </vaadin-button>`}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'deck-draft-division-picker': DeckDraftDivisionPicker;
  }
}
