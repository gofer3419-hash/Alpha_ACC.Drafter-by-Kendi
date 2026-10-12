/**
 * ACC.DRAFTER server: serves the built site (dist/) and runs the team lobbies.
 *
 * What the server knows: who is in a lobby, the teams, whose turn it is and
 * which card position (left / middle / right = 0 / 1 / 2) was chosen. It never
 * sees units or divisions while the draft runs: every player's draft runs in
 * his own browser, so every choice stays private to that player. Only when a
 * player's deck is full does his browser send the finished deck code; it is
 * shown to his teammates (never the other team) once everybody is done.
 *
 * API (all POST bodies are JSON and carry the player's secret `cid`):
 *   POST /api/lobby/create {cid, nick, dataset}
 *   POST /api/lobby/join   {cid, nick, code}
 *   POST /api/lobby/leave  {cid}
 *   POST /api/lobby/<action> {cid, ...}
 *        dataset teams back start kick takehost ready pick ack skip share
 *   GET  /api/lobby/events?cid=...   live stream (Server-Sent Events)
 *   GET  /api/log                    last 300 events
 *
 * Every event is also appended to logs/draft-log.ndjson.
 *
 * Usage: node server/server.js [--port 8080] [--dir dist]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PORT = Number(arg('port', process.env.PORT || 8080));
const ROOT = path.resolve(arg('dir', path.join(__dirname, '..', 'dist')));
const LOG_DIR = path.resolve(arg('logs', path.join(__dirname, '..', 'logs')));
const LOG_FILE = path.join(LOG_DIR, 'draft-log.ndjson');
/** A missing host can be replaced after this long (s) */
const HOST_GRACE_MS = Number(arg('host-grace', 30)) * 1000;

const NICK_RE = /^[\p{L}\p{N} _.\-]{2,20}$/u;
const DATASETS = new Set(['wif', 'vanilla']);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 10;
const MAX_PER_TEAM = 5;
const MAX_BODY = 8192;
const MAX_LOG = 300;
const LOBBY_TTL_MS = 6 * 60 * 60 * 1000;

/** code -> lobby */
const lobbies = new Map();
/** cid (secret of a browser) -> lobby code */
const lobbyOf = new Map();
/** cid -> Set of open event streams */
const streams = new Map();
const recentLog = [];

const clip = (value, max = 60) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function randomId() {
  return Math.random().toString(16).slice(2, 8);
}

function appendLog(entry) {
  entry.t = Date.now();
  recentLog.push(entry);
  if (recentLog.length > MAX_LOG) recentLog.shift();
  try {
    fs.mkdirSync(LOG_DIR, {recursive: true});
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('Log write failed:', err.message);
  }
}

const isConnected = (cid) => (streams.get(cid)?.size ?? 0) > 0;

function makeCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
    if (!lobbies.has(code)) return code;
  }
}

/* ------------------------------------------------------------------ */
/* Snapshot: everything every player of a lobby may see (no secrets)   */
/* ------------------------------------------------------------------ */

function snapshot(lobby, viewerCid) {
  const d = lobby.draft;
  // Deck codes are shared only after the whole draft is over, and only with
  // the owner's team (a player's deck never goes to the other side).
  const viewer = lobby.members.get(viewerCid);
  const decks = {};
  if (lobby.phase === 'finished' && viewer && viewer.team) {
    for (const m of lobby.members.values()) {
      if (m.team === viewer.team && m.deckCode) decks[m.pid] = m.deckCode;
    }
  }
  return {
    decks,
    code: lobby.code,
    phase: lobby.phase,
    dataset: lobby.dataset,
    hostPid: lobby.members.get(lobby.hostCid)?.pid ?? '',
    now: Date.now(),
    members: [...lobby.members.entries()]
      .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
      .map(([cid, m]) => ({
        pid: m.pid,
        nick: m.nick,
        connected: isConnected(cid),
        team: m.team,
        host: cid === lobby.hostCid,
      })),
    draft: d
      ? {
          stage: d.stage,
          order: d.order,
          round: d.round,
          current: d.current,
          pending: d.pending,
          log: d.log,
          ready: [...d.ready],
          done: [...d.done],
          applied: Object.fromEntries(d.applied),
        }
      : null,
  };
}

function broadcast(lobby) {
  for (const cid of lobby.members.keys()) {
    const set = streams.get(cid);
    if (!set || set.size === 0) continue;
    const data = `data: ${JSON.stringify(snapshot(lobby, cid))}\n\n`;
    for (const res of set) res.write(data);
  }
}

