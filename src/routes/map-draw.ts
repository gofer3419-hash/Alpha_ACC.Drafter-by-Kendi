import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import '@vaadin/button';
import {
  categoryLabel,
  drawMap,
  FORMATS,
  mapKey,
  mapLabel,
  MAPS,
  WarnoMap,
} from '../utils/maps';
import {applySideTheme} from '../utils/theme';

const STORAGE_KEY = 'acc.mapDraw';
const SPIN_MS = 1100;
const SPIN_STEP_MS = 80;

interface Saved {
  /** Chosen categories (players per side); empty = all */
  formats: number[];
  excluded: string[];
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<Saved>;
      return {
        formats: (data.formats ?? []).filter((f) => FORMATS.includes(f)),
        excluded: data.excluded ?? [],
      };
    }
  } catch (error) {
    console.warn(error);
  }
  return {formats: [], excluded: []};
}

/** Draws a WARNO map: pick the format (1v1 ... 10v10), tick the maps, draw. */
@customElement('map-draw-route')
export class MapDrawRoute extends LitElement {
  static get styles() {
    return css`
      :host {
        display: block;
        max-width: 48rem;
        margin: 0 auto;
        padding: var(--lumo-space-l) var(--lumo-space-m);
      }

      .panel {
        box-sizing: border-box;
        margin-bottom: var(--lumo-space-m);
        padding: var(--lumo-space-l);
        background-color: hsla(0, 0%, 11%, 0.92);
        border: 1px solid var(--lumo-contrast-20pct);
        border-top: 3px solid var(--acc-burgundy);
      }

      h2 {
        margin: 0 0 var(--lumo-space-s);
        letter-spacing: 0.12em;
        color: var(--lumo-secondary-color);
      }

      .formats {
        display: flex;
        flex-wrap: wrap;
        gap: var(--lumo-space-s);
      }

      .formats button {
        padding: var(--lumo-space-xs) var(--lumo-space-m);
        font: inherit;
        font-weight: 700;
        color: var(--lumo-body-text-color);
        background-color: var(--lumo-contrast-5pct);
        border: 1px solid var(--lumo-contrast-30pct);
        cursor: pointer;
      }

      .formats button.active {
        background-color: var(--lumo-primary-color-50pct);
        border-color: var(--lumo-primary-color);
      }

      .result {
        text-align: center;
        padding: var(--lumo-space-l) 0;
      }

      .result .name {
        font-size: var(--lumo-font-size-xxxl, 2.5rem);
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--lumo-primary-text-color);
      }

      .result .name.spin {
        opacity: 0.6;
      }

      .result .meta {
        margin-top: var(--lumo-space-xs);
        color: var(--lumo-secondary-text-color);
      }

      .placeholder {
        color: var(--lumo-secondary-text-color);
      }

      .group {
        margin-top: var(--lumo-space-m);
      }

      .group h3 {
        margin: 0 0 var(--lumo-space-xs);
        font-size: var(--lumo-font-size-m);
        color: var(--lumo-secondary-color);
      }

      label.map {
        display: flex;
        align-items: center;
        gap: var(--lumo-space-s);
        padding: 2px 0;
        cursor: pointer;
      }

      label.map input {
        width: 1.125rem;
        height: 1.125rem;
        accent-color: var(--lumo-primary-color);
      }

      .tag {
        font-size: var(--lumo-font-size-xs);
        color: var(--lumo-secondary-text-color);
      }

      .hint {
        font-size: var(--lumo-font-size-s);
        color: var(--lumo-secondary-text-color);
      }

      ol.history {
        margin: 0;
        padding-left: 1.4em;
      }
    `;
  }

  private saved = load();

  /** Chosen categories (players per side); empty = every category */
  @state()
  private formats = new Set<number>(this.saved.formats);

  @state()
  private excluded = new Set<string>(this.saved.excluded);

  @state()
  private current: WarnoMap | null = null;

  @state()
  private spinning = false;

  @state()
  private history: WarnoMap[] = [];

  connectedCallback() {
    super.connectedCallback();
    applySideTheme(null);
  }

