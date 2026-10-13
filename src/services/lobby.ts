/**
 * Team lobby: nick, the room and its players, teams and the draft queue.
 *
 * Talks to server/server.js (see there for the API). The server only knows
 * who is in the room, the teams, whose turn it is and which card position was
 * taken. What is behind the cards stays in each player's browser.
 */
import {Dataset} from '../types/dataset';

export type LobbyPhase = 'waiting' | 'teams' | 'drafting' | 'finished';
export type TeamColor = 'blue' | 'red';

export interface LobbyMember {
  pid: string;
  nick: string;
  connected: boolean;
  team: TeamColor | null;
  host: boolean;
}

export interface RoundPick {
  round: number;
  /** 0 = left card, 1 = middle, 2 = right */
  slot: number;
  /** pid of the player whose turn it was */
  by: string;
}

export interface DraftView {
  stage: 'division' | 'units' | 'finished';
  /** pids in turn order */
  order: string[];
  round: number;
  /** pid of the player on turn, or null */
  current: string | null;
  /** slot chosen in this round that is not applied by everybody yet */
  pending: RoundPick | null;
  log: RoundPick[];
  /** pids that chose their division */
  ready: string[];
  /** pids whose deck is full */
  done: string[];
  /** pid -> last round applied by that player */
  applied: Record<string, number>;
  /** Blind division mode: each player picks a position for the next one */
  blind?: boolean;
  /** pids that already picked a position for their successor */
  divPicked?: string[];
  /** pid -> position (0-2) that was picked FOR that player */
  divAssigned?: Record<string, number>;
}

export interface LobbySnapshot {
  code: string;
  phase: LobbyPhase;
  dataset: Dataset;
  /** Map drawn by the host, e.g. "Mount River (3v3)" */
  map?: string | null;
  /** Category chosen by the host: players per side (1 = 1v1 ... 4 = 4v4) */
  mapFormat?: number | null;
  /** How divisions are picked: own choice, or blind (picked by the previous player) */
  divMode?: 'self' | 'blind';
  hostPid: string;
  now: number;
  members: LobbyMember[];
  draft: DraftView | null;
  /** pid -> deck code of the player's teammates; filled once the draft is over */
  decks?: Record<string, string>;
}

export const NICK_PATTERN = /^[\p{L}\p{N} _.\-]{2,20}$/u;
export const NICK_HELP = 'Nick: 2-20 znaków (litery, cyfry, spacja, _ . -).';
export const SLOT_NAMES = ['LEWA', 'ŚRODKOWA', 'PRAWA'];

const NICK_KEY = 'acc.nick';
const CID_KEY = 'acc.cid';
const LOBBY_KEY = 'acc.lobby';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch (error) {
    console.warn(error);
  }
}

/** Secret id of this browser (works on plain http too, unlike randomUUID) */
function makeClientId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

class LobbyService extends EventTarget {
  snapshot: LobbySnapshot | null = null;
  /** Public id of this player inside the lobby */
  pid = '';
  /** false while the live connection to the server is down */
  online = true;
  /** true once the start-up attempt (re-entering a lobby) is over */
  started = false;
  /** Last message for the user, e.g. "removed from the lobby" */
  notice = '';

  private cid = readStorage(CID_KEY) || makeClientId();
  private source?: EventSource;
  private startPromise?: Promise<void>;

  constructor() {
    super();
    writeStorage(CID_KEY, this.cid);
  }

  get savedNick(): string {
    return readStorage(NICK_KEY) ?? '';
  }

  get me(): LobbyMember | undefined {
    return this.snapshot?.members.find((m) => m.pid === this.pid);
  }

  get isHost(): boolean {
    return !!this.snapshot && this.snapshot.hostPid === this.pid;
  }

  /** Team of this player when teams are set: NATO = blue, PACT = red */
  get side(): 'NATO' | 'PACT' | null {
    const team = this.me?.team;
    return team === 'blue' ? 'NATO' : team === 'red' ? 'PACT' : null;
  }

