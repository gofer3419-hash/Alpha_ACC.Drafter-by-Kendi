export const MAX_PLAYERS_PER_TEAM = 5;

export interface Teams {
  blue: string[];
  red: string[];
}

/** One player per line; blank lines and duplicates are ignored. */
export function parsePlayerNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line.trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

/**
 * Random integer in [0, max) from the browser's cryptographic generator,
 * without modulo bias. Falls back to Math.random where crypto is missing.
 */
export function randomInt(max: number): number {
  const cryptoApi = (globalThis as {crypto?: Crypto}).crypto;
  if (!cryptoApi?.getRandomValues) {
    return Math.floor(Math.random() * max);
  }
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    cryptoApi.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}

/** Fisher-Yates shuffle (returns a new array). */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Who plays with whom, ignoring which colour each team got. */
function groupingKey(teams: Teams): string {
  const blue = [...teams.blue].sort().join('\u0000');
  const red = [...teams.red].sort().join('\u0000');
  return [blue, red].sort().join('\u0001');
}

function splitOnce(names: string[]): Teams {
  const shuffled = shuffle(names);
  let blueSize = Math.floor(shuffled.length / 2);
  if (shuffled.length % 2 === 1 && randomInt(2) === 1) {
    blueSize += 1;
  }
  return {
    blue: shuffled.slice(0, blueSize),
    red: shuffled.slice(blueSize),
  };
}

/**
 * Split players randomly into two teams whose sizes differ by at most one.
 * With an odd number of players the extra player goes to a random side.
 *
 * When `previous` is given (a re-draw) the result always pairs the players
 * differently from it, if any other pairing exists (with 2 players only the
 * colours can change).
 */
export function shuffleTeams(names: string[], previous?: Teams | null): Teams {
  if (names.length > MAX_PLAYERS_PER_TEAM * 2) {
    throw new Error(`At most ${MAX_PLAYERS_PER_TEAM * 2} players`);
  }
  let teams = splitOnce(names);

  const samePlayers =
    previous &&
    [...previous.blue, ...previous.red].sort().join('\u0000') ===
      [...names].sort().join('\u0000');
  if (previous && samePlayers && names.length > 2) {
    const previousKey = groupingKey(previous);
    for (let attempt = 0; attempt < 100 && groupingKey(teams) === previousKey; attempt++) {
      teams = splitOnce(names);
    }
  }
  return teams;
}