  private persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({formats: [...this.formats], excluded: [...this.excluded]})
      );
    } catch (error) {
      console.warn(error);
    }
  }

  private get pool(): WarnoMap[] {
    return MAPS.filter(
      (m) =>
        this.inCategory(m.format) &&
        !this.excluded.has(mapKey(m))
    );
  }

  private inCategory(format: number): boolean {
    return this.formats.size === 0 || this.formats.has(format);
  }

  /** Category buttons toggle; with none chosen every category is drawn */
  private toggleFormat(format: number) {
    const next = new Set(this.formats);
    if (next.has(format)) {
      next.delete(format);
    } else {
      next.add(format);
    }
    this.formats = next;
    this.persist();
  }

  private allFormats() {
    this.formats = new Set();
    this.persist();
  }

  private toggle(map: WarnoMap, included: boolean) {
    const next = new Set(this.excluded);
    if (included) {
      next.delete(mapKey(map));
    } else {
      next.add(mapKey(map));
    }
    this.excluded = next;
    this.persist();
  }

  private draw() {
    const pool = this.pool;
    const result = drawMap(pool, this.current);
    if (!result || this.spinning) {
      return;
    }
    // Short "slot machine": flicker through the pool, then show the result
    this.spinning = true;
    const started = Date.now();
    const tick = () => {
      if (Date.now() - started >= SPIN_MS) {
        this.current = result;
        this.history = [result, ...this.history].slice(0, 8);
        this.spinning = false;
        return;
      }
      this.current = pool[Math.floor(Math.random() * pool.length)];
      setTimeout(tick, SPIN_STEP_MS);
    };
    tick();
  }

  private renderResult(): TemplateResult {
    const map = this.current;
    if (!map) {
      return html`<div class="result placeholder">Kliknij „Losuj mapę”.</div>`;
    }
    return html`
      <div class="result">
        <div class="name ${this.spinning ? 'spin' : ''}">${map.name}</div>
        <div class="meta">
          ${categoryLabel(map.format)}
        </div>
      </div>
    `;
  }

  render(): TemplateResult {
    const pool = this.pool;
    return html`
      <div class="panel">
        <h2>NA ILE GRACZY</h2>
        <div class="formats">
          <button
            class=${this.formats.size === 0 ? 'active' : ''}
            @click=${() => this.allFormats()}
          >
            Wszystkie
          </button>
          ${FORMATS.map(
            (f) => html`<button
              class=${this.formats.has(f) ? 'active' : ''}
              @click=${() => this.toggleFormat(f)}
            >
              ${categoryLabel(f)}
            </button>`
          )}
        </div>
        <div class="hint" style="margin-top: var(--lumo-space-s)">
          Możesz zaznaczyć kilka kategorii naraz.
        </div>
      </div>

      <div class="panel">
        ${this.renderResult()}
        <vaadin-button
          theme="primary large"
          style="width: 100%"
          ?disabled=${pool.length === 0 || this.spinning}
          @click=${() => this.draw()}
        >
          Losuj mapę
        </vaadin-button>
        <div class="hint" style="margin-top: var(--lumo-space-s)">
          ${pool.length === 0
            ? 'Brak map do losowania. Zaznacz co najmniej jedną.'
            : `Map w puli: ${pool.length}. Ta sama mapa nie wypadnie dwa razy pod rząd.`}
        </div>
      </div>

      <div class="panel">
        <h2>PULA MAP</h2>
        ${FORMATS.filter((f) => this.inCategory(f)).map(
          (f) => html`
            <div class="group">
              <h3>${categoryLabel(f)}</h3>
              ${MAPS.filter((m) => m.format === f).map(
                (m) => html`
                  <label class="map">
                    <input
                      type="checkbox"
                      .checked=${!this.excluded.has(mapKey(m))}
                      @change=${(e: Event) =>
                        this.toggle(m, (e.target as HTMLInputElement).checked)}
                    />
                    <span>${m.name}</span>
                  </label>
                `
              )}
            </div>
          `
        )}
        <p class="hint">
          Lista map z menu gry (oznaczenia [2P], [4P], [6P], [8P]).
        </p>
      </div>

      ${this.history.length > 1
        ? html`<div class="panel">
            <h2>OSTATNIE LOSOWANIA</h2>
            <ol class="history">
              ${this.history.map((m) => html`<li>${mapLabel(m)}</li>`)}
            </ol>
          </div>`
        : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'map-draw-route': MapDrawRoute;
  }
}
