import {TemplateResult, html} from 'lit';
import '@vaadin/icon';

const veterancies: string[] = ['recruit', 'trained', 'veteran', 'elite'];
const veterancyNames: string[] = ['Recruit', 'Trained', 'Veteran', 'Elite'];

/** One colour per level, rising from grey to the accent, so ranks read at a glance. */
const veterancyColors: string[] = [
  'hsl(0, 0%, 72%)',
  'hsl(42, 55%, 66%)',
  'hsl(32, 85%, 60%)',
  'hsl(348, 100%, 66%)',
];

export function getVeterancyColor(veterancy: number): string {
  return veterancyColors[veterancy] ?? veterancyColors[0];
}

export function getIconForVeterancy(veterancy: number): TemplateResult {
  const elementId = `veterancy-${veterancy}`;
  return html` <vaadin-icon
      id="${elementId}"
      style="transform: rotate(180deg); color: ${getVeterancyColor(veterancy)}"
      icon="waryes:${veterancies[veterancy]}"
    ></vaadin-icon
    ><vaadin-tooltip for=${elementId} text=${veterancyNames[veterancy]} position="top"></vaadin-tooltip>`;
}

export function getVeterancyName(veterancy: number): string {
  return veterancyNames[veterancy];
}

/** Icon + name in the level colour, for places with room for text. */
export function renderVeterancyBadge(veterancy: number): TemplateResult {
  const color = getVeterancyColor(veterancy);
  return html`<span
    style="display: inline-flex; align-items: center; gap: 0.35em; color: ${color}"
    ><vaadin-icon
      style="transform: rotate(180deg); width: 1.1em; height: 1.1em"
      icon="waryes:${veterancies[veterancy]}"
    ></vaadin-icon
    >${veterancyNames[veterancy]}</span
  >`;
}