  /** Server clock, so nothing depends on the local clock being right */
  serverNow(): number {
    return Date.now() + this.clockOffset;
  }
  private clockOffset = 0;

  /** Call on page load: re-enters the lobby this browser was in */
  start(): Promise<void> {
    if (!this.startPromise) {
      this.startPromise = this.restore();
    }
    return this.startPromise;
  }

  private async restore() {
    const saved = readStorage(LOBBY_KEY);
    if (saved) {
      try {
        const {code, nick} = JSON.parse(saved) as {code: string; nick: string};
        const error = await this.enter('join', {code, nick});
        if (error) {
          writeStorage(LOBBY_KEY, null);
        }
      } catch (error) {
        writeStorage(LOBBY_KEY, null);
      }
    }
    this.started = true;
    this.emit();
  }

  /** @returns an error message, or null when the lobby was created */
  create(rawNick: string, dataset: Dataset): Promise<string | null> {
    return this.enter('create', {nick: rawNick, dataset});
  }

  /** @returns an error message, or null when joined */
  join(rawCode: string, rawNick: string): Promise<string | null> {
    return this.enter('join', {code: rawCode.trim().toUpperCase(), nick: rawNick});
  }

  private async enter(
    action: 'create' | 'join',
    body: Record<string, unknown>
  ): Promise<string | null> {
    const nick = String(body.nick ?? '').trim().replace(/\s+/g, ' ');
    if (!NICK_PATTERN.test(nick)) {
      return NICK_HELP;
    }
    const result = await this.post(action, {...body, nick});
    if (result.error) {
      return result.error;
    }
    this.pid = result.data.pid as string;
    this.notice = '';
    writeStorage(NICK_KEY, nick);
    writeStorage(LOBBY_KEY, JSON.stringify({code: result.data.code, nick}));
    this.connect();
    return null;
  }

  /** Leaves the lobby (a host leaving hands it to the next player) */
  async leave() {
    await this.post('leave', {});
    this.forget();
  }

  /** Any other action of the lobby (see server/server.js) */
  async act(action: string, body: Record<string, unknown> = {}): Promise<string | null> {
    const result = await this.post(action, body);
    return result.error ?? null;
  }

  private forget(notice = '') {
    this.source?.close();
    this.source = undefined;
    this.snapshot = null;
    this.pid = '';
    this.notice = notice;
    writeStorage(LOBBY_KEY, null);
    this.emit();
  }

  private async post(
    action: string,
    body: Record<string, unknown>
  ): Promise<{error?: string; data: Record<string, unknown>}> {
    try {
      const response = await fetch(`/api/lobby/${action}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({cid: this.cid, ...body}),
      });
      if (!(response.headers.get('content-type') || '').includes('json')) {
        return {
          error:
            'Brak serwera lobby. Uruchom stronę przez start_draft.bat (npm start).',
          data: {},
        };
      }
      const data = await response.json();
      if (!response.ok) {
        return {error: data.error || 'Coś poszło nie tak.', data};
      }
      return {data};
    } catch (error) {
      return {error: 'Nie można połączyć się z serwerem.', data: {}};
    }
  }

  private connect() {
    if (this.source) {
      return;
    }
    const source = new EventSource(
      `/api/lobby/events?cid=${encodeURIComponent(this.cid)}`
    );
    this.source = source;
    source.onopen = () => {
      this.online = true;
      this.emit();
    };
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.gone) {
          this.forget('Nie ma Cię już w tym lobby.');
          return;
        }
        const snapshot = data as LobbySnapshot;
        this.clockOffset = snapshot.now - Date.now();
        if (!snapshot.members.some((m) => m.pid === this.pid)) {
          this.forget('Host usunął Cię z lobby.');
          return;
        }
        this.snapshot = snapshot;
        this.emit();
      } catch (error) {
        console.warn(error);
      }
    };
    source.onerror = () => {
      this.online = false;
      this.emit();
    };
  }

  private emit() {
    this.dispatchEvent(new Event('change'));
  }
}

export const lobby = new LobbyService();