/* ------------------------------------------------------------------ */
/* Draft turns                                                         */
/* ------------------------------------------------------------------ */

const pidOf = (lobby, cid) => lobby.members.get(cid)?.pid;
const cidOfPid = (lobby, pid) =>
  [...lobby.members.entries()].find(([, m]) => m.pid === pid)?.[0];

/** Can this player pick the card position now? */
function eligible(lobby, pid) {
  const d = lobby.draft;
  const cid = cidOfPid(lobby, pid);
  return (
    !!cid &&
    isConnected(cid) &&
    !d.done.has(pid) &&
    d.ready.has(pid) &&
    (d.applied.get(pid) || 0) >= d.round
  );
}

/** Next player after `afterPid` in the queue; finished players are skipped */
function pickNext(lobby, afterPid) {
  const d = lobby.draft;
  const n = d.order.length;
  const start = afterPid ? d.order.indexOf(afterPid) : -1;
  d.current = null;
  for (let i = 1; i <= n; i++) {
    const pid = d.order[(((start + i) % n) + n) % n];
    if (eligible(lobby, pid)) {
      d.current = pid;
      return;
    }
  }
}

/** Moves the draft on after any change (ack, ready, connect, kick ...) */
function advance(lobby) {
  const d = lobby.draft;
  if (!d || d.stage === 'finished') return;
  const pids = [...lobby.members.values()].map((m) => m.pid);
  const connectedPids = [...lobby.members.entries()]
    .filter(([cid]) => isConnected(cid))
    .map(([, m]) => m.pid);

  if (d.stage === 'division') {
    if (connectedPids.length > 0 && connectedPids.every((p) => d.ready.has(p))) {
      d.stage = 'units';
      d.round = 0;
      d.pending = null;
      pickNext(lobby, null);
      appendLog({type: 'units-stage', lobby: lobby.code});
    }
    return;
  }

  // units stage
  if (pids.length > 0 && pids.every((p) => d.done.has(p))) {
    d.stage = 'finished';
    lobby.phase = 'finished';
    d.pending = null;
    d.current = null;
    appendLog({type: 'finished', lobby: lobby.code});
    return;
  }
  if (d.pending) {
    // The round ends when every connected player still drafting applied it
    const waiting = connectedPids.filter(
      (p) => !d.done.has(p) && (d.applied.get(p) || 0) < d.pending.round
    );
    if (waiting.length > 0) return;
    const by = d.pending.by;
    d.pending = null;
    pickNext(lobby, by);
  } else if (!d.current || !eligible(lobby, d.current)) {
    pickNext(lobby, d.current);
  }
}

function buildOrder(lobby) {
  const blue = shuffle([...lobby.members.values()].filter((m) => m.team === 'blue').map((m) => m.pid));
  const red = shuffle([...lobby.members.values()].filter((m) => m.team === 'red').map((m) => m.pid));
  const first = randomInt(2) === 0 ? [blue, red] : [red, blue];
  const order = [];
  for (let i = 0; i < Math.max(blue.length, red.length); i++) {
    for (const team of first) if (team[i]) order.push(team[i]);
  }
  return order;
}

/* ------------------------------------------------------------------ */
/* Lobby actions                                                       */
/* ------------------------------------------------------------------ */

class Fail extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function checkNick(raw) {
  const nick = clip(raw, 40).replace(/\s+/g, ' ');
  if (!NICK_RE.test(nick)) {
    throw new Fail('Nick: 2-20 znaków (litery, cyfry, spacja, _ . -).');
  }
  return nick;
}

function checkCid(raw) {
  const cid = clip(raw, 80);
  if (cid.length < 8) throw new Fail('Błędny identyfikator.');
  return cid;
}

function lobbyFor(cid) {
  const lobby = lobbies.get(lobbyOf.get(cid));
  if (!lobby || !lobby.members.has(cid)) throw new Fail('Nie jesteś w żadnym lobby.', 404);
  return lobby;
}

function requireHost(lobby, cid) {
  if (lobby.hostCid !== cid) throw new Fail('Tylko host może to zrobić.', 403);
}

function removeMember(lobby, cid, reason) {
  const member = lobby.members.get(cid);
  if (!member) return;
  lobby.members.delete(cid);
  lobbyOf.delete(cid);
  const d = lobby.draft;
  if (d) {
    d.order = d.order.filter((p) => p !== member.pid);
    d.ready.delete(member.pid);
    d.done.delete(member.pid);
    d.applied.delete(member.pid);
    if (d.current === member.pid) d.current = null;
  }
  appendLog({type: reason, lobby: lobby.code, nick: member.nick});

  if (lobby.members.size === 0) {
    lobbies.delete(lobby.code);
    return;
  }
  if (lobby.hostCid === cid) {
    // Next player (the one who joined first) becomes the host
    lobby.hostCid = [...lobby.members.entries()].sort((a, b) => a[1].joinedAt - b[1].joinedAt)[0][0];
  }
  advance(lobby);
}

