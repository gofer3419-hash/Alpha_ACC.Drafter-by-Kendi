import {randomInt} from './teams';

/**
 * Multiplayer maps of WARNO as the game's map list shows them.
 * The game marks every map with the number of players: [2P] = 1v1,
 * [4P] = 2v2, [6P] = 3v3, [8P] = 4v4. `format` is players per side.
 *
 * The game files do not publish dimensions, so none are listed. To add or fix
 * a map, edit the lists below only.
 */
export interface WarnoMap {
  name: string;
  /** Players per side (1 = [2P], 2 = [4P], 3 = [6P], 4 = [8P]) */
  format: number;
}

const BY_PLAYERS: Record<number, string[]> = {
  2: [
    'Airport Duel',
    'Albion Military Base Duel',
    'Black Forest Duel',
    'Chemical Duel',
    'Cliff Duel',
    'Death Row Duel',
    'Death Row Training',
    'Factory Duel',
    'Geisa Training',
    'Hesse Duel',
    'Isura Duel',
    'Kreide Duel',
    'Mount River Duel',
    'Mount River Training',
    'Ohmen Duel',
    'Schondra Duel',
    'Stoneware Duel',
    'Surrounded Duel',
    'Taler Duel',
    'Two Lakes Duel',
    'Urban Frontlines Duel',
    'Valley Duel',
    'Vertigo Duel',
  ],
  4: [
    'Albion Military Base',
    'Black Forest',
    'Chemical Training',
    'Death Row',
    'Eiche',
    'Hesse',
    'Loop',
    'Mountriver Assault',
    'Ripple',
    'Schondra',
    'Tension',
    'Teufelsmoor',
    'Two Lakes',
    'Two Ways',
    'Urban Frontlines',
    'Vertigo',
  ],
  6: [
    'Airport',
    'Cliff',
    'Cyrus',
    'Danger Hills',
    'Eiche',
    'Factory',
    'Isura',
    'Kreide',
    'Mount River',
    'Railway',
    'Rift',
    'Rocks',
    'Rocks Assault',
    'Stoneware',
    'Surrounded',
    'Taler',
    'Triple Strike',
    'Twin Cities',
    'Two Ways',
    'Urban Frontlines',
    'Valley',
    'Volcano',
  ],
  8: ['Chemical', 'Dark Stream', 'Taler'],
};

export const MAPS: WarnoMap[] = Object.entries(BY_PLAYERS).flatMap(
  ([players, names]) =>
    names.map((name) => ({name, format: Number(players) / 2}))
);

export const FORMATS = [...new Set(MAPS.map((m) => m.format))].sort(
  (a, b) => a - b
);

export const formatLabel = (format: number) => `${format}v${format}`;

/** "2 graczy (1v1)" as in the game's [2P] / [4P] ... markers */
export const categoryLabel = (format: number) =>
  `${format * 2} graczy (${formatLabel(format)})`;

export const mapKey = (map: WarnoMap) => `${map.name}|${map.format}`;

export function mapLabel(map: WarnoMap): string {
  return `${map.name} (${formatLabel(map.format)})`;
}

/**
 * The format a lobby with `perSide` players on the larger side plays:
 * the exact one when there are maps for it, otherwise the biggest one the
 * game has (5 per side has no map of its own and gets the 4v4 maps).
 */
export function formatForTeamSize(perSide: number): number {
  return FORMATS.find((f) => f >= perSide) ?? FORMATS[FORMATS.length - 1];
}

/** Random map out of `pool`, never the one drawn just before when avoidable */
export function drawMap(pool: WarnoMap[], previous?: WarnoMap | null): WarnoMap | null {
  if (pool.length === 0) {
    return null;
  }
  const others = previous
    ? pool.filter((m) => mapKey(m) !== mapKey(previous))
    : pool;
  const from = others.length > 0 ? others : pool;
  return from[randomInt(from.length)];
}

/** Finds a map by the "Name (2v2)" text the lobby stores */
export function findMap(label: string): WarnoMap | undefined {
  return MAPS.find((m) => mapLabel(m) === label);
}