function leaveCurrent(cid) {
  const old = lobbies.get(lobbyOf.get(cid));
  if (old) removeMember(old, cid, 'leave');
  lobbyOf.delete(cid);
  if (old && old.members.size > 0) broadcast(old);
}

function addMember(lobby, cid, nick) {
  lobby.members.set(cid, {
    pid: randomId(),
    nick,
    team: null,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
  });
  lobbyOf.set(cid, lobby.code);
}

const actions = {
  create(body) {
    const cid = checkCid(body.cid);
    const nick = checkNick(body.nick);
    const dataset = DATASETS.has(body.dataset) ? body.dataset : 'wif';
    leaveCurrent(cid);
    const lobby = {
      code: makeCode(),
      hostCid: cid,
      dataset,
      phase: 'waiting',
      members: new Map(),
      draft: null,
      touched: Date.now(),
    };
    lobbies.set(lobby.code, lobby);
    addMember(lobby, cid, nick);
    appendLog({type: 'create', lobby: lobby.code, nick, dataset});
    return {lobby, reply: {code: lobby.code, pid: pidOf(lobby, cid)}};
  },

  join(body) {
    const cid = checkCid(body.cid);
    const nick = checkNick(body.nick);
    const code = clip(body.code, 8).toUpperCase();
    const lobby = lobbies.get(code);
    if (!lobby) throw new Fail('Nie ma lobby o takim kodzie.', 404);

    if (lobby.members.has(cid)) {
      // Same browser again (reload): back in, whatever the phase
      return {lobby, reply: {code, pid: pidOf(lobby, cid)}};
    }
    if (lobby.phase !== 'waiting') {
      throw new Fail('Draft w tym lobby już się zaczął.');
    }
    if (lobby.members.size >= MAX_PLAYERS) {
      throw new Fail(`Lobby jest pełne (maksymalnie ${MAX_PLAYERS} graczy).`);
    }
    const lower = nick.toLowerCase();
    for (const m of lobby.members.values()) {
      if (m.nick.toLowerCase() === lower) throw new Fail('Ten nick jest już zajęty w tym lobby.', 409);
    }
    leaveCurrent(cid);
    addMember(lobby, cid, nick);
    appendLog({type: 'join', lobby: code, nick});
    return {lobby, reply: {code, pid: pidOf(lobby, cid)}};
  },

  leave(body) {
    const cid = checkCid(body.cid);
    leaveCurrent(cid);
    return {reply: {ok: true}};
  },

  dataset(body) {
    const cid = checkCid(body.cid);
    const lobby = lobbyFor(cid);
    requireHost(lobby, cid);
    if (lobby.phase !== 'waiting') throw new Fail('Zbyt późno na zmianę gry.');
    if (!DATASETS.has(body.dataset)) throw new Fail('Nieznana gra.');
    lobby.dataset = body.dataset;
    return {lobby, reply: {ok: true}};
  },

  /** Host sets the teams (random draw and manual changes both come here) */
  teams(body) {
    const cid = checkCid(body.cid);
    const lobby = lobbyFor(cid);
    requireHost(lobby, cid);
    if (lobby.phase !== 'waiting' && lobby.phase !== 'teams') {
      throw new Fail('Drużyny można ustawić tylko przed draftem.');
    }
    const blue = Array.isArray(body.blue) ? body.blue.map(String) : [];
    const red = Array.isArray(body.red) ? body.red.map(String) : [];
    const all = [...blue, ...red];
    const pids = [...lobby.members.values()].map((m) => m.pid);
    if (
      all.length !== pids.length ||
      new Set(all).size !== all.length ||
      !pids.every((p) => all.includes(p))
    ) {
      throw new Fail('Lista drużyn nie pasuje do graczy w lobby.');
    }
    if (blue.length === 0 || red.length === 0) throw new Fail('Każda drużyna potrzebuje gracza.');
    if (blue.length > MAX_PER_TEAM || red.length > MAX_PER_TEAM) {
      throw new Fail(`Maksymalnie ${MAX_PER_TEAM} graczy w drużynie.`);
    }
    for (const m of lobby.members.values()) m.team = blue.includes(m.pid) ? 'blue' : 'red';
    lobby.phase = 'teams';
    appendLog({type: 'teams', lobby: lobby.code, blue: blue.length, red: red.length});
    return {lobby, reply: {ok: true}};
  },

  back(body) {
    const cid = checkCid(body.cid);
    const lobby = lobbyFor(cid);
    requireHost(lobby, cid);
    if (lobby.phase !== 'teams') throw new Fail('Nie ma do czego wracać.');
    for (const m of lobby.members.values()) m.team = null;
    lobby.phase = 'waiting';
    return {lobby, reply: {ok: true}};
  },

  start(body) {
    const cid = checkCid(body.cid);
    const lobby = lobbyFor(cid);
    requireHost(lobby, cid);
    if (lobby.phase !== 'teams') throw new Fail('Najpierw ustaw drużyny.');
    lobby.draft = {
      stage: 'division',
      order: buildOrder(lobby),
      round: 0,
      current: null,
      pending: null,
      log: [],
      ready: new Set(),
      done: new Set(),
      applied: new Map(),
    };
    lobby.phase = 'drafting';
    appendLog({type: 'start', lobby: lobby.code, order: lobby.draft.order});
    return {lobby, reply: {ok: true}};
  },

  kick(body) {
    const cid = checkCid(body.cid);
    const lobby = lobbyFor(cid);
    requireHost(lobby, cid);
    const target = cidOfPid(lobby, clip(body.pid, 20));
    if (!target || target === cid) throw new Fail('Nie można usunąć tego gracza.');
    removeMember(lobby, target, 'kick');
    // The kicked browser learns it from the next snapshot (it is not in it)
    for (const res of streams.get(target) ?? []) {
      res.write(`data: ${JSON.stringify({gone: true})}\n\n`);
    }
    return {lobby, reply: {ok: true}};
  },

  /** The host has been away: another player takes over */
  takehost(body) {
    const cid = checkCid(body.cid);
    const lobby = lobbyFor(cid);
    if (lobby.hostCid === cid) return {lobby, reply: {ok: true}};
    const host = lobby.members.get(lobby.hostCid);
    if (host && (isConnected(lobby.hostCid) || Date.now() - host.lastSeen < HOST_GRACE_MS)) {
      throw new Fail('Host jest nadal w lobby.');
    }
    lobby.hostCid = cid;
    appendLog({type: 'takehost', lobby: lobby.code, nick: lobby.members.get(cid).nick});
    return {lobby, reply: {ok: true}};
  },

  /** Player picked his division (privately): ready for the unit rounds */
  ready(body) {
    const cid = checkCid(body.cid);
    const lobby = lobbyFor(cid);
    const d = lobby.draft;
    if (!d) throw new Fail('Draft jeszcze się nie zaczął.');
    d.ready.add(pidOf(lobby, cid));
    advance(lobby);
    return {lobby, reply: {ok: true}};
  },

  /** The player on turn chose a card position: everybody must take it */
  pick(body) {
    const cid = checkCid(body.cid);
    const lobby = lobbyFor(cid);
    const d = lobby.draft;
    const pid = pidOf(lobby, cid);
    if (!d || d.stage !== 'units') throw new Fail('Teraz nie ma wyboru jednostek.');
    if (d.current !== pid) throw new Fail('To nie Twoja tura.', 403);
    if (d.pending) throw new Fail('Poprzedni wybór jeszcze trwa.');
    const slot = Number(body.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) throw new Fail('Zła pozycja karty.');
    d.round += 1;
    d.pending = {round: d.round, slot, by: pid};
    d.log.push({round: d.round, slot, by: pid});
    // Only the position is ever recorded: not what was behind the card
    appendLog({type: 'pick', lobby: lobby.code, nick: lobby.members.get(cid).nick, round: d.round, slot});
    advance(lobby);
    return {lobby, reply: {ok: true}};
  },

  /**
   * A player's finished deck code. Stored, but handed out only when the whole
   * draft is finished, and only to the same team (see snapshot).
   */
  share(body) {
    const cid = checkCid(body.cid);
    const lobby = lobbyFor(cid);
    if (!lobby.draft) throw new Fail('Draft jeszcze się nie zaczął.');
    const code = clip(body.code, 2000);
    if (!/^[A-Za-z0-9+/=]{8,2000}$/.test(code)) throw new Fail('Błędny kod decku.');
    lobby.members.get(cid).deckCode = code;
    return {lobby, reply: {ok: true}};
  },

  /** A browser reports: "I applied rounds up to N" (and "my deck is full") */
  ack(body) {
    const cid = checkCid(body.cid);
    const lobby = lobbyFor(cid);
    const d = lobby.draft;
    if (!d) throw new Fail('Draft jeszcze się nie zaczął.');
    const pid = pidOf(lobby, cid);
    const round = Math.max(0, Math.min(d.round, Number(body.round) || 0));
    d.applied.set(pid, Math.max(d.applied.get(pid) || 0, round));
    if (body.done === true) {
      d.done.add(pid);
      d.ready.add(pid);
    }
    advance(lobby);
    return {lobby, reply: {ok: true}};
  },

  /** Host passes the turn of a player who is stuck */
  skip(body) {
    const cid = checkCid(body.cid);
    const lobby = lobbyFor(cid);
    requireHost(lobby, cid);
    const d = lobby.draft;
    if (!d || d.stage !== 'units' || d.pending) throw new Fail('Teraz nie można pominąć tury.');
    appendLog({type: 'skip', lobby: lobby.code, pid: d.current});
    pickNext(lobby, d.current);
    return {lobby, reply: {ok: true}};
  },
};

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Fail('Za duże żądanie.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (err) {
        reject(new Fail('Błędny JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function handleStream(url, req, res) {
  const cid = clip(url.searchParams.get('cid') || '', 80);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');

  const lobby = lobbies.get(lobbyOf.get(cid));
  if (!lobby || !lobby.members.has(cid)) {
    res.write(`data: ${JSON.stringify({gone: true})}\n\n`);
    return;
  }

  let set = streams.get(cid);
  if (!set) streams.set(cid, (set = new Set()));
  set.add(res);
  lobby.members.get(cid).lastSeen = Date.now();
  advance(lobby);
  broadcast(lobby); // everybody sees this player online (and he gets his snapshot)

  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ping);
    set.delete(res);
    if (set.size === 0) streams.delete(cid);
    const current = lobbies.get(lobbyOf.get(cid));
    if (current && current.members.has(cid)) {
      current.members.get(cid).lastSeen = Date.now();
      advance(current);
      broadcast(current);
    }
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(url, res) {
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch (err) {
    res.writeHead(400);
    return res.end();
  }
  let file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // Client-side routes (/lobby, /drafter/wif ...) are answered by the app
    file = path.join(ROOT, 'index.html');
  }
  if (!fs.existsSync(file)) {
    res.writeHead(503, {'Content-Type': 'text/plain; charset=utf-8'});
    return res.end('Brak folderu dist. Uruchom najpierw: npm run build');
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/lobby/events' && req.method === 'GET') {
      return handleStream(url, req, res);
    }
    if (url.pathname === '/api/log' && req.method === 'GET') {
      return sendJson(res, 200, recentLog);
    }
    const m = /^\/api\/lobby\/([a-z]+)$/.exec(url.pathname);
    if (m && req.method === 'POST') {
      const action = actions[m[1]];
      if (!action) throw new Fail('Nie ma takiej akcji.', 404);
      const {lobby, reply} = action(await readJson(req));
      if (lobby && lobbies.has(lobby.code)) {
        lobby.touched = Date.now();
        broadcast(lobby);
      }
      return sendJson(res, 200, {ok: true, ...reply});
    }
    if (url.pathname.startsWith('/api/')) {
      return sendJson(res, 404, {error: 'Nie ma takiego adresu API.'});
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end();
    }
    return serveStatic(url, res);
  } catch (err) {
    if (res.headersSent) return;
    if (err instanceof Fail) return sendJson(res, err.status, {error: err.message});
    console.error(err);
    sendJson(res, 500, {error: 'Błąd serwera.'});
  }
});

// Forget lobbies nobody has touched for hours
setInterval(() => {
  for (const [code, lobby] of lobbies) {
    const anyone = [...lobby.members.keys()].some(isConnected);
    if (!anyone && Date.now() - lobby.touched > LOBBY_TTL_MS) {
      for (const cid of lobby.members.keys()) lobbyOf.delete(cid);
      lobbies.delete(code);
    }
  }
}, 10 * 60 * 1000).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ACC.DRAFTER działa. Strona: ${ROOT}`);
  console.log(`  Ty:      http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const addr of list || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log(`  Inni:    http://${addr.address}:${PORT}`);
      }
    }
  }
  console.log(`  Dziennik wyborów: ${LOG_FILE}`);
  console.log('Zamknij to okno (albo CTRL+C), aby zatrzymać serwer.');
});

module.exports = server;
