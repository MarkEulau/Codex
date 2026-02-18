"use strict";

const RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"];
const RESOURCE_COUNTS = {
  wood: 4,
  brick: 3,
  sheep: 4,
  wheat: 4,
  ore: 3,
  desert: 1,
};
const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const COST = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
};
const PLAYER_COLORS = ["#b93b2a", "#2b66be", "#d49419", "#2f8852"];
const HIGH_PROBABILITY_NUMBERS = new Set([6, 8]);
const DICE_SUMS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DEFAULT_TURN_SECONDS = 60;
const MIN_TURN_SECONDS = 1;
const MAX_TURN_SECONDS = 600;
const LOCAL_SAVE_STORAGE_KEY = "catan.latest_save.v1";
const LOCAL_SAVE_INDEX_STORAGE_KEY = "catan.save_index.v1";
const LOCAL_SAVE_ITEM_STORAGE_PREFIX = "catan.save_item.v1:";
const MAX_BROWSER_SAVED_GAMES = 120;
const HEX_NEIGHBOR_DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
const DIE_FACE_ROTATIONS = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
};

const BOARD_RADIUS = 2;
const HEX_SIZE = 74;
const BOARD_PADDING = 36;
const SVG_NS = "http://www.w3.org/2000/svg";
const ONLINE_MAX_PLAYERS = 4;
const ROOM_CODE_REGEX = /^[A-Z0-9]{4,6}$/;

const state = {
  players: [],
  tiles: [],
  nodes: [],
  edges: [],
  geometry: null,
  robberTile: -1,

  phase: "pregame", // pregame | setup | main | gameover
  setup: null,
  currentPlayer: 0,
  round: 1,
  hasRolled: false,
  diceResult: null,
  isRollingDice: false,
  rollingDiceValue: null,
  rollResultPopupValue: null,
  rollHistogram: {},
  rollCountTotal: 0,
  histogramOpen: false,
  turnSeconds: DEFAULT_TURN_SECONDS,
  turnTimerActive: false,
  turnTimerEndMs: 0,
  turnTimerRemainingMs: DEFAULT_TURN_SECONDS * 1000,
  turnTimeoutBusy: false,
  pendingRobberMove: false,
  mode: "none", // none | road | settlement | city | robber
  tradeMenuOpen: false,
  status: "Set players and start.",
  log: [],
};

const refs = {
  board: document.getElementById("board"),
  buildActionPopup: document.getElementById("buildActionPopup"),
  tradePromptPopup: document.getElementById("tradePromptPopup"),
  tradeActionPopup: document.getElementById("tradeActionPopup"),
  openTradeMenuBtn: document.getElementById("openTradeMenuBtn"),
  closeTradeMenuBtn: document.getElementById("closeTradeMenuBtn"),
  bankTradeSection: document.getElementById("bankTradeSection"),
  playerTradeSection: document.getElementById("playerTradeSection"),
  setupFields: document.getElementById("setupFields"),
  playerCount: document.getElementById("playerCount"),
  turnSeconds: document.getElementById("turnSeconds"),
  nameInputs: document.getElementById("nameInputs"),
  startBtn: document.getElementById("startBtn"),
  resumeGameBtn: document.getElementById("resumeGameBtn"),
  restartBtn: document.getElementById("restartBtn"),
  roomCard: document.getElementById("roomCard"),
  onlineName: document.getElementById("onlineName"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  copyRoomCodeBtn: document.getElementById("copyRoomCodeBtn"),
  leaveRoomBtn: document.getElementById("leaveRoomBtn"),
  rollbackActionBtn: document.getElementById("rollbackActionBtn"),
  roomStatusText: document.getElementById("roomStatusText"),
  roomCodeDisplay: document.getElementById("roomCodeDisplay"),
  roomSaveMeta: document.getElementById("roomSaveMeta"),
  roomPlayersList: document.getElementById("roomPlayersList"),
  rollBtn: document.getElementById("rollBtn"),
  endTurnBtn: document.getElementById("endTurnBtn"),
  tradeBtn: document.getElementById("tradeBtn"),
  tradeGive: document.getElementById("tradeGive"),
  tradeGet: document.getElementById("tradeGet"),
  p2pTradeBtn: document.getElementById("p2pTradeBtn"),
  p2pTarget: document.getElementById("p2pTarget"),
  p2pGive: document.getElementById("p2pGive"),
  p2pGiveAmount: document.getElementById("p2pGiveAmount"),
  p2pGet: document.getElementById("p2pGet"),
  p2pGetAmount: document.getElementById("p2pGetAmount"),
  bankTradeHint: document.getElementById("bankTradeHint"),
  p2pTradeHint: document.getElementById("p2pTradeHint"),
  phaseLabel: document.getElementById("phaseLabel"),
  currentPlayerLabel: document.getElementById("currentPlayerLabel"),
  diceLabel: document.getElementById("diceLabel"),
  turnCard: document.getElementById("turnCard"),
  turnCallout: document.getElementById("turnCallout"),
  turnBadge: document.getElementById("turnBadge"),
  turnBadgeDot: document.getElementById("turnBadgeDot"),
  turnBadgeText: document.getElementById("turnBadgeText"),
  turnClock: document.getElementById("turnClock"),
  turnClockText: document.getElementById("turnClockText"),
  diceRollStage: document.getElementById("diceRollStage"),
  boardDieA: document.getElementById("boardDieA"),
  boardDieB: document.getElementById("boardDieB"),
  rollResultPopup: document.getElementById("rollResultPopup"),
  histogramToggleBtn: document.getElementById("histogramToggleBtn"),
  rollHistogram: document.getElementById("rollHistogram"),
  statusText: document.getElementById("statusText"),
  tableStats: document.getElementById("tableStats"),
  buildPanel: document.getElementById("buildPanel"),
  logList: document.getElementById("logList"),
  modeButtons: Array.from(document.querySelectorAll(".mode-btn")),
  actionModal: document.getElementById("actionModal"),
  actionModalTitle: document.getElementById("actionModalTitle"),
  actionModalText: document.getElementById("actionModalText"),
  actionModalOptions: document.getElementById("actionModalOptions"),
  actionModalCancelBtn: document.getElementById("actionModalCancelBtn"),
};

let actionModalResolver = null;
let turnTimerInterval = null;
let pendingRoomCommand = null;
let remoteSyncVersion = 0;
let roomStatusOverride = "";

const onlineState = {
  socket: null,
  connected: false,
  clientId: "",
  roomCode: "",
  hostId: "",
  started: false,
  players: [],
  seatMap: [],
  version: 0,
  historyCount: 0,
  saveFile: "",
};

const localSaveState = {
  sessionId: "",
  saveFile: "",
  browserSaveId: "",
  queue: [],
  starting: false,
  flushing: false,
  token: 0,
};

const resumeState = {
  checking: false,
  hasSave: false,
  latestFile: "",
};

function resourceMap(init = 0) {
  const out = {};
  for (const res of RESOURCES) out[res] = init;
  return out;
}

function emptyRollHistogram() {
  const out = {};
  for (const sum of DICE_SUMS) out[sum] = 0;
  return out;
}

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function axialHexes(radius) {
  const coords = [];
  for (let q = -radius; q <= radius; q += 1) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r += 1) coords.push({ q, r });
  }
  return coords;
}

function hexCenter(q, r) {
  const x = Math.sqrt(3) * HEX_SIZE * (q + r / 2);
  const y = 1.5 * HEX_SIZE * r;
  return { x, y };
}

function pointKey(x, y) {
  return `${Math.round(x * 1000)}:${Math.round(y * 1000)}`;
}

function coordKey(q, r) {
  return `${q}:${r}`;
}

function buildTileAdjacency(coords) {
  const byCoord = new Map();
  coords.forEach((coord, idx) => {
    byCoord.set(coordKey(coord.q, coord.r), idx);
  });

  return coords.map((coord) => {
    const out = [];
    for (const [dq, dr] of HEX_NEIGHBOR_DIRS) {
      const neighbor = byCoord.get(coordKey(coord.q + dq, coord.r + dr));
      if (neighbor !== undefined) out.push(neighbor);
    }
    return out;
  });
}

function assignNumbersWithConstraints(coords, resourcesByTile) {
  const adjacency = buildTileAdjacency(coords);
  const nonDesertTiles = [];
  resourcesByTile.forEach((resource, idx) => {
    if (resource !== "desert") nonDesertTiles.push(idx);
  });

  const baseCounts = {};
  for (const number of NUMBER_TOKENS) {
    baseCounts[number] = (baseCounts[number] || 0) + 1;
  }
  const distinctNumbers = Object.keys(baseCounts).map(Number);
  const remaining = { ...baseCounts };
  const assigned = Array(coords.length).fill(null);
  const order = nonDesertTiles.slice().sort((a, b) => {
    const degreeDiff = adjacency[b].length - adjacency[a].length;
    if (degreeDiff !== 0) return degreeDiff;
    return Math.random() < 0.5 ? -1 : 1;
  });

  function canPlace(tileIdx, number) {
    if (!HIGH_PROBABILITY_NUMBERS.has(number)) return true;
    return adjacency[tileIdx].every((neighborIdx) => {
      const neighborNumber = assigned[neighborIdx];
      return neighborNumber === null || !HIGH_PROBABILITY_NUMBERS.has(neighborNumber);
    });
  }

  function backtrack(pos) {
    if (pos >= order.length) return true;
    const tileIdx = order[pos];
    const choices = shuffle(distinctNumbers.filter((number) => remaining[number] > 0));

    for (const number of choices) {
      if (!canPlace(tileIdx, number)) continue;
      assigned[tileIdx] = number;
      remaining[number] -= 1;
      if (backtrack(pos + 1)) return true;
      remaining[number] += 1;
      assigned[tileIdx] = null;
    }
    return false;
  }

  if (!backtrack(0)) {
    throw new Error("Unable to place number tokens with non-adjacent high-probability constraint.");
  }
  return assigned;
}

function setStatus(msg) {
  state.status = msg;
}

function logEvent(msg) {
  state.log.unshift(msg);
  if (state.log.length > 16) state.log.length = 16;
}

function sanitizePlayerName(raw, fallback = "Player") {
  const value = String(raw ?? "").trim();
  if (!value) return fallback;
  return value.slice(0, 18);
}

function isOnlineRoomActive() {
  return onlineState.roomCode.length > 0;
}

function isOnlineGameStarted() {
  return isOnlineRoomActive() && onlineState.started;
}

function isRoomHost() {
  return isOnlineRoomActive() && onlineState.clientId !== "" && onlineState.clientId === onlineState.hostId;
}

function localSeatIndex() {
  if (!isOnlineRoomActive()) return -1;
  return onlineState.seatMap.indexOf(onlineState.clientId);
}

function currentTurnOwnerDisconnected() {
  if (!isOnlineGameStarted()) return false;
  const ownerId = onlineState.seatMap[state.currentPlayer];
  if (!ownerId) return false;
  const owner = onlineState.players.find((player) => player.id === ownerId);
  return Boolean(owner && owner.connected === false);
}

function localControlsCurrentTurn() {
  if (!isOnlineGameStarted()) return true;
  if (localSeatIndex() === state.currentPlayer) return true;
  return isRoomHost() && currentTurnOwnerDisconnected();
}

function currentTurnOwnerName() {
  if (state.currentPlayer < 0 || state.currentPlayer >= state.players.length) return "another player";
  return state.players[state.currentPlayer].name;
}

function setRoomStatusOverride(msg) {
  roomStatusOverride = String(msg || "");
}

function socketEndpoint() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}

function sendSocketMessage(type, payload = {}) {
  if (!onlineState.socket || onlineState.socket.readyState !== WebSocket.OPEN) return false;
  onlineState.socket.send(JSON.stringify({ type, ...payload }));
  return true;
}

function normalizeActionLabel(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "sync";
  return value.slice(0, 48);
}

async function apiJson(path, options = {}) {
  const init = { cache: "no-store", ...options };
  if (init.body !== undefined) {
    init.headers = { "Content-Type": "application/json", ...(init.headers || {}) };
  }
  const response = await fetch(path, init);
  let payload = null;
  try {
    payload = await response.json();
  } catch (_err) {
    payload = null;
  }
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload || {};
}

function readLatestLocalStorageSave() {
  try {
    const raw = window.localStorage.getItem(LOCAL_SAVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.gameState || typeof parsed.gameState !== "object") {
      return null;
    }
    return {
      gameState: parsed.gameState,
      savedAt: String(parsed.savedAt || ""),
    };
  } catch (_err) {
    return null;
  }
}

function localSaveStorageKey(saveId) {
  return `${LOCAL_SAVE_ITEM_STORAGE_PREFIX}${saveId}`;
}

function readBrowserSaveIndex() {
  try {
    const raw = window.localStorage.getItem(LOCAL_SAVE_INDEX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out = [];
    parsed.forEach((entry) => {
      if (typeof entry !== "string") return;
      const value = entry.trim();
      if (!value) return;
      if (out.includes(value)) return;
      out.push(value);
    });
    return out;
  } catch (_err) {
    return [];
  }
}

function writeBrowserSaveIndex(ids) {
  try {
    window.localStorage.setItem(LOCAL_SAVE_INDEX_STORAGE_KEY, JSON.stringify(ids));
  } catch (_err) {
    // Ignore storage write failures.
  }
}

function createBrowserSaveId() {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readBrowserSaveById(saveId) {
  const safeId = String(saveId || "").trim();
  if (!safeId) return null;
  try {
    const raw = window.localStorage.getItem(localSaveStorageKey(safeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.gameState || typeof parsed.gameState !== "object") {
      return null;
    }
    return {
      id: safeId,
      createdAt: String(parsed.createdAt || parsed.savedAt || ""),
      savedAt: String(parsed.savedAt || ""),
      players: Array.isArray(parsed.players) ? parsed.players.slice() : [],
      gameState: parsed.gameState,
    };
  } catch (_err) {
    return null;
  }
}

function pruneBrowserSaveIndex(ids) {
  const keep = ids.slice(0, MAX_BROWSER_SAVED_GAMES);
  const removed = ids.slice(MAX_BROWSER_SAVED_GAMES);
  removed.forEach((saveId) => {
    try {
      window.localStorage.removeItem(localSaveStorageKey(saveId));
    } catch (_err) {
      // Ignore cleanup failures.
    }
  });
  return keep;
}

function readAllBrowserSaves() {
  const ids = readBrowserSaveIndex();
  const saves = [];
  ids.forEach((saveId) => {
    const save = readBrowserSaveById(saveId);
    if (save) saves.push(save);
  });
  saves.sort((a, b) => {
    const left = Date.parse(a.savedAt || a.createdAt || "");
    const right = Date.parse(b.savedAt || b.createdAt || "");
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
  });
  return saves;
}

function persistLatestLocalStorageSave(action) {
  if (state.players.length === 0 || state.phase === "pregame") return;
  const saveId = localSaveState.browserSaveId || createBrowserSaveId();
  localSaveState.browserSaveId = saveId;
  const existing = readBrowserSaveById(saveId);
  const nowIso = new Date().toISOString();
  const playerNames = state.players.map((player, idx) => sanitizePlayerName(player.name, `Player ${idx + 1}`));
  const payload = {
    id: saveId,
    createdAt: existing?.createdAt || nowIso,
    savedAt: nowIso,
    action: normalizeActionLabel(action),
    players: playerNames,
    gameState: serializeGameState(),
  };
  try {
    window.localStorage.setItem(localSaveStorageKey(saveId), JSON.stringify(payload));
    const nextIndex = pruneBrowserSaveIndex([saveId, ...readBrowserSaveIndex().filter((id) => id !== saveId)]);
    writeBrowserSaveIndex(nextIndex);
    // Keep one-entry compatibility key for older versions.
    window.localStorage.setItem(
      LOCAL_SAVE_STORAGE_KEY,
      JSON.stringify({
        savedAt: payload.savedAt,
        action: payload.action,
        players: payload.players,
        gameState: payload.gameState,
      })
    );
    resumeState.hasSave = true;
    if (!resumeState.latestFile) resumeState.latestFile = "Browser local saves";
  } catch (_err) {
    // Ignore localStorage issues and continue with server saves.
  }
}

function resetLocalSaveSession() {
  localSaveState.token += 1;
  localSaveState.sessionId = "";
  localSaveState.saveFile = "";
  localSaveState.browserSaveId = "";
  localSaveState.queue = [];
  localSaveState.starting = false;
  localSaveState.flushing = false;
}

async function startLocalSaveSession(options = {}) {
  if (isOnlineGameStarted()) return false;
  if (state.players.length === 0 || state.phase === "pregame") return false;
  if (localSaveState.sessionId || localSaveState.starting) return localSaveState.sessionId.length > 0;

  const token = localSaveState.token;
  localSaveState.starting = true;
  try {
    const payload = await apiJson("/api/local-game/start", {
      method: "POST",
      body: JSON.stringify({
        playerNames: state.players.map((player) => player.name),
        turnSeconds: state.turnSeconds,
        reason: normalizeActionLabel(options.reason || "local_game_start"),
      }),
    });
    if (token !== localSaveState.token) return false;
    localSaveState.sessionId = String(payload.sessionId || "");
    localSaveState.saveFile = String(payload.save?.file || "");
    return localSaveState.sessionId.length > 0;
  } catch (_err) {
    if (token !== localSaveState.token) return false;
    return false;
  } finally {
    if (token === localSaveState.token) localSaveState.starting = false;
    void flushLocalSaveQueue();
  }
}

async function flushLocalSaveQueue() {
  if (localSaveState.flushing) return;
  if (!localSaveState.sessionId || localSaveState.queue.length === 0) return;

  const token = localSaveState.token;
  localSaveState.flushing = true;

  try {
    while (token === localSaveState.token && localSaveState.sessionId && localSaveState.queue.length > 0) {
      const entry = localSaveState.queue[0];
      try {
        const payload = await apiJson("/api/local-game/state", {
          method: "POST",
          body: JSON.stringify({
            sessionId: localSaveState.sessionId,
            action: entry.action,
            gameState: entry.gameState,
          }),
        });
        if (token !== localSaveState.token) return;
        localSaveState.saveFile = String(payload.save?.file || localSaveState.saveFile);
        localSaveState.queue.shift();
      } catch (err) {
        if (token !== localSaveState.token) return;
        if (err instanceof Error && /not found/i.test(err.message)) {
          localSaveState.sessionId = "";
          if (!localSaveState.starting) void startLocalSaveSession({ reason: "local_session_recovered" });
        }
        break;
      }
    }
  } finally {
    if (token !== localSaveState.token) return;
    localSaveState.flushing = false;
    if (localSaveState.queue.length > 0) {
      window.setTimeout(() => {
        if (token !== localSaveState.token) return;
        if (!localSaveState.sessionId && !localSaveState.starting) {
          void startLocalSaveSession({ reason: "local_session_retry" });
        }
        void flushLocalSaveQueue();
      }, 700);
      return;
    }
    if (localSaveState.saveFile) {
      resumeState.hasSave = true;
      resumeState.latestFile = localSaveState.saveFile;
    }
    if (state.phase === "pregame") renderControls();
  }
}

function queueLocalSaveSnapshot(action) {
  if (isOnlineGameStarted()) return;
  if (state.players.length === 0 || state.phase === "pregame") return;
  localSaveState.queue.push({
    action: normalizeActionLabel(action),
    gameState: serializeGameState(),
  });
  if (!localSaveState.sessionId && !localSaveState.starting) {
    void startLocalSaveSession();
    return;
  }
  void flushLocalSaveQueue();
}

function recordGameAction(action, options = {}) {
  const normalized = normalizeActionLabel(action);
  persistLatestLocalStorageSave(normalized);
  if (isOnlineGameStarted()) {
    const force = options.force !== false;
    publishOnlineState({ force, action: normalized });
    return;
  }
  queueLocalSaveSnapshot(normalized);
}

async function fetchSavedGamesList() {
  return apiJson("/api/game-saves", { method: "GET" });
}

async function fetchSavedGameById(saveId) {
  const encoded = encodeURIComponent(String(saveId || ""));
  return apiJson(`/api/game-saves/load?id=${encoded}`, { method: "GET" });
}

function formatSaveTimestamp(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Unknown date/time";
  return date.toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function playerNamesFromList(players) {
  if (!Array.isArray(players) || players.length === 0) return [];
  return players
    .map((player, idx) => sanitizePlayerName(player?.name, `Player ${idx + 1}`))
    .filter((name) => Boolean(name));
}

function playerNamesFromSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.players) || snapshot.players.length === 0) return [];
  return snapshot.players
    .map((player, idx) => sanitizePlayerName(player?.name, `Player ${idx + 1}`))
    .filter((name) => Boolean(name));
}

function formatPlayersSummary(playerNames) {
  if (!Array.isArray(playerNames) || playerNames.length === 0) return "Unknown players";
  return playerNames.join(", ");
}

async function collectResumeOptions() {
  const options = [];
  let serverSaves = [];
  try {
    const payload = await fetchSavedGamesList();
    serverSaves = Array.isArray(payload?.saves) ? payload.saves : [];
  } catch (_err) {
    serverSaves = [];
  }

  serverSaves.forEach((save) => {
    const names = playerNamesFromList(save.players);
    const label = `${formatSaveTimestamp(save.updatedAt || save.createdAt)} | ${formatPlayersSummary(names)}`;
    options.push({
      value: `server:${save.id}`,
      label,
      sourceLabel: String(save.file || save.id || "Saved game"),
      sortAt: save.updatedAt || save.createdAt || "",
    });
  });

  const browserSaves = readAllBrowserSaves();
  browserSaves.forEach((save) => {
    const names = Array.isArray(save.players) && save.players.length > 0 ? save.players : playerNamesFromSnapshot(save.gameState);
    const label = `${formatSaveTimestamp(save.savedAt || save.createdAt)} | ${formatPlayersSummary(names)}`;
    options.push({
      value: `local:${save.id}`,
      label,
      sourceLabel: "Browser local save",
      sortAt: save.savedAt || save.createdAt || "",
    });
  });

  // Legacy one-slot fallback for older builds.
  if (browserSaves.length === 0) {
    const legacySave = readLatestLocalStorageSave();
    if (legacySave && legacySave.gameState) {
      const names = playerNamesFromSnapshot(legacySave.gameState);
      const label = `${formatSaveTimestamp(legacySave.savedAt)} | ${formatPlayersSummary(names)}`;
      options.push({
        value: "local:legacy",
        label,
        sourceLabel: "Browser local save",
        sortAt: legacySave.savedAt || "",
      });
    }
  }

  options.sort((a, b) => {
    const left = Date.parse(a.sortAt || "");
    const right = Date.parse(b.sortAt || "");
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
  });
  return options.map((option) => ({
    value: option.value,
    label: option.label,
    sourceLabel: option.sourceLabel,
  }));
}

async function refreshLatestSaveAvailability() {
  if (resumeState.checking) return;
  resumeState.checking = true;
  try {
    const options = await collectResumeOptions();
    resumeState.hasSave = options.length > 0;
    resumeState.latestFile = options.length > 0 ? options[0].sourceLabel : "";
  } catch (_err) {
    resumeState.hasSave = false;
    resumeState.latestFile = "";
  } finally {
    resumeState.checking = false;
    renderControls();
  }
}

function queueRoomCommand(type, payload = {}) {
  pendingRoomCommand = { type, payload };
  if (onlineState.socket && onlineState.socket.readyState === WebSocket.OPEN) {
    const command = pendingRoomCommand;
    pendingRoomCommand = null;
    sendSocketMessage(command.type, command.payload);
    return;
  }
  if (onlineState.socket && onlineState.socket.readyState === WebSocket.CONNECTING) return;

  onlineState.socket = new WebSocket(socketEndpoint());
  onlineState.socket.addEventListener("open", () => {
    onlineState.connected = true;
    if (pendingRoomCommand) {
      const command = pendingRoomCommand;
      pendingRoomCommand = null;
      sendSocketMessage(command.type, command.payload);
    }
    renderRoomPanel();
    renderControls();
  });
  onlineState.socket.addEventListener("message", (event) => {
    handleSocketMessage(event.data);
  });
  onlineState.socket.addEventListener("close", () => {
    onlineState.connected = false;
    onlineState.socket = null;
    pendingRoomCommand = null;
    onlineState.roomCode = "";
    onlineState.hostId = "";
    onlineState.started = false;
    onlineState.players = [];
    onlineState.seatMap = [];
    onlineState.version = 0;
    onlineState.historyCount = 0;
    onlineState.saveFile = "";
    remoteSyncVersion = 0;
    setRoomStatusOverride("Disconnected from server.");
    renderRoomPanel();
    renderControls();
  });
  onlineState.socket.addEventListener("error", () => {
    setRoomStatusOverride("Socket error. Check server status.");
    renderRoomPanel();
  });
}

function handleSocketMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch (_err) {
    return;
  }
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "welcome") {
    onlineState.clientId = String(msg.clientId ?? "");
    renderRoomPanel();
    return;
  }

  if (msg.type === "room_error") {
    setRoomStatusOverride(String(msg.message || "Room error."));
    renderRoomPanel();
    return;
  }

  if (msg.type !== "room_state" || !msg.room || typeof msg.room !== "object") return;

  const room = msg.room;
  roomStatusOverride = "";
  onlineState.roomCode = String(room.code || "");
  onlineState.hostId = String(room.hostId || "");
  onlineState.started = room.started === true;
  onlineState.players = Array.isArray(room.players) ? room.players.slice() : [];
  onlineState.seatMap = Array.isArray(room.seatMap) ? room.seatMap.slice() : [];
  onlineState.version = Number(room.version) || 0;
  onlineState.historyCount = Number(room.save?.historyCount) || 0;
  onlineState.saveFile = String(room.save?.file || "");

  if (onlineState.started && room.gameState && typeof room.version === "number" && room.version >= remoteSyncVersion) {
    if (room.version > remoteSyncVersion || state.phase === "pregame") {
      remoteSyncVersion = room.version;
      applySerializedGameState(room.gameState);
      render();
    }
  } else if (!onlineState.started) {
    remoteSyncVersion = 0;
  }

  renderRoomPanel();
  renderControls();
}

function createSerializablePlayer(player, idx) {
  return {
    idx,
    name: player.name,
    color: player.color,
    hand: { ...player.hand },
    roads: Array.from(player.roads),
    settlements: Array.from(player.settlements),
    cities: Array.from(player.cities),
  };
}

function serializeGameState() {
  return {
    players: state.players.map((player, idx) => createSerializablePlayer(player, idx)),
    tiles: state.tiles.map((tile) => ({
      ...tile,
      corners: tile.corners.map((corner) => ({ ...corner })),
      nodes: tile.nodes.slice(),
    })),
    nodes: state.nodes.map((node) => ({
      ...node,
      hexes: node.hexes.slice(),
      edges: Array.from(node.edges),
    })),
    edges: state.edges.map((edge) => ({ ...edge })),
    geometry: state.geometry ? { ...state.geometry } : null,
    robberTile: state.robberTile,
    phase: state.phase,
    setup: state.setup
      ? {
          order: state.setup.order.slice(),
          turnIndex: state.setup.turnIndex,
          expecting: state.setup.expecting,
          lastSettlementNode: state.setup.lastSettlementNode,
          selectedSettlementNode: state.setup.selectedSettlementNode,
        }
      : null,
    currentPlayer: state.currentPlayer,
    round: state.round,
    hasRolled: state.hasRolled,
    diceResult: state.diceResult,
    rollHistogram: { ...state.rollHistogram },
    rollCountTotal: state.rollCountTotal,
    turnSeconds: state.turnSeconds,
    turnTimerActive: state.turnTimerActive,
    turnTimerRemainingMs: state.turnTimerRemainingMs,
    pendingRobberMove: state.pendingRobberMove,
    status: state.status,
    log: state.log.slice(),
  };
}

function deserializePlayer(serialized, idx) {
  const hand = resourceMap(0);
  if (serialized && serialized.hand) {
    for (const resource of RESOURCES) {
      const value = Number(serialized.hand[resource]);
      hand[resource] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    }
  }

  return {
    name: sanitizePlayerName(serialized?.name, `Player ${idx + 1}`),
    color: serialized?.color || PLAYER_COLORS[idx] || "#8f7b61",
    hand,
    roads: new Set(Array.isArray(serialized?.roads) ? serialized.roads : []),
    settlements: new Set(Array.isArray(serialized?.settlements) ? serialized.settlements : []),
    cities: new Set(Array.isArray(serialized?.cities) ? serialized.cities : []),
  };
}

function applySerializedGameState(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;

  stopTurnTimer(false);
  if (actionModalResolver) closeActionModal(null);

  state.players = Array.isArray(snapshot.players) ? snapshot.players.map(deserializePlayer) : [];
  state.tiles = Array.isArray(snapshot.tiles)
    ? snapshot.tiles.map((tile, idx) => ({
        idx,
        q: Number(tile.q),
        r: Number(tile.r),
        resource: tile.resource,
        number: tile.number === null ? null : Number(tile.number),
        cx: Number(tile.cx),
        cy: Number(tile.cy),
        corners: Array.isArray(tile.corners) ? tile.corners.map((corner) => ({ x: Number(corner.x), y: Number(corner.y) })) : [],
        nodes: Array.isArray(tile.nodes) ? tile.nodes.slice() : [],
      }))
    : [];
  state.nodes = Array.isArray(snapshot.nodes)
    ? snapshot.nodes.map((node, idx) => ({
        idx,
        x: Number(node.x),
        y: Number(node.y),
        hexes: Array.isArray(node.hexes) ? node.hexes.slice() : [],
        edges: new Set(Array.isArray(node.edges) ? node.edges : []),
        owner: Number.isInteger(node.owner) ? node.owner : null,
        isCity: node.isCity === true,
      }))
    : [];
  state.edges = Array.isArray(snapshot.edges)
    ? snapshot.edges.map((edge, idx) => ({
        idx,
        a: Number(edge.a),
        b: Number(edge.b),
        owner: Number.isInteger(edge.owner) ? edge.owner : null,
      }))
    : [];
  state.geometry = snapshot.geometry
    ? {
        minX: Number(snapshot.geometry.minX),
        minY: Number(snapshot.geometry.minY),
        width: Number(snapshot.geometry.width),
        height: Number(snapshot.geometry.height),
      }
    : null;
  state.robberTile = Number.isInteger(snapshot.robberTile) ? snapshot.robberTile : -1;
  state.phase = snapshot.phase || "pregame";
  state.setup = snapshot.setup
    ? {
        order: Array.isArray(snapshot.setup.order) ? snapshot.setup.order.slice() : [],
        turnIndex: Number(snapshot.setup.turnIndex) || 0,
        expecting: snapshot.setup.expecting || "settlement",
        lastSettlementNode:
          snapshot.setup.lastSettlementNode === null ? null : Number(snapshot.setup.lastSettlementNode),
        selectedSettlementNode:
          snapshot.setup.selectedSettlementNode === null ? null : Number(snapshot.setup.selectedSettlementNode),
      }
    : null;
  state.currentPlayer = Number(snapshot.currentPlayer) || 0;
  state.round = Number(snapshot.round) || 1;
  state.hasRolled = snapshot.hasRolled === true;
  state.diceResult = snapshot.diceResult === null ? null : Number(snapshot.diceResult);
  state.isRollingDice = false;
  state.rollingDiceValue = null;
  state.rollResultPopupValue = null;
  state.rollHistogram = emptyRollHistogram();
  if (snapshot.rollHistogram && typeof snapshot.rollHistogram === "object") {
    for (const sum of DICE_SUMS) {
      const count = Number(snapshot.rollHistogram[sum]);
      state.rollHistogram[sum] = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    }
  }
  state.rollCountTotal = Number(snapshot.rollCountTotal) || 0;
  state.turnSeconds = clampTurnSeconds(snapshot.turnSeconds ?? DEFAULT_TURN_SECONDS);
  refs.turnSeconds.value = String(state.turnSeconds);
  state.turnTimerRemainingMs = Math.max(0, Number(snapshot.turnTimerRemainingMs) || state.turnSeconds * 1000);
  state.turnTimeoutBusy = false;
  state.pendingRobberMove = snapshot.pendingRobberMove === true;
  state.mode = "none";
  state.tradeMenuOpen = false;
  state.histogramOpen = false;
  state.status = String(snapshot.status || "Connected.");
  state.log = Array.isArray(snapshot.log) ? snapshot.log.slice(0, 16) : [];

  if (snapshot.turnTimerActive === true) {
    startTurnTimerWithRemaining(state.turnTimerRemainingMs);
  } else {
    state.turnTimerActive = false;
    renderTurnClock();
  }
}

function publishOnlineState(options = {}) {
  if (!isOnlineGameStarted()) return;
  if (!onlineState.connected) return;
  if (!options.force && !localControlsCurrentTurn()) return;
  const action = typeof options.action === "string" && options.action.trim() ? options.action.trim() : "sync";
  sendSocketMessage("state_sync", { gameState: serializeGameState(), action });
}

function assertLocalTurnControl() {
  if (!isOnlineGameStarted()) return true;
  if (localControlsCurrentTurn()) return true;
  setStatus(`It is ${currentTurnOwnerName()}'s turn.`);
  render();
  return false;
}

function localDisplayName() {
  if (refs.onlineName.value.trim()) return sanitizePlayerName(refs.onlineName.value, "Player");
  const firstNameInput = refs.nameInputs.querySelector("input");
  if (firstNameInput) return sanitizePlayerName(firstNameInput.value, "Player");
  return "Player";
}

function requestCreateRoom() {
  if (isOnlineRoomActive()) return;
  if (state.phase !== "pregame") {
    setRoomStatusOverride("Finish or restart the current game to use online rooms.");
    renderRoomPanel();
    return;
  }
  roomStatusOverride = "";
  queueRoomCommand("create_room", { name: localDisplayName() });
}

function requestJoinRoom() {
  if (isOnlineRoomActive()) return;
  if (state.phase !== "pregame") {
    setRoomStatusOverride("Finish or restart the current game to use online rooms.");
    renderRoomPanel();
    return;
  }
  const code = refs.roomCodeInput.value.trim().toUpperCase();
  refs.roomCodeInput.value = code;
  if (!ROOM_CODE_REGEX.test(code)) {
    setRoomStatusOverride("Room codes are 4-6 letters/numbers.");
    renderRoomPanel();
    return;
  }
  roomStatusOverride = "";
  queueRoomCommand("join_room", { code, name: localDisplayName() });
}

function requestLeaveRoom() {
  if (!isOnlineRoomActive()) return;
  sendSocketMessage("leave_room");
  onlineState.roomCode = "";
  onlineState.hostId = "";
  onlineState.started = false;
  onlineState.players = [];
  onlineState.seatMap = [];
  onlineState.version = 0;
  onlineState.historyCount = 0;
  onlineState.saveFile = "";
  remoteSyncVersion = 0;
  setRoomStatusOverride("Left room.");
  renderRoomPanel();
  renderControls();
}

function copyRoomCode() {
  if (!isOnlineRoomActive()) return;
  const code = onlineState.roomCode;
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    setRoomStatusOverride(`Room code: ${code}`);
    renderRoomPanel();
    return;
  }
  navigator.clipboard.writeText(code).then(
    () => {
      setRoomStatusOverride("Room code copied.");
      renderRoomPanel();
    },
    () => {
      setRoomStatusOverride(`Room code: ${code}`);
      renderRoomPanel();
    }
  );
}

function requestRollbackAction() {
  if (!isOnlineGameStarted()) {
    setRoomStatusOverride("Start a room game before rolling back.");
    renderRoomPanel();
    return;
  }
  if (!isRoomHost()) {
    setRoomStatusOverride("Only the host can roll back actions.");
    renderRoomPanel();
    return;
  }
  if (onlineState.historyCount < 2) {
    setRoomStatusOverride("Need at least 2 saved actions before rollback.");
    renderRoomPanel();
    return;
  }
  const confirmed = window.confirm("Rollback to the previous saved action?");
  if (!confirmed) return;

  if (!sendSocketMessage("rollback_state")) {
    setRoomStatusOverride("Could not send rollback request.");
    renderRoomPanel();
    return;
  }
  setRoomStatusOverride("Rollback requested...");
  renderRoomPanel();
}

async function requestResumeGame() {
  if (state.phase !== "pregame") return;
  if (isOnlineRoomActive()) {
    setStatus("Leave the room first to resume a saved game.");
    render();
    return;
  }

  refs.resumeGameBtn.disabled = true;
  try {
    const resumeOptions = await collectResumeOptions();
    if (resumeOptions.length === 0) {
      throw new Error("No saved game found yet.");
    }

    const pickedValue = await showActionModal({
      title: "Resume Saved Game",
      text: "Select a game by date/time and players.",
      options: resumeOptions.map((option) => ({
        label: option.label,
        value: option.value,
      })),
      allowCancel: true,
    });
    if (!pickedValue) {
      setStatus("Resume canceled.");
      render();
      return;
    }

    const selected = resumeOptions.find((option) => option.value === pickedValue);
    if (!selected) {
      throw new Error("Invalid saved-game selection.");
    }

    let resumeSnapshot = null;
    let sourceLabel = selected.sourceLabel;
    let selectedBrowserSaveId = "";
    if (selected.value.startsWith("local:")) {
      const localId = selected.value.slice("local:".length);
      selectedBrowserSaveId = localId;
      if (localId === "legacy") {
        const legacySave = readLatestLocalStorageSave();
        if (legacySave && legacySave.gameState && typeof legacySave.gameState === "object") {
          resumeSnapshot = legacySave.gameState;
        }
      } else {
        const localSave = readBrowserSaveById(localId);
        if (localSave && localSave.gameState && typeof localSave.gameState === "object") {
          resumeSnapshot = localSave.gameState;
        }
      }
    } else if (selected.value.startsWith("server:")) {
      const saveId = selected.value.slice("server:".length);
      const payload = await fetchSavedGameById(saveId);
      if (payload && payload.gameState && typeof payload.gameState === "object") {
        resumeSnapshot = payload.gameState;
        sourceLabel = String(payload.save?.file || sourceLabel);
      }
    }

    if (!resumeSnapshot) {
      throw new Error("Could not load the selected saved game.");
    }

    if (actionModalResolver) closeActionModal(null);
    resetLocalSaveSession();
    if (selectedBrowserSaveId && selectedBrowserSaveId !== "legacy") {
      localSaveState.browserSaveId = selectedBrowserSaveId;
    }
    applySerializedGameState(resumeSnapshot);

    const resumedNames = state.players.map((player) => player.name);
    if (resumedNames.length >= 3 && resumedNames.length <= ONLINE_MAX_PLAYERS) {
      refs.playerCount.value = String(resumedNames.length);
      createNameInputs();
      const inputs = refs.nameInputs.querySelectorAll("input");
      resumedNames.forEach((name, idx) => {
        if (inputs[idx]) inputs[idx].value = name;
      });
    }

    if (sourceLabel) {
      logEvent(`Resumed game from ${sourceLabel}.`);
      setStatus(`Resumed game from ${sourceLabel}.`);
    } else {
      logEvent("Resumed saved game.");
      setStatus("Resumed saved game.");
    }
    render();
    recordGameAction("resume_game");
    void refreshLatestSaveAvailability();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resume saved game.";
    setStatus(message);
    render();
    window.alert(message);
    void refreshLatestSaveAvailability();
  }
}

function renderRoomPanel() {
  let statusText = "";
  const inRoom = isOnlineRoomActive();
  const gameInProgress = state.phase !== "pregame";
  const lobbyLocked = !inRoom && gameInProgress;
  const connectedNoRoom = onlineState.connected && !inRoom;
  const showRollbackBtn = inRoom && onlineState.started;
  refs.copyRoomCodeBtn.classList.toggle("hidden", !inRoom);
  refs.leaveRoomBtn.classList.toggle("hidden", !inRoom);
  refs.rollbackActionBtn.classList.toggle("hidden", !showRollbackBtn);
  refs.roomCodeDisplay.classList.toggle("hidden", !inRoom);
  refs.roomSaveMeta.classList.toggle("hidden", !showRollbackBtn);
  refs.roomPlayersList.classList.toggle("hidden", !inRoom || onlineState.players.length === 0);
  refs.roomCodeDisplay.textContent = inRoom ? `Code: ${onlineState.roomCode}` : "";

  refs.onlineName.disabled = inRoom || lobbyLocked;
  refs.roomCodeInput.disabled = inRoom || lobbyLocked;
  refs.createRoomBtn.disabled = inRoom || lobbyLocked;
  refs.joinRoomBtn.disabled = inRoom || lobbyLocked;
  refs.rollbackActionBtn.disabled = !showRollbackBtn || !isRoomHost() || onlineState.historyCount < 2;

  refs.playerCount.disabled = inRoom;
  refs.nameInputs.querySelectorAll("input").forEach((input) => {
    input.disabled = inRoom;
  });
  refs.turnSeconds.disabled = inRoom && !isRoomHost();

  refs.roomPlayersList.innerHTML = "";
  if (inRoom) {
    onlineState.players.forEach((player, idx) => {
      const li = document.createElement("li");
      const mine = player.id === onlineState.clientId ? " (you)" : "";
      const host = player.id === onlineState.hostId ? " [host]" : "";
      const seat = onlineState.seatMap[idx] ? ` P${idx + 1}` : "";
      const offline = player.connected === false ? " (offline)" : "";
      li.textContent = `${player.name}${mine}${host}${seat}${offline}`;
      if (player.id === onlineState.clientId) li.classList.add("current");
      refs.roomPlayersList.appendChild(li);
    });
  }

  if (showRollbackBtn) {
    const fileLabel = onlineState.saveFile || "pending";
    refs.roomSaveMeta.textContent = `Saved actions: ${onlineState.historyCount} | File: ${fileLabel}`;
  } else {
    refs.roomSaveMeta.textContent = "";
  }

  if (inRoom && !onlineState.started) {
    if (isRoomHost()) {
      if (onlineState.players.length < 3) {
        statusText = "Host: waiting for at least 3 players.";
      } else if (onlineState.players.length > ONLINE_MAX_PLAYERS) {
        statusText = "Host: max 4 players.";
      } else {
        statusText = "Host: room ready. Start game when ready.";
      }
    } else {
      statusText = "Waiting for host to start the game.";
    }
  } else if (inRoom && onlineState.started) {
    const seat = localSeatIndex();
    if (seat >= 0) {
      statusText = `Connected as Player ${seat + 1}.`;
    } else {
      statusText = "Connected as spectator.";
    }
  } else if (lobbyLocked) {
    statusText = "Online room setup is locked while a game is in progress.";
  } else if (connectedNoRoom) {
    statusText = "Connected. Create or join a room.";
  } else if (!onlineState.connected) {
    statusText = "Offline mode.";
  }

  if (roomStatusOverride) {
    statusText = roomStatusOverride;
  }
  refs.roomStatusText.textContent = statusText || "Offline mode.";
}

function parsePositiveInt(raw) {
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 1) return null;
  return num;
}

function clampTurnSeconds(raw) {
  const parsed = parsePositiveInt(raw);
  if (parsed === null) return DEFAULT_TURN_SECONDS;
  return Math.min(MAX_TURN_SECONDS, Math.max(MIN_TURN_SECONDS, parsed));
}

function randomChoice(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function shouldDisplayTurnClock() {
  if (state.turnSeconds < 1) return false;
  if (state.players.length === 0) return false;
  return state.phase === "setup" || state.phase === "main";
}

function renderTurnClock() {
  if (!refs.turnClock || !refs.turnClockText) return;
  const showClock = shouldDisplayTurnClock();
  refs.turnClock.classList.toggle("hidden", !showClock);
  refs.turnClock.setAttribute("aria-hidden", showClock ? "false" : "true");
  if (!showClock) return;

  const durationMs = Math.max(1000, state.turnSeconds * 1000);
  const remainingMs = Math.max(0, Math.min(durationMs, state.turnTimerRemainingMs));
  const progress = 1 - remainingMs / durationMs;
  const angle = Math.round(progress * 360);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const activePlayer = state.players[state.currentPlayer];

  refs.turnClock.style.setProperty("--turn-angle", `${angle}deg`);
  refs.turnClock.style.setProperty("--turn-clock-color", activePlayer ? activePlayer.color : "#f0bf62");
  refs.turnClock.classList.toggle("urgent", state.turnTimerActive && secondsLeft <= 5);
  refs.turnClockText.textContent = String(secondsLeft);
}

function clearTurnTimerInterval() {
  if (turnTimerInterval === null) return;
  window.clearInterval(turnTimerInterval);
  turnTimerInterval = null;
}

function stopTurnTimer(resetToFull = false) {
  clearTurnTimerInterval();
  state.turnTimerActive = false;
  if (resetToFull) state.turnTimerRemainingMs = state.turnSeconds * 1000;
  renderTurnClock();
}

function canRunTurnTimeoutAutomation() {
  if (state.phase !== "setup" && state.phase !== "main") return false;
  if (!isOnlineGameStarted()) return true;
  return localControlsCurrentTurn();
}

function startTurnTimerWithRemaining(remainingMs) {
  stopTurnTimer(false);
  if (!shouldDisplayTurnClock()) return;

  state.turnTimerRemainingMs = Math.max(0, Math.floor(remainingMs));
  state.turnTimerActive = true;
  state.turnTimerEndMs = Date.now() + state.turnTimerRemainingMs;
  renderTurnClock();

  turnTimerInterval = window.setInterval(() => {
    if (!state.turnTimerActive) return;
    state.turnTimerRemainingMs = Math.max(0, state.turnTimerEndMs - Date.now());
    renderTurnClock();
    if (state.turnTimerRemainingMs <= 0) {
      stopTurnTimer(false);
      if (canRunTurnTimeoutAutomation()) void handleTurnTimeout();
    }
  }, 100);
}

function restartTurnTimer() {
  startTurnTimerWithRemaining(state.turnSeconds * 1000);
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function randomDieValue() {
  return 1 + Math.floor(Math.random() * 6);
}

function randomInt(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

function dicePairForTotal(total) {
  const pairs = [];
  for (let dieA = 1; dieA <= 6; dieA += 1) {
    const dieB = total - dieA;
    if (dieB >= 1 && dieB <= 6) pairs.push([dieA, dieB]);
  }
  return pairs[Math.floor(Math.random() * pairs.length)];
}

function orientDieCube(dieEl, faceValue) {
  const [rx, ry] = DIE_FACE_ROTATIONS[faceValue] ?? DIE_FACE_ROTATIONS[1];
  dieEl.style.setProperty("--face-rx", `${rx}deg`);
  dieEl.style.setProperty("--face-ry", `${ry}deg`);
}

function setBoardDiceFaces(dieA, dieB) {
  const safeDieA = Math.min(6, Math.max(1, dieA));
  const safeDieB = Math.min(6, Math.max(1, dieB));
  refs.boardDieA.dataset.face = String(safeDieA);
  refs.boardDieB.dataset.face = String(safeDieB);
  orientDieCube(refs.boardDieA, safeDieA);
  orientDieCube(refs.boardDieB, safeDieB);
}

function configureBoardDiceThrow() {
  const stage = refs.diceRollStage;
  const rect = stage.getBoundingClientRect();
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);

  const aX = Math.round(width * (0.24 + Math.random() * 0.16));
  const bX = Math.round(width * (0.54 + Math.random() * 0.2));
  const baseY = Math.round(height * (0.28 + Math.random() * 0.12));
  const aY = baseY + Math.round(Math.random() * height * 0.08);
  const bY = baseY + Math.round(Math.random() * height * 0.08);

  const launchY = -Math.round(height * (0.56 + Math.random() * 0.2));
  const aLaunchX = -randomInt(120, 210);
  const bLaunchX = Math.round(width + randomInt(120, 210));

  stage.style.setProperty("--dice-a-x", `${aX}px`);
  stage.style.setProperty("--dice-a-y", `${aY}px`);
  stage.style.setProperty("--dice-b-x", `${bX}px`);
  stage.style.setProperty("--dice-b-y", `${bY}px`);
  stage.style.setProperty("--dice-launch-y", `${launchY}px`);
  stage.style.setProperty("--dice-a-launch-x", `${aLaunchX}px`);
  stage.style.setProperty("--dice-b-launch-x", `${bLaunchX}px`);
  stage.style.setProperty("--dice-a-r", `${randomInt(-24, 24)}deg`);
  stage.style.setProperty("--dice-b-r", `${randomInt(-24, 24)}deg`);
  stage.style.setProperty("--dice-a-pitch", `${randomInt(-12, 12)}deg`);
  stage.style.setProperty("--dice-a-yaw", `${randomInt(-20, 20)}deg`);
  stage.style.setProperty("--dice-b-pitch", `${randomInt(-12, 12)}deg`);
  stage.style.setProperty("--dice-b-yaw", `${randomInt(-20, 20)}deg`);
  stage.style.setProperty("--dice-a-spin-x", `${randomInt(1080, 1540)}deg`);
  stage.style.setProperty("--dice-a-spin-y", `${randomInt(860, 1320)}deg`);
  stage.style.setProperty("--dice-a-spin-z", `${randomInt(-80, 80)}deg`);
  stage.style.setProperty("--dice-b-spin-x", `${randomInt(1160, 1600)}deg`);
  stage.style.setProperty("--dice-b-spin-y", `${randomInt(-1360, -920)}deg`);
  stage.style.setProperty("--dice-b-spin-z", `${randomInt(-90, 90)}deg`);
  stage.style.setProperty("--dice-a-b1x", `${randomInt(-44, 44)}px`);
  stage.style.setProperty("--dice-a-b2x", `${randomInt(-28, 28)}px`);
  stage.style.setProperty("--dice-a-b3x", `${randomInt(-16, 16)}px`);
  stage.style.setProperty("--dice-a-b4x", `${randomInt(-10, 10)}px`);
  stage.style.setProperty("--dice-b-b1x", `${randomInt(-44, 44)}px`);
  stage.style.setProperty("--dice-b-b2x", `${randomInt(-28, 28)}px`);
  stage.style.setProperty("--dice-b-b3x", `${randomInt(-16, 16)}px`);
  stage.style.setProperty("--dice-b-b4x", `${randomInt(-10, 10)}px`);
  stage.style.setProperty("--dice-a-b1y", `${randomInt(56, 92)}px`);
  stage.style.setProperty("--dice-a-b2y", `${randomInt(26, 44)}px`);
  stage.style.setProperty("--dice-a-b3y", `${randomInt(10, 20)}px`);
  stage.style.setProperty("--dice-a-b4y", `${randomInt(4, 10)}px`);
  stage.style.setProperty("--dice-b-b1y", `${randomInt(56, 92)}px`);
  stage.style.setProperty("--dice-b-b2y", `${randomInt(26, 44)}px`);
  stage.style.setProperty("--dice-b-b3y", `${randomInt(10, 20)}px`);
  stage.style.setProperty("--dice-b-b4y", `${randomInt(4, 10)}px`);

  stage.classList.remove("rolling");
  void stage.offsetWidth;
  stage.classList.add("rolling");
}

function updateSetupCardVisibility() {
  const gameStarted = state.phase !== "pregame";
  refs.setupFields.classList.toggle("hidden", gameStarted);
  refs.startBtn.classList.toggle("hidden", gameStarted);
  refs.resumeGameBtn.classList.toggle("hidden", gameStarted);
  refs.restartBtn.classList.toggle("hidden", !gameStarted);
}

function closeActionModal(result = null) {
  if (!actionModalResolver) return;
  const resolve = actionModalResolver;
  actionModalResolver = null;

  refs.actionModal.classList.add("hidden");
  refs.actionModal.setAttribute("aria-hidden", "true");
  refs.actionModalTitle.textContent = "";
  refs.actionModalText.textContent = "";
  refs.actionModalOptions.innerHTML = "";
  resolve(result);
}

function showActionModal({ title, text, options, allowCancel = false }) {
  if (actionModalResolver) closeActionModal(null);

  refs.actionModalTitle.textContent = title;
  refs.actionModalText.textContent = text;
  refs.actionModalOptions.innerHTML = "";
  refs.actionModalCancelBtn.classList.toggle("hidden", !allowCancel);

  for (const option of options) {
    const btn = document.createElement("button");
    btn.className = "action-option";
    btn.textContent = option.label;
    btn.addEventListener("click", () => closeActionModal(option.value));
    refs.actionModalOptions.appendChild(btn);
  }

  refs.actionModal.classList.remove("hidden");
  refs.actionModal.setAttribute("aria-hidden", "false");

  return new Promise((resolve) => {
    actionModalResolver = resolve;
  });
}

function currentPlayerObj() {
  return state.players[state.currentPlayer];
}

function victoryPoints(player) {
  return player.settlements.size + player.cities.size * 2;
}

function resourceCount(player) {
  return RESOURCES.reduce((sum, res) => sum + player.hand[res], 0);
}

function canAfford(player, cost) {
  return Object.entries(cost).every(([res, amt]) => player.hand[res] >= amt);
}

function hasAnyBuildByResources(player) {
  return canAfford(player, COST.road) || canAfford(player, COST.settlement) || canAfford(player, COST.city);
}

function hasBankTradeOption(player) {
  return RESOURCES.some((res) => player.hand[res] >= 4);
}

function hasPlayerTradeOption(playerIdx) {
  const player = state.players[playerIdx];
  if (!player || resourceCount(player) === 0) return false;
  for (let idx = 0; idx < state.players.length; idx += 1) {
    if (idx === playerIdx) continue;
    if (resourceCount(state.players[idx]) > 0) return true;
  }
  return false;
}

function turnContextText(player) {
  if (!player) return "Set players and start.";
  if (state.phase === "setup") {
    return state.setup?.expecting === "road"
      ? `${player.name}: place an adjacent road.`
      : `${player.name}: select a settlement corner, then click again to confirm.`;
  }
  if (state.phase === "gameover") return `${player.name} won the game.`;
  if (state.phase !== "main") return "Set players and start.";
  if (!state.hasRolled) return `${player.name}: roll dice.`;
  if (state.pendingRobberMove) return `${player.name}: move the robber.`;
  return `${player.name}: choose build/trade actions, then end turn.`;
}

function turnBadgeText(player) {
  if (!player) return "Start a game";
  if (state.phase === "setup") return `${player.name} | Setup`;
  if (state.phase === "gameover") return `${player.name} | Winner`;
  if (state.phase !== "main") return `${player.name} | Waiting`;
  if (!state.hasRolled) return `${player.name} | Roll Dice`;
  if (state.pendingRobberMove) return `${player.name} | Move Robber`;
  return `${player.name} | Actions`;
}

function payCost(player, cost) {
  for (const [res, amt] of Object.entries(cost)) player.hand[res] -= amt;
}

function addResources(player, gains) {
  for (const [res, amt] of Object.entries(gains)) player.hand[res] += amt;
}

function nodeNeighbors(nodeIdx) {
  const node = state.nodes[nodeIdx];
  const out = new Set();
  for (const edgeIdx of node.edges) {
    const edge = state.edges[edgeIdx];
    out.add(edge.a === nodeIdx ? edge.b : edge.a);
  }
  return out;
}

function distanceRuleOk(nodeIdx) {
  const neighbors = nodeNeighbors(nodeIdx);
  for (const nbr of neighbors) {
    if (state.nodes[nbr].owner !== null) return false;
  }
  return true;
}

function hasConnectedRoad(playerIdx, nodeIdx) {
  for (const edgeIdx of state.nodes[nodeIdx].edges) {
    if (state.edges[edgeIdx].owner === playerIdx) return true;
  }
  return false;
}

function canBuildRoad(playerIdx, edgeIdx, setupNode = null) {
  if (edgeIdx < 0 || edgeIdx >= state.edges.length) return { ok: false, reason: "Invalid edge." };
  const edge = state.edges[edgeIdx];
  if (edge.owner !== null) return { ok: false, reason: "Road already exists there." };

  if (setupNode !== null) {
    if (edge.a === setupNode || edge.b === setupNode) return { ok: true };
    return { ok: false, reason: "Setup road must touch your new settlement." };
  }

  const endpoints = [edge.a, edge.b];
  for (const nodeIdx of endpoints) {
    const node = state.nodes[nodeIdx];
    if (node.owner === playerIdx) return { ok: true };
    for (const otherEdgeIdx of node.edges) {
      if (state.edges[otherEdgeIdx].owner === playerIdx) return { ok: true };
    }
  }
  return { ok: false, reason: "Road must connect to your road or building." };
}

function canBuildSettlement(playerIdx, nodeIdx, setup = false) {
  if (nodeIdx < 0 || nodeIdx >= state.nodes.length) return { ok: false, reason: "Invalid node." };
  const node = state.nodes[nodeIdx];
  if (node.owner !== null) return { ok: false, reason: "That corner is already occupied." };
  if (!distanceRuleOk(nodeIdx)) return { ok: false, reason: "Distance rule violation." };
  if (!setup && !hasConnectedRoad(playerIdx, nodeIdx)) {
    return { ok: false, reason: "Settlement must connect to one of your roads." };
  }
  return { ok: true };
}

function canBuildCity(playerIdx, nodeIdx) {
  if (nodeIdx < 0 || nodeIdx >= state.nodes.length) return { ok: false, reason: "Invalid node." };
  const node = state.nodes[nodeIdx];
  if (node.owner !== playerIdx) return { ok: false, reason: "You do not own this settlement." };
  if (node.isCity) return { ok: false, reason: "That is already a city." };
  return { ok: true };
}

function checkVictory(playerIdx) {
  const player = state.players[playerIdx];
  if (victoryPoints(player) < 10) return false;
  state.phase = "gameover";
  state.pendingRobberMove = false;
  stopTurnTimer(true);
  setStatus(`${player.name} wins with 10+ victory points.`);
  logEvent(`${player.name} wins the game.`);
  return true;
}

function buildRoad(playerIdx, edgeIdx, options = {}) {
  const free = options.free === true;
  const setupNode = options.setupNode ?? null;
  const verdict = canBuildRoad(playerIdx, edgeIdx, setupNode);
  if (!verdict.ok) {
    setStatus(verdict.reason);
    return false;
  }
  const player = state.players[playerIdx];
  if (!free) {
    if (!canAfford(player, COST.road)) {
      setStatus("Not enough resources for road.");
      return false;
    }
    payCost(player, COST.road);
  }
  state.edges[edgeIdx].owner = playerIdx;
  player.roads.add(edgeIdx);
  logEvent(`${player.name} built a road.`);
  setStatus(`${player.name} built road on edge ${edgeIdx}.`);
  return true;
}

function buildSettlement(playerIdx, nodeIdx, options = {}) {
  const free = options.free === true;
  const setup = options.setup === true;
  const verdict = canBuildSettlement(playerIdx, nodeIdx, setup);
  if (!verdict.ok) {
    setStatus(verdict.reason);
    return false;
  }
  const player = state.players[playerIdx];
  if (!free) {
    if (!canAfford(player, COST.settlement)) {
      setStatus("Not enough resources for settlement.");
      return false;
    }
    payCost(player, COST.settlement);
  }
  const node = state.nodes[nodeIdx];
  node.owner = playerIdx;
  node.isCity = false;
  player.settlements.add(nodeIdx);
  logEvent(`${player.name} built a settlement.`);
  setStatus(`${player.name} built settlement on node ${nodeIdx}.`);
  checkVictory(playerIdx);
  return true;
}

function buildCity(playerIdx, nodeIdx) {
  const verdict = canBuildCity(playerIdx, nodeIdx);
  if (!verdict.ok) {
    setStatus(verdict.reason);
    return false;
  }
  const player = state.players[playerIdx];
  if (!canAfford(player, COST.city)) {
    setStatus("Not enough resources for city.");
    return false;
  }
  payCost(player, COST.city);
  const node = state.nodes[nodeIdx];
  node.isCity = true;
  player.settlements.delete(nodeIdx);
  player.cities.add(nodeIdx);
  logEvent(`${player.name} upgraded to a city.`);
  setStatus(`${player.name} upgraded node ${nodeIdx} to a city.`);
  checkVictory(playerIdx);
  return true;
}

function gainStartingResources(playerIdx, nodeIdx) {
  const player = state.players[playerIdx];
  const gains = resourceMap(0);
  for (const tileIdx of state.nodes[nodeIdx].hexes) {
    const tile = state.tiles[tileIdx];
    if (tile.resource !== "desert") gains[tile.resource] += 1;
  }
  addResources(player, gains);
}

function distributeResources(roll) {
  const gains = state.players.map(() => resourceMap(0));

  for (const tile of state.tiles) {
    if (tile.resource === "desert") continue;
    if (tile.idx === state.robberTile) continue;
    if (tile.number !== roll) continue;

    for (const nodeIdx of tile.nodes) {
      const node = state.nodes[nodeIdx];
      if (node.owner === null) continue;
      gains[node.owner][tile.resource] += node.isCity ? 2 : 1;
    }
  }

  for (let i = 0; i < state.players.length; i += 1) addResources(state.players[i], gains[i]);

  const summary = state.players
    .map((p, idx) => {
      const parts = RESOURCES.filter((res) => gains[idx][res] > 0).map((res) => `${gains[idx][res]} ${res}`);
      return parts.length > 0 ? `${p.name}: ${parts.join(", ")}` : null;
    })
    .filter(Boolean);

  if (summary.length > 0) {
    logEvent(`Production on ${roll}: ${summary.join(" | ")}`);
    setStatus(`Resources distributed for roll ${roll}.`);
  } else {
    logEvent(`Production on ${roll}: no resources generated.`);
    setStatus(`No resources generated on roll ${roll}.`);
  }
}

async function chooseDiscardResource(player, toDiscard) {
  let remaining = toDiscard;
  while (remaining > 0) {
    if (state.turnTimeoutBusy) {
      discardRandomResources(player, remaining);
      remaining = 0;
      break;
    }
    const options = RESOURCES.filter((res) => player.hand[res] > 0).map((res) => ({
      label: `${res[0].toUpperCase() + res.slice(1)} (${player.hand[res]})`,
      value: res,
    }));
    const picked = await showActionModal({
      title: `${player.name} Must Discard`,
      text: `Choose ${remaining} more card(s) to discard.`,
      options,
    });
    if (!picked) continue;
    player.hand[picked] -= 1;
    remaining -= 1;
    render();
  }
}

async function handleRollSeven() {
  for (const player of state.players) {
    const total = resourceCount(player);
    if (total <= 7) continue;
    const toDiscard = Math.floor(total / 2);
    await chooseDiscardResource(player, toDiscard);
    logEvent(`${player.name} discarded ${toDiscard} card(s).`);
  }
  state.pendingRobberMove = true;
  state.mode = "robber";
  setStatus("Rolled 7: click a tile to move the robber.");
}

function discardRandomResources(player, amount) {
  for (let i = 0; i < amount; i += 1) {
    const options = RESOURCES.filter((res) => player.hand[res] > 0);
    const picked = randomChoice(options);
    if (!picked) break;
    player.hand[picked] -= 1;
  }
}

function autoMoveRobberForPlayer(playerIdx) {
  const tileChoices = state.tiles.map((tile) => tile.idx).filter((idx) => idx !== state.robberTile);
  const newRobberTile = randomChoice(tileChoices);
  if (newRobberTile === null || newRobberTile === undefined) return;

  state.robberTile = newRobberTile;
  const victims = new Set();
  for (const nodeIdx of state.tiles[newRobberTile].nodes) {
    const owner = state.nodes[nodeIdx].owner;
    if (owner !== null && owner !== playerIdx && resourceCount(state.players[owner]) > 0) victims.add(owner);
  }

  const victimIdx = randomChoice(Array.from(victims));
  if (victimIdx !== null && victimIdx !== undefined) {
    const stolen = stealRandomResource(victimIdx, playerIdx);
    if (stolen) {
      logEvent(`${state.players[playerIdx].name} stole ${stolen} from ${state.players[victimIdx].name} (timer auto).`);
      return;
    }
  }
  logEvent(`${state.players[playerIdx].name} moved robber (timer auto, no victim).`);
}

function handleRollSevenAuto(rollerIdx) {
  for (const player of state.players) {
    const total = resourceCount(player);
    if (total <= 7) continue;
    const toDiscard = Math.floor(total / 2);
    discardRandomResources(player, toDiscard);
    logEvent(`${player.name} discarded ${toDiscard} card(s) (timer auto).`);
  }

  autoMoveRobberForPlayer(rollerIdx);
  state.pendingRobberMove = false;
  state.mode = "none";
  setStatus("Rolled 7: robber resolved automatically.");
}

async function pickVictim(victims) {
  if (victims.length === 1) return victims[0];
  while (true) {
    if (state.turnTimeoutBusy) return victims[0];
    const picked = await showActionModal({
      title: "Choose Robber Victim",
      text: "Pick a player to steal from.",
      options: victims.map((idx) => ({
        label: `${state.players[idx].name} (${resourceCount(state.players[idx])} cards)`,
        value: String(idx),
      })),
      allowCancel: true,
    });
    if (picked !== null) return Number(picked);
  }
}

function stealRandomResource(fromIdx, toIdx) {
  const victim = state.players[fromIdx];
  const bag = [];
  for (const res of RESOURCES) {
    for (let i = 0; i < victim.hand[res]; i += 1) bag.push(res);
  }
  if (bag.length === 0) return null;
  const stolen = bag[Math.floor(Math.random() * bag.length)];
  victim.hand[stolen] -= 1;
  state.players[toIdx].hand[stolen] += 1;
  return stolen;
}

async function moveRobber(playerIdx, tileIdx) {
  if (tileIdx < 0 || tileIdx >= state.tiles.length) return false;
  if (tileIdx === state.robberTile) {
    setStatus("Robber is already on that tile.");
    return false;
  }
  state.robberTile = tileIdx;

  const victims = new Set();
  for (const nodeIdx of state.tiles[tileIdx].nodes) {
    const owner = state.nodes[nodeIdx].owner;
    if (owner !== null && owner !== playerIdx && resourceCount(state.players[owner]) > 0) victims.add(owner);
  }

  const victimList = Array.from(victims);
  if (victimList.length === 0) {
    logEvent(`${state.players[playerIdx].name} moved the robber (no victim).`);
    setStatus("Robber moved. No available player to steal from.");
    return true;
  }

  const victimIdx = await pickVictim(victimList);
  const stolen = stealRandomResource(victimIdx, playerIdx);
  if (stolen) {
    logEvent(`${state.players[playerIdx].name} stole ${stolen} from ${state.players[victimIdx].name}.`);
    setStatus(`${state.players[playerIdx].name} stole ${stolen}.`);
  } else {
    setStatus("Victim had no resources to steal.");
  }
  return true;
}

function setupRoadOptionsForNode(playerIdx, nodeIdx) {
  const node = state.nodes[nodeIdx];
  if (!node) return [];
  const options = [];
  for (const edgeIdx of node.edges) {
    if (canBuildRoad(playerIdx, edgeIdx, nodeIdx).ok) options.push(edgeIdx);
  }
  return options;
}

function randomSetupPlacementPair(playerIdx) {
  const nodeOrder = shuffle(state.nodes.map((_, idx) => idx));
  for (const nodeIdx of nodeOrder) {
    if (!canBuildSettlement(playerIdx, nodeIdx, true).ok) continue;
    const roadOptions = setupRoadOptionsForNode(playerIdx, nodeIdx);
    if (roadOptions.length === 0) continue;
    return { nodeIdx, edgeIdx: randomChoice(roadOptions) };
  }
  return null;
}

function autoCompleteSetupTurn() {
  const setup = state.setup;
  if (!setup) return false;

  const playerIdx = state.currentPlayer;
  const playerName = state.players[playerIdx].name;

  if (setup.expecting === "road" && setup.lastSettlementNode !== null) {
    const roadOptions = setupRoadOptionsForNode(playerIdx, setup.lastSettlementNode);
    const edgeIdx = randomChoice(roadOptions);
    if (edgeIdx === null || edgeIdx === undefined) return false;
    if (!buildRoad(playerIdx, edgeIdx, { free: true, setupNode: setup.lastSettlementNode })) return false;
    if (setup.turnIndex >= state.players.length) {
      gainStartingResources(playerIdx, setup.lastSettlementNode);
      logEvent(`${playerName} gained starting resources.`);
    }
    logEvent(`${playerName} timed out. Road auto-placed.`);
    setStatus(`${playerName} timed out. Road auto-placed.`);
    advanceSetup();
    return true;
  }

  if (setup.expecting !== "settlement") return false;
  const placement = randomSetupPlacementPair(playerIdx);
  if (!placement) return false;

  if (!buildSettlement(playerIdx, placement.nodeIdx, { free: true, setup: true })) return false;
  setup.selectedSettlementNode = null;
  setup.expecting = "road";
  setup.lastSettlementNode = placement.nodeIdx;
  if (!buildRoad(playerIdx, placement.edgeIdx, { free: true, setupNode: placement.nodeIdx })) return false;

  if (setup.turnIndex >= state.players.length) {
    gainStartingResources(playerIdx, placement.nodeIdx);
    logEvent(`${playerName} gained starting resources.`);
  }
  logEvent(`${playerName} timed out. Settlement + road auto-placed.`);
  setStatus(`${playerName} timed out. Setup auto-placed.`);
  advanceSetup();
  return true;
}

async function handleTurnTimeout() {
  if (!canRunTurnTimeoutAutomation()) return;
  if (state.turnTimeoutBusy) return;
  state.turnTimeoutBusy = true;
  if (actionModalResolver) closeActionModal(null);

  try {
    if (state.phase === "setup") {
      if (!autoCompleteSetupTurn()) {
        setStatus(`${currentPlayerObj().name}: timer expired, but no valid setup auto-placement.`);
        restartTurnTimer();
      }
      render();
      recordGameAction("turn_timeout");
      return;
    }

    if (state.phase !== "main" || state.phase === "gameover") return;

    const timedOutPlayerName = currentPlayerObj().name;
    if (state.isRollingDice) {
      while (state.isRollingDice) await delay(90);
      if (state.phase !== "main" || state.phase === "gameover") return;
    }

    if (!state.hasRolled) {
      logEvent(`${timedOutPlayerName} timed out. Auto-rolling.`);
      await rollDice({ auto: true });
    } else if (state.pendingRobberMove) {
      autoMoveRobberForPlayer(state.currentPlayer);
      state.pendingRobberMove = false;
      state.mode = "none";
      logEvent(`${timedOutPlayerName} timed out. Robber resolved automatically.`);
    } else {
      logEvent(`${timedOutPlayerName} timed out.`);
    }

    if (state.phase === "main" && !state.pendingRobberMove && !state.isRollingDice) {
      setStatus(`${timedOutPlayerName} timed out. Turn passed.`);
      endTurn();
    } else {
      if (state.phase === "main" && !state.turnTimerActive) restartTurnTimer();
      render();
      recordGameAction("turn_timeout");
    }
  } finally {
    state.turnTimeoutBusy = false;
  }
}

function startMainPhase() {
  state.phase = "main";
  state.currentPlayer = 0;
  state.hasRolled = false;
  state.isRollingDice = false;
  state.rollingDiceValue = null;
  state.rollResultPopupValue = null;
  state.rollHistogram = emptyRollHistogram();
  state.rollCountTotal = 0;
  state.histogramOpen = false;
  state.turnTimeoutBusy = false;
  state.turnTimerRemainingMs = state.turnSeconds * 1000;
  state.pendingRobberMove = false;
  state.mode = "none";
  state.tradeMenuOpen = false;
  state.setup = null;
  setStatus(`${currentPlayerObj().name}'s turn. Roll dice.`);
  logEvent("Setup complete. Main game begins.");
  restartTurnTimer();
}

function advanceSetup() {
  const setup = state.setup;
  setup.turnIndex += 1;
  if (setup.turnIndex >= setup.order.length) {
    startMainPhase();
    return;
  }
  state.currentPlayer = setup.order[setup.turnIndex];
  setup.expecting = "settlement";
  setup.lastSettlementNode = null;
  setup.selectedSettlementNode = null;
  setStatus(`${currentPlayerObj().name}: select settlement, then click again to confirm.`);
  restartTurnTimer();
}

function beginSetup(players) {
  const order = [...Array(players.length).keys()];
  state.setup = {
    order: order.concat(order.slice().reverse()),
    turnIndex: 0,
    expecting: "settlement",
    lastSettlementNode: null,
    selectedSettlementNode: null,
  };
  state.phase = "setup";
  state.currentPlayer = state.setup.order[0];
  state.round = 1;
  state.hasRolled = false;
  state.isRollingDice = false;
  state.rollingDiceValue = null;
  state.rollResultPopupValue = null;
  state.rollHistogram = emptyRollHistogram();
  state.rollCountTotal = 0;
  state.histogramOpen = false;
  state.turnTimeoutBusy = false;
  state.turnTimerRemainingMs = state.turnSeconds * 1000;
  state.pendingRobberMove = false;
  state.diceResult = null;
  state.mode = "none";
  state.tradeMenuOpen = false;
  setStatus(`${currentPlayerObj().name}: select settlement, then click again to confirm.`);
  logEvent("Setup started.");
  restartTurnTimer();
}

function startGame(options = {}) {
  const fromRoom = options.fromRoom === true;
  const providedNames = Array.isArray(options.playerNames) ? options.playerNames : null;
  const shouldSync = options.sync !== false;

  if (isOnlineRoomActive() && !fromRoom) {
    if (!isRoomHost()) {
      setStatus("Only the room host can start.");
      render();
      return;
    }
    if (onlineState.players.length < 3 || onlineState.players.length > ONLINE_MAX_PLAYERS) {
      setStatus("Online rooms require 3-4 players.");
      render();
      return;
    }
    state.turnSeconds = clampTurnSeconds(refs.turnSeconds.value);
    refs.turnSeconds.value = String(state.turnSeconds);
    onlineState.started = true;
    onlineState.seatMap = onlineState.players.map((player) => player.id);
    remoteSyncVersion = 0;
    if (!sendSocketMessage("start_game", { turnSeconds: state.turnSeconds })) {
      onlineState.started = false;
      setStatus("Unable to start room game: socket is not connected.");
      render();
      return;
    }
    startGame({
      fromRoom: true,
      playerNames: onlineState.players.map((player) => player.name),
      sync: true,
    });
    return;
  }

  const playerCount = providedNames ? providedNames.length : Number(refs.playerCount.value);
  if (playerCount < 3 || playerCount > ONLINE_MAX_PLAYERS) {
    setStatus("This prototype supports 3-4 players.");
    render();
    return;
  }

  state.turnSeconds = clampTurnSeconds(refs.turnSeconds.value);
  refs.turnSeconds.value = String(state.turnSeconds);
  state.turnTimerRemainingMs = state.turnSeconds * 1000;
  state.turnTimeoutBusy = false;
  state.histogramOpen = false;
  stopTurnTimer(true);
  const names = [];
  if (providedNames) {
    for (let i = 0; i < playerCount; i += 1) {
      names.push(sanitizePlayerName(providedNames[i], `Player ${i + 1}`));
    }
  } else {
    const inputs = refs.nameInputs.querySelectorAll("input");
    for (let i = 0; i < playerCount; i += 1) {
      const name = sanitizePlayerName(inputs[i]?.value, `Player ${i + 1}`);
      names.push(name);
    }
  }

  state.players = names.map((name, idx) => ({
    name,
    color: PLAYER_COLORS[idx],
    hand: resourceMap(0),
    roads: new Set(),
    settlements: new Set(),
    cities: new Set(),
  }));
  state.tradeMenuOpen = false;

  buildBoard();
  state.log = [];
  logEvent(`New game: ${names.join(", ")}.`);
  beginSetup(state.players);
  resetLocalSaveSession();
  if (!isOnlineGameStarted()) {
    void startLocalSaveSession({ reason: "local_game_start" });
  }
  render();

  if (shouldSync || !isOnlineGameStarted()) recordGameAction("game_start");
}

function restartGame() {
  if (state.phase === "pregame") return;
  if (isOnlineRoomActive() && !isRoomHost()) {
    setStatus("Only the host can restart this room game.");
    render();
    return;
  }
  const confirmed = window.confirm("Restart the current game? All progress will be lost.");
  if (!confirmed) return;

  if (actionModalResolver) closeActionModal(null);

  const existingNames = state.players.map((player) => player.name);
  if (existingNames.length >= 3 && existingNames.length <= 4) {
    refs.playerCount.value = String(existingNames.length);
    createNameInputs();
    const inputs = refs.nameInputs.querySelectorAll("input");
    existingNames.forEach((name, idx) => {
      if (inputs[idx]) inputs[idx].value = name;
    });
  }

  if (isOnlineRoomActive()) {
    startGame({
      fromRoom: true,
      playerNames: onlineState.players.map((player) => player.name),
      sync: true,
    });
    return;
  }
  startGame({ sync: false });
}

function buildBoard() {
  const coords = shuffle(axialHexes(BOARD_RADIUS));

  const resources = [];
  for (const [res, count] of Object.entries(RESOURCE_COUNTS)) {
    for (let i = 0; i < count; i += 1) resources.push(res);
  }
  const shuffledResources = shuffle(resources);
  const numbersByTile = assignNumbersWithConstraints(coords, shuffledResources);

  state.tiles = [];
  state.nodes = [];
  state.edges = [];
  state.robberTile = -1;

  const nodeByPoint = new Map();
  const edgeByPair = new Map();

  for (let i = 0; i < coords.length; i += 1) {
    const { q, r } = coords[i];
    const resource = shuffledResources[i];
    const number = resource === "desert" ? null : numbersByTile[i];
    const center = hexCenter(q, r);
    const corners = [];
    const nodeIds = [];

    for (let c = 0; c < 6; c += 1) {
      const angle = ((60 * c + 30) * Math.PI) / 180;
      const x = center.x + HEX_SIZE * Math.cos(angle);
      const y = center.y + HEX_SIZE * Math.sin(angle);
      corners.push({ x, y });
      const key = pointKey(x, y);
      if (!nodeByPoint.has(key)) {
        const nodeIdx = state.nodes.length;
        nodeByPoint.set(key, nodeIdx);
        state.nodes.push({
          idx: nodeIdx,
          x,
          y,
          hexes: [],
          edges: new Set(),
          owner: null,
          isCity: false,
        });
      }
      const nodeIdx = nodeByPoint.get(key);
      nodeIds.push(nodeIdx);
      state.nodes[nodeIdx].hexes.push(i);
    }

    state.tiles.push({
      idx: i,
      q,
      r,
      resource,
      number,
      cx: center.x,
      cy: center.y,
      corners,
      nodes: nodeIds,
    });

    if (resource === "desert") state.robberTile = i;

    for (let c = 0; c < 6; c += 1) {
      const a = nodeIds[c];
      const b = nodeIds[(c + 1) % 6];
      const pair = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!edgeByPair.has(pair)) {
        const edgeIdx = state.edges.length;
        edgeByPair.set(pair, edgeIdx);
        state.edges.push({ idx: edgeIdx, a: Math.min(a, b), b: Math.max(a, b), owner: null });
        state.nodes[a].edges.add(edgeIdx);
        state.nodes[b].edges.add(edgeIdx);
      }
    }
  }

  const xs = state.nodes.map((n) => n.x);
  const ys = state.nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  state.geometry = {
    minX,
    minY,
    width: maxX - minX + BOARD_PADDING * 2,
    height: maxY - minY + BOARD_PADDING * 2,
  };
}

function sx(x) {
  return x - state.geometry.minX + BOARD_PADDING;
}

function sy(y) {
  return y - state.geometry.minY + BOARD_PADDING;
}

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function appendResourceIconShapes(container, resource) {
  if (resource === "wood") {
    container.appendChild(el("circle", { cx: -4, cy: -1, r: 6, fill: "#3f6a30" }));
    container.appendChild(el("circle", { cx: 4, cy: -4, r: 7, fill: "#4f7d3e" }));
    container.appendChild(el("rect", { x: -2, y: 3, width: 4, height: 10, rx: 1, fill: "#6b4324" }));
  } else if (resource === "brick") {
    container.appendChild(el("rect", { x: -11, y: -8, width: 10, height: 6, rx: 1, fill: "#c97755" }));
    container.appendChild(el("rect", { x: 1, y: -8, width: 10, height: 6, rx: 1, fill: "#be6b49" }));
    container.appendChild(el("rect", { x: -5, y: 0, width: 10, height: 6, rx: 1, fill: "#d18463" }));
  } else if (resource === "sheep") {
    container.appendChild(el("ellipse", { cx: -3, cy: -1, rx: 7, ry: 5, fill: "#fbf9f2" }));
    container.appendChild(el("ellipse", { cx: 4, cy: -2, rx: 6, ry: 4.5, fill: "#fbf9f2" }));
    container.appendChild(el("circle", { cx: 8, cy: 2, r: 3.2, fill: "#dddbc9" }));
    container.appendChild(el("circle", { cx: 9.5, cy: 2, r: 0.9, fill: "#2a241d", stroke: "none" }));
  } else if (resource === "wheat") {
    container.appendChild(el("line", { x1: -6, y1: 8, x2: -4, y2: -8, stroke: "#6f5a1e" }));
    container.appendChild(el("line", { x1: 0, y1: 9, x2: 0, y2: -9, stroke: "#6f5a1e" }));
    container.appendChild(el("line", { x1: 6, y1: 8, x2: 4, y2: -8, stroke: "#6f5a1e" }));
    container.appendChild(el("circle", { cx: -4, cy: -7, r: 1.7, fill: "#f3da7a" }));
    container.appendChild(el("circle", { cx: 0, cy: -8, r: 1.7, fill: "#f3da7a" }));
    container.appendChild(el("circle", { cx: 4, cy: -7, r: 1.7, fill: "#f3da7a" }));
    container.appendChild(el("circle", { cx: -3, cy: -3, r: 1.7, fill: "#f3da7a" }));
    container.appendChild(el("circle", { cx: 0, cy: -4, r: 1.7, fill: "#f3da7a" }));
    container.appendChild(el("circle", { cx: 3, cy: -3, r: 1.7, fill: "#f3da7a" }));
  } else if (resource === "ore") {
    container.appendChild(el("polygon", { points: "-11,8 -4,-6 3,8", fill: "#8f949f" }));
    container.appendChild(el("polygon", { points: "-1,8 7,-8 13,8", fill: "#767d89" }));
    container.appendChild(el("circle", { cx: 3, cy: 0, r: 1.6, fill: "#bcc2cc", stroke: "none" }));
  } else if (resource === "desert") {
    container.appendChild(el("circle", { cx: 0, cy: 0, r: 5, fill: "#f3d574" }));
    container.appendChild(el("line", { x1: 0, y1: -10, x2: 0, y2: -6, stroke: "#6f5a1e" }));
    container.appendChild(el("line", { x1: 0, y1: 10, x2: 0, y2: 6, stroke: "#6f5a1e" }));
    container.appendChild(el("line", { x1: -10, y1: 0, x2: -6, y2: 0, stroke: "#6f5a1e" }));
    container.appendChild(el("line", { x1: 10, y1: 0, x2: 6, y2: 0, stroke: "#6f5a1e" }));
    container.appendChild(el("line", { x1: -7, y1: -7, x2: -4, y2: -4, stroke: "#6f5a1e" }));
    container.appendChild(el("line", { x1: 7, y1: -7, x2: 4, y2: -4, stroke: "#6f5a1e" }));
    container.appendChild(el("line", { x1: -7, y1: 7, x2: -4, y2: 4, stroke: "#6f5a1e" }));
    container.appendChild(el("line", { x1: 7, y1: 7, x2: 4, y2: 4, stroke: "#6f5a1e" }));
  }
}

function createResourceIconSvg(resource) {
  const svg = el("svg", {
    viewBox: "-14 -14 28 28",
    class: "resource-mini-svg",
    "aria-hidden": "true",
    focusable: "false",
  });
  const g = el("g", { class: "resource-icon resource-mini-icon" });
  appendResourceIconShapes(g, resource);
  svg.appendChild(g);
  return svg;
}

function appendResourceIcon(layer, tile) {
  const g = el("g", {
    class: "resource-icon",
    transform: `translate(${sx(tile.cx)} ${sy(tile.cy) - 35})`,
  });
  appendResourceIconShapes(g, tile.resource);

  layer.appendChild(g);
}

function isClickableNode(nodeIdx) {
  if (isOnlineGameStarted() && !localControlsCurrentTurn()) return false;
  if (state.phase === "setup") {
    const setup = state.setup;
    if (!setup || setup.expecting !== "settlement") return false;
    return canBuildSettlement(state.currentPlayer, nodeIdx, true).ok;
  }
  if (state.phase !== "main" || state.phase === "gameover") return false;
  if (!state.hasRolled || state.pendingRobberMove) return false;
  if (state.mode === "settlement") return canBuildSettlement(state.currentPlayer, nodeIdx, false).ok;
  if (state.mode === "city") return canBuildCity(state.currentPlayer, nodeIdx).ok;
  return false;
}

function isClickableEdge(edgeIdx) {
  if (isOnlineGameStarted() && !localControlsCurrentTurn()) return false;
  if (state.phase === "setup") {
    const setup = state.setup;
    if (!setup || setup.expecting !== "road" || setup.lastSettlementNode === null) return false;
    return canBuildRoad(state.currentPlayer, edgeIdx, setup.lastSettlementNode).ok;
  }
  if (state.phase !== "main" || state.phase === "gameover") return false;
  if (!state.hasRolled || state.pendingRobberMove || state.mode !== "road") return false;
  return canBuildRoad(state.currentPlayer, edgeIdx).ok;
}

function isClickableTile(tileIdx) {
  if (isOnlineGameStarted() && !localControlsCurrentTurn()) return false;
  if (state.phase !== "main" || state.phase === "gameover") return false;
  if (!(state.pendingRobberMove || state.mode === "robber")) return false;
  return tileIdx !== state.robberTile;
}

function onNodeClick(nodeIdx) {
  if (!assertLocalTurnControl()) return;

  if (state.phase === "setup") {
    const setup = state.setup;
    if (!setup || setup.expecting !== "settlement") return;
    const verdict = canBuildSettlement(state.currentPlayer, nodeIdx, true);
    if (!verdict.ok) {
      setStatus(verdict.reason);
      render();
      return;
    }

    if (setup.selectedSettlementNode !== nodeIdx) {
      setup.selectedSettlementNode = nodeIdx;
      setStatus(`${currentPlayerObj().name}: settlement selected. Click again to confirm.`);
      render();
      return;
    }

    if (buildSettlement(state.currentPlayer, nodeIdx, { free: true, setup: true })) {
      setup.selectedSettlementNode = null;
      setup.expecting = "road";
      setup.lastSettlementNode = nodeIdx;
      setStatus(`${currentPlayerObj().name}: place adjacent road.`);
      recordGameAction("setup_settlement");
    }
    render();
    return;
  }

  if (state.phase !== "main") return;
  if (!state.hasRolled) {
    setStatus("Roll dice first.");
    render();
    return;
  }
  if (state.pendingRobberMove) {
    setStatus("Move robber first.");
    render();
    return;
  }

  let changed = false;
  if (state.mode === "settlement") {
    changed = buildSettlement(state.currentPlayer, nodeIdx);
  } else if (state.mode === "city") {
    changed = buildCity(state.currentPlayer, nodeIdx);
  }
  render();
  if (changed) recordGameAction(state.mode === "city" ? "build_city" : "build_settlement");
}

function onEdgeClick(edgeIdx) {
  if (!assertLocalTurnControl()) return;

  if (state.phase === "setup") {
    const setup = state.setup;
    if (!setup || setup.expecting !== "road" || setup.lastSettlementNode === null) return;
    const nodeIdx = setup.lastSettlementNode;
    if (buildRoad(state.currentPlayer, edgeIdx, { free: true, setupNode: nodeIdx })) {
      if (setup.turnIndex >= state.players.length) {
        gainStartingResources(state.currentPlayer, nodeIdx);
        logEvent(`${currentPlayerObj().name} gained starting resources.`);
      }
      advanceSetup();
      recordGameAction("setup_road");
    }
    render();
    return;
  }

  if (state.phase !== "main" || state.mode !== "road") return;
  if (!state.hasRolled) {
    setStatus("Roll dice first.");
    render();
    return;
  }
  if (state.pendingRobberMove) {
    setStatus("Move robber first.");
    render();
    return;
  }
  const changed = buildRoad(state.currentPlayer, edgeIdx);
  render();
  if (changed) recordGameAction("build_road");
}

async function onTileClick(tileIdx) {
  if (!assertLocalTurnControl()) return;
  if (state.phase !== "main") return;
  if (!(state.pendingRobberMove || state.mode === "robber")) return;
  if (!(await moveRobber(state.currentPlayer, tileIdx))) {
    render();
    return;
  }
  if (state.pendingRobberMove) {
    state.pendingRobberMove = false;
    state.mode = "none";
    setStatus("Robber moved. Continue your turn.");
  }
  render();
  recordGameAction("move_robber");
}

function renderPlaceholderBoard() {
  refs.board.innerHTML = "";
  refs.board.setAttribute("viewBox", "0 0 1400 900");
  refs.board.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const txt = el("text", { x: 700, y: 460, class: "board-note" });
  txt.textContent = "Start a game to deal the board.";
  refs.board.appendChild(txt);
}

function renderBoard() {
  if (!state.geometry) {
    renderPlaceholderBoard();
    return;
  }

  refs.board.innerHTML = "";
  refs.board.setAttribute("viewBox", `0 0 ${state.geometry.width} ${state.geometry.height}`);
  refs.board.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const tileLayer = el("g");
  const edgeLayer = el("g");
  const nodeLayer = el("g");
  const overlayLayer = el("g");

  for (const tile of state.tiles) {
    const points = tile.corners.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ");
    const poly = el("polygon", {
      points,
      class: `hex-tile tile-${tile.resource}`,
    });
    tileLayer.appendChild(poly);
    appendResourceIcon(tileLayer, tile);

    if (tile.number !== null) {
      const token = el("circle", {
        cx: sx(tile.cx),
        cy: sy(tile.cy),
        r: 22,
        class: "token",
      });
      tileLayer.appendChild(token);

      const txt = el("text", {
        x: sx(tile.cx),
        y: sy(tile.cy) + 0.8,
        class: `token-text ${tile.number === 6 || tile.number === 8 ? "token-hot" : ""}`,
      });
      txt.textContent = String(tile.number);
      tileLayer.appendChild(txt);
    }

    if (tile.idx === state.robberTile) {
      const robber = el("circle", {
        cx: sx(tile.cx),
        cy: sy(tile.cy) + 34,
        r: 10,
        class: "robber-token",
      });
      tileLayer.appendChild(robber);
      const rText = el("text", {
        x: sx(tile.cx),
        y: sy(tile.cy) + 34.5,
        class: "robber-text",
      });
      rText.textContent = "R";
      tileLayer.appendChild(rText);
    }

    const clickTarget = el("polygon", {
      points,
      class: `tile-click-target ${isClickableTile(tile.idx) ? "clickable" : ""}`,
    });
    clickTarget.addEventListener("click", () => onTileClick(tile.idx));
    overlayLayer.appendChild(clickTarget);
  }

  for (const edge of state.edges) {
    const a = state.nodes[edge.a];
    const b = state.nodes[edge.b];
    const clickable = isClickableEdge(edge.idx);
    const cls = ["edge"];
    if (clickable) cls.push("clickable");
    if (!clickable && edge.owner === null) cls.push("blocked");
    const line = el("line", {
      x1: sx(a.x),
      y1: sy(a.y),
      x2: sx(b.x),
      y2: sy(b.y),
      class: cls.join(" "),
    });
    if (edge.owner !== null) line.style.stroke = state.players[edge.owner].color;
    line.addEventListener("click", () => onEdgeClick(edge.idx));
    edgeLayer.appendChild(line);
  }

  for (const node of state.nodes) {
    const clickable = isClickableNode(node.idx);
    const setupSelected = Boolean(
      state.phase === "setup" &&
        state.setup &&
        state.setup.expecting === "settlement" &&
        state.setup.selectedSettlementNode === node.idx
    );
    if (node.owner === null) {
      const classes = ["node", "node-empty"];
      if (clickable) classes.push("clickable");
      if (setupSelected) classes.push("selected");
      const circle = el("circle", {
        cx: sx(node.x),
        cy: sy(node.y),
        r: 6,
        class: classes.join(" "),
      });
      circle.addEventListener("click", () => onNodeClick(node.idx));
      nodeLayer.appendChild(circle);
      continue;
    }

    const owner = state.players[node.owner];
    const piece = el("circle", {
      cx: sx(node.x),
      cy: sy(node.y),
      r: node.isCity ? 10 : 7.6,
      class: `node node-owned ${clickable ? "clickable" : ""}`,
      fill: owner.color,
    });
    piece.addEventListener("click", () => onNodeClick(node.idx));
    nodeLayer.appendChild(piece);

    if (node.isCity) {
      const ring = el("circle", {
        cx: sx(node.x),
        cy: sy(node.y),
        r: 13,
        class: "city-ring",
      });
      ring.addEventListener("click", () => onNodeClick(node.idx));
      nodeLayer.appendChild(ring);
    }
  }

  refs.board.appendChild(tileLayer);
  refs.board.appendChild(edgeLayer);
  refs.board.appendChild(nodeLayer);
  refs.board.appendChild(overlayLayer);
}

function phaseLabel() {
  if (state.phase === "pregame") return "Pregame";
  if (state.phase === "setup") return "Setup";
  if (state.phase === "main") return "Round " + state.round;
  return "Game Over";
}

function renderTableStats() {
  refs.tableStats.innerHTML = "";
  if (state.players.length === 0) return;

  const grid = document.createElement("div");
  grid.className = "players-grid";

  state.players.forEach((player, idx) => {
    const card = document.createElement("div");
    card.className = `player-card ${idx === state.currentPlayer ? "current" : ""}`;
    card.style.setProperty("--turn-color", player.color);

    const nameRow = document.createElement("div");
    nameRow.className = "player-name";
    const nameLabel = document.createElement("span");
    nameLabel.textContent = player.name;
    nameRow.appendChild(nameLabel);
    if (idx === state.currentPlayer && state.phase !== "pregame") {
      const turnPill = document.createElement("span");
      turnPill.className = "turn-pill";
      turnPill.textContent = "TURN";
      turnPill.style.setProperty("--turn-color", player.color);
      nameRow.appendChild(turnPill);
    }
    const color = document.createElement("span");
    color.className = "player-color";
    color.style.background = player.color;
    nameRow.appendChild(color);
    card.appendChild(nameRow);

    const vp = document.createElement("div");
    vp.className = "resource-row";
    vp.textContent = `VP ${victoryPoints(player)} | Roads ${player.roads.size} | Settlements ${player.settlements.size} | Cities ${player.cities.size}`;
    card.appendChild(vp);

    const resources = document.createElement("div");
    resources.className = "resource-strip";
    RESOURCES.forEach((resource) => {
      const chip = document.createElement("div");
      chip.className = "resource-chip";
      chip.title = `${resource}: ${player.hand[resource]}`;

      const iconWrap = document.createElement("span");
      iconWrap.className = "resource-chip-icon";
      iconWrap.appendChild(createResourceIconSvg(resource));
      chip.appendChild(iconWrap);

      const count = document.createElement("span");
      count.className = "resource-chip-count";
      count.textContent = String(player.hand[resource]);
      chip.appendChild(count);

      resources.appendChild(chip);
    });
    card.appendChild(resources);

    grid.appendChild(card);
  });

  refs.tableStats.appendChild(grid);
}

function renderBuildPanel() {
  refs.buildPanel.innerHTML = "";
  if (state.players.length === 0) {
    refs.buildPanel.textContent = "Start a game to see build options.";
    return;
  }

  const player = currentPlayerObj();
  const wrap = document.createElement("div");
  wrap.className = "build-grid";

  const title = document.createElement("div");
  title.className = "build-title";
  title.textContent = `Build Costs (${player.name})`;
  wrap.appendChild(title);

  const entries = [
    { label: "Road", cost: COST.road },
    { label: "Settlement", cost: COST.settlement },
    { label: "City", cost: COST.city },
  ];

  function appendCostChips(target, cost) {
    const strip = document.createElement("div");
    strip.className = "resource-strip build-cost-strip";
    for (const [resource, amount] of Object.entries(cost)) {
      const chip = document.createElement("div");
      chip.className = "resource-chip build-cost-resource";
      chip.title = `${resource}: ${amount}`;

      const iconWrap = document.createElement("span");
      iconWrap.className = "resource-chip-icon";
      iconWrap.appendChild(createResourceIconSvg(resource));
      chip.appendChild(iconWrap);

      const count = document.createElement("span");
      count.className = "resource-chip-count";
      count.textContent = String(amount);
      chip.appendChild(count);

      strip.appendChild(chip);
    }
    target.appendChild(strip);
  }

  entries.forEach((entry) => {
    const canBuild = canAfford(player, entry.cost);
    const card = document.createElement("div");
    card.className = `build-chip ${canBuild ? "ok" : "locked"}`;

    const head = document.createElement("div");
    head.className = "build-chip-head";

    const label = document.createElement("span");
    label.className = "build-chip-label";
    label.textContent = entry.label;
    head.appendChild(label);

    const statePill = document.createElement("span");
    statePill.className = "build-chip-state";
    statePill.textContent = canBuild ? "Ready" : "Not Ready";
    head.appendChild(statePill);

    card.appendChild(head);
    appendCostChips(card, entry.cost);
    wrap.appendChild(card);
  });

  const canBankTrade = hasBankTradeOption(player);
  const bankTrade = document.createElement("div");
  bankTrade.className = `build-chip ${canBankTrade ? "ok" : "locked"}`;

  const bankHead = document.createElement("div");
  bankHead.className = "build-chip-head";

  const bankLabel = document.createElement("span");
  bankLabel.className = "build-chip-label";
  bankLabel.textContent = "Bank 4:1";
  bankHead.appendChild(bankLabel);

  const bankState = document.createElement("span");
  bankState.className = "build-chip-state";
  bankState.textContent = canBankTrade ? "Ready" : "Not Ready";
  bankHead.appendChild(bankState);

  bankTrade.appendChild(bankHead);
  appendCostChips(
    bankTrade,
    RESOURCES.reduce((acc, resource) => {
      acc[resource] = 4;
      return acc;
    }, {})
  );
  wrap.appendChild(bankTrade);

  refs.buildPanel.appendChild(wrap);
}

function renderLog() {
  refs.logList.innerHTML = "";
  for (const line of state.log) {
    const li = document.createElement("li");
    li.textContent = line;
    refs.logList.appendChild(li);
  }
}

function renderRollHistogram() {
  const canShowHistogram = state.phase === "main" || state.phase === "gameover";
  if (!canShowHistogram) state.histogramOpen = false;
  const showHistogram = canShowHistogram && state.histogramOpen;

  refs.histogramToggleBtn.classList.toggle("hidden", !canShowHistogram);
  refs.histogramToggleBtn.classList.toggle("open", showHistogram);
  refs.histogramToggleBtn.setAttribute("aria-pressed", showHistogram ? "true" : "false");
  refs.histogramToggleBtn.textContent = showHistogram ? "Hide Rolls" : "Rolls";

  refs.rollHistogram.classList.toggle("hidden", !showHistogram);
  refs.rollHistogram.setAttribute("aria-hidden", showHistogram ? "false" : "true");
  if (!showHistogram) {
    refs.rollHistogram.innerHTML = "";
    return;
  }

  const maxCount = Math.max(1, ...DICE_SUMS.map((sum) => state.rollHistogram[sum]));
  const bars = DICE_SUMS.map((sum) => {
    const count = state.rollHistogram[sum];
    const height = count === 0 ? 0 : Math.max(6, Math.round((count / maxCount) * 100));
    const hotClass = sum === 6 || sum === 8 ? " hot" : "";
    return `<div class="roll-hist-col${hotClass}">
      <div class="roll-hist-count">${count}</div>
      <div class="roll-hist-track"><div class="roll-hist-fill" style="--bar-h:${height}%;"></div></div>
      <div class="roll-hist-label">${sum}</div>
    </div>`;
  }).join("");

  refs.rollHistogram.innerHTML = `<div class="roll-hist-head">
    <span class="roll-hist-title">Roll Histogram</span>
    <span class="roll-hist-total">Total ${state.rollCountTotal}</span>
  </div>
  <div class="roll-hist-bars">${bars}</div>`;
}

function renderControls() {
  renderRoomPanel();
  const hideOnlineRoomCard = state.phase !== "pregame" && !isOnlineRoomActive();
  refs.roomCard.classList.toggle("hidden", hideOnlineRoomCard);
  updateSetupCardVisibility();
  const canResumeGame = state.phase === "pregame" && !isOnlineRoomActive() && !resumeState.checking;
  refs.resumeGameBtn.disabled = !canResumeGame;
  if (resumeState.checking) {
    refs.resumeGameBtn.title = "Checking for saved games...";
  } else if (resumeState.latestFile) {
    refs.resumeGameBtn.title = `Select from saved games (latest: ${resumeState.latestFile})`;
  } else {
    refs.resumeGameBtn.title = "Select a saved game to resume.";
  }
  if (isOnlineRoomActive()) {
    refs.startBtn.textContent = "Start Room Game";
    const roomReady =
      isRoomHost() &&
      !onlineState.started &&
      onlineState.players.length >= 3 &&
      onlineState.players.length <= ONLINE_MAX_PLAYERS;
    refs.startBtn.disabled = !roomReady;
    refs.restartBtn.disabled = !isRoomHost();
  } else {
    refs.startBtn.textContent = "Start New Game";
    refs.startBtn.disabled = false;
    refs.restartBtn.disabled = false;
  }

  refreshPlayerTradeTargets();
  refs.phaseLabel.textContent = phaseLabel();
  const activePlayer = state.players.length > 0 ? currentPlayerObj() : null;
  const controlsLockedToOtherPlayer = isOnlineGameStarted() && !localControlsCurrentTurn();
  refs.currentPlayerLabel.textContent =
    activePlayer ? `${activePlayer.name}${state.phase === "setup" ? " (setup)" : ""}` : "-";
  refs.diceLabel.textContent =
    state.isRollingDice && state.rollingDiceValue !== null
      ? String(state.rollingDiceValue)
      : state.diceResult !== null
      ? String(state.diceResult)
      : "-";
  refs.diceLabel.classList.toggle("rolling", state.isRollingDice);
  refs.rollBtn.classList.toggle("rolling", state.isRollingDice);
  refs.diceRollStage.classList.toggle("hidden", !state.isRollingDice);
  refs.diceRollStage.setAttribute("aria-hidden", state.isRollingDice ? "false" : "true");
  if (!state.isRollingDice) refs.diceRollStage.classList.remove("rolling");
  const showRollResultPopup = !state.isRollingDice && state.rollResultPopupValue !== null;
  refs.rollResultPopup.classList.toggle("hidden", !showRollResultPopup);
  refs.rollResultPopup.setAttribute("aria-hidden", showRollResultPopup ? "false" : "true");
  if (showRollResultPopup) refs.rollResultPopup.textContent = String(state.rollResultPopupValue);
  renderTurnClock();
  refs.statusText.textContent = state.status;
  refs.turnCallout.textContent = turnContextText(activePlayer);

  const inMainPhase = state.phase === "main" && state.phase !== "gameover";
  const canRoll = inMainPhase && !controlsLockedToOtherPlayer && !state.hasRolled && !state.isRollingDice;
  refs.rollBtn.disabled = !canRoll;

  const canEndTurn =
    inMainPhase && !controlsLockedToOtherPlayer && state.hasRolled && !state.pendingRobberMove && !state.isRollingDice;
  refs.endTurnBtn.disabled = !canEndTurn;

  const canTakeActions =
    inMainPhase && !controlsLockedToOtherPlayer && state.hasRolled && !state.pendingRobberMove && !state.isRollingDice;
  const canBankTrade = Boolean(activePlayer && canTakeActions && hasBankTradeOption(activePlayer));
  const canPlayerTrade = Boolean(
    activePlayer &&
      canTakeActions &&
      refs.p2pTarget.options.length > 0 &&
      hasPlayerTradeOption(state.currentPlayer)
  );
  const hasTradeChoice = canBankTrade || canPlayerTrade;
  if (!hasTradeChoice) state.tradeMenuOpen = false;
  const showTradeMenu = hasTradeChoice && state.tradeMenuOpen;

  refs.tradePromptPopup.classList.toggle("hidden", !hasTradeChoice || showTradeMenu);
  refs.tradeActionPopup.classList.toggle("hidden", !showTradeMenu);
  refs.bankTradeSection.classList.toggle("hidden", !canBankTrade);
  refs.playerTradeSection.classList.toggle("hidden", !canPlayerTrade);
  refs.openTradeMenuBtn.disabled = !hasTradeChoice;
  refs.closeTradeMenuBtn.disabled = !hasTradeChoice;

  refs.tradeBtn.disabled = !showTradeMenu || !canBankTrade;
  refs.tradeGive.disabled = !showTradeMenu || !canBankTrade;
  refs.tradeGet.disabled = !showTradeMenu || !canBankTrade;
  refs.p2pTradeBtn.disabled = !showTradeMenu || !canPlayerTrade;
  refs.p2pTarget.disabled = !showTradeMenu || !canPlayerTrade;
  refs.p2pGive.disabled = !showTradeMenu || !canPlayerTrade;
  refs.p2pGet.disabled = !showTradeMenu || !canPlayerTrade;
  refs.p2pGiveAmount.disabled = !showTradeMenu || !canPlayerTrade;
  refs.p2pGetAmount.disabled = !showTradeMenu || !canPlayerTrade;

  if (canBankTrade && activePlayer) {
    const tradeable = RESOURCES.filter((res) => activePlayer.hand[res] >= 4);
    refs.bankTradeHint.textContent = `Can give: ${tradeable.join(", ")}`;
    if (!tradeable.includes(refs.tradeGive.value)) refs.tradeGive.value = tradeable[0];
    if (refs.tradeGet.value === refs.tradeGive.value) {
      const fallback = RESOURCES.find((res) => res !== refs.tradeGive.value);
      if (fallback) refs.tradeGet.value = fallback;
    }
  } else {
    refs.bankTradeHint.textContent = "";
  }

  if (canPlayerTrade) {
    const targets = [];
    for (let idx = 0; idx < state.players.length; idx += 1) {
      if (idx === state.currentPlayer) continue;
      if (resourceCount(state.players[idx]) > 0) targets.push(state.players[idx].name);
    }
    refs.p2pTradeHint.textContent = `Available players: ${targets.join(", ")}`;
  } else {
    refs.p2pTradeHint.textContent = "";
  }

  const showBuildActionPopup = Boolean(activePlayer && canTakeActions && hasAnyBuildByResources(activePlayer));
  refs.buildActionPopup.classList.toggle("hidden", !showBuildActionPopup);
  if (!showBuildActionPopup && (state.mode === "road" || state.mode === "settlement" || state.mode === "city")) {
    state.mode = "none";
  }

  for (const btn of refs.modeButtons) {
    const mode = btn.dataset.mode;
    btn.classList.toggle("active", state.mode === mode);
    if (!showBuildActionPopup || !activePlayer) {
      btn.disabled = true;
      continue;
    }
    if (mode === "none") {
      btn.disabled = false;
      continue;
    }
    if (mode === "road") {
      btn.disabled = !canAfford(activePlayer, COST.road);
      continue;
    }
    if (mode === "settlement") {
      btn.disabled = !canAfford(activePlayer, COST.settlement);
      continue;
    }
    if (mode === "city") {
      btn.disabled = !canAfford(activePlayer, COST.city);
      continue;
    }
    btn.disabled = true;
  }

  if (activePlayer && state.phase !== "pregame") {
    refs.turnCard.classList.add("turn-active");
    refs.turnCard.style.setProperty("--turn-color", activePlayer.color);
    refs.turnBadge.classList.remove("hidden");
    refs.turnBadgeDot.style.background = activePlayer.color;
    refs.turnBadgeText.textContent = turnBadgeText(activePlayer);
  } else {
    refs.turnCard.classList.remove("turn-active");
    refs.turnCard.style.removeProperty("--turn-color");
    refs.turnBadge.classList.add("hidden");
    refs.turnBadgeText.textContent = "Start a game";
  }
}

function render() {
  renderBoard();
  renderControls();
  renderRollHistogram();
  renderTableStats();
  renderBuildPanel();
  renderLog();
}

async function rollDice(options = {}) {
  const auto = options.auto === true;
  if (!auto && !assertLocalTurnControl()) return;
  if (state.phase !== "main" || state.hasRolled || state.isRollingDice) return;
  const roll = 1 + Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6);
  const finalPair = dicePairForTotal(roll);
  state.hasRolled = true;
  state.isRollingDice = true;
  state.rollingDiceValue = null;
  state.diceResult = null;
  setStatus(`${currentPlayerObj().name} is rolling...`);
  render();
  configureBoardDiceThrow();

  const rollSteps = 13;
  for (let i = 0; i < rollSteps; i += 1) {
    const dieA = randomDieValue();
    const dieB = randomDieValue();
    state.rollingDiceValue = dieA + dieB;
    setBoardDiceFaces(dieA, dieB);
    renderControls();
    const progress = i / (rollSteps - 1);
    const interval = 38 + Math.round(74 * progress * progress) + randomInt(0, 14);
    await delay(interval);
  }

  setBoardDiceFaces(finalPair[0], finalPair[1]);
  state.rollingDiceValue = roll;
  renderControls();
  await delay(320);

  state.isRollingDice = false;
  state.rollingDiceValue = null;
  state.diceResult = roll;
  state.rollHistogram[roll] += 1;
  state.rollCountTotal += 1;
  state.rollResultPopupValue = roll;
  renderControls();
  renderRollHistogram();
  await delay(1000);
  state.rollResultPopupValue = null;
  logEvent(`${currentPlayerObj().name} rolled ${roll}.`);
  if (roll === 7) {
    if (auto) {
      handleRollSevenAuto(state.currentPlayer);
    } else {
      await handleRollSeven();
    }
  } else {
    distributeResources(roll);
    if (!auto) setStatus(`${currentPlayerObj().name}: choose actions, then end turn.`);
  }
  render();
  recordGameAction("roll_dice");
}

function endTurn() {
  if (!assertLocalTurnControl()) return;
  if (state.phase !== "main" || !state.hasRolled || state.pendingRobberMove || state.isRollingDice) return;
  state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
  if (state.currentPlayer === 0) state.round += 1;
  state.hasRolled = false;
  state.isRollingDice = false;
  state.rollingDiceValue = null;
  state.rollResultPopupValue = null;
  state.diceResult = null;
  state.mode = "none";
  state.tradeMenuOpen = false;
  setStatus(`${currentPlayerObj().name}: roll dice.`);
  logEvent(`Turn passed to ${currentPlayerObj().name}.`);
  restartTurnTimer();
  render();
  recordGameAction("end_turn");
}

function bankTrade() {
  if (!assertLocalTurnControl()) return;
  if (state.phase !== "main" || !state.hasRolled || state.pendingRobberMove || state.isRollingDice) return;
  const player = currentPlayerObj();
  const give = refs.tradeGive.value;
  const get = refs.tradeGet.value;

  if (give === get) {
    setStatus("Choose different resources for trade.");
    render();
    return;
  }
  if (player.hand[give] < 4) {
    setStatus(`Need 4 ${give} to trade.`);
    render();
    return;
  }

  player.hand[give] -= 4;
  player.hand[get] += 1;
  logEvent(`${player.name} traded 4 ${give} for 1 ${get}.`);
  setStatus(`${player.name} traded with the bank.`);
  render();
  recordGameAction("bank_trade");
}

function playerTrade() {
  if (!assertLocalTurnControl()) return;
  if (state.phase !== "main" || !state.hasRolled || state.pendingRobberMove || state.isRollingDice) return;
  const fromIdx = state.currentPlayer;
  const toIdx = Number(refs.p2pTarget.value);
  if (!Number.isInteger(toIdx) || toIdx < 0 || toIdx >= state.players.length || toIdx === fromIdx) {
    setStatus("Choose a valid target player.");
    render();
    return;
  }

  const giveRes = refs.p2pGive.value;
  const getRes = refs.p2pGet.value;
  const giveAmt = parsePositiveInt(refs.p2pGiveAmount.value);
  const getAmt = parsePositiveInt(refs.p2pGetAmount.value);

  if (!RESOURCES.includes(giveRes) || !RESOURCES.includes(getRes)) {
    setStatus("Choose valid resources for trade.");
    render();
    return;
  }
  if (giveAmt === null || getAmt === null) {
    setStatus("Trade amounts must be whole numbers >= 1.");
    render();
    return;
  }
  if (giveRes === getRes) {
    setStatus("Give and get resources must be different.");
    render();
    return;
  }

  const from = state.players[fromIdx];
  const to = state.players[toIdx];
  if (from.hand[giveRes] < giveAmt) {
    setStatus(`${from.name} does not have ${giveAmt} ${giveRes}.`);
    render();
    return;
  }
  if (to.hand[getRes] < getAmt) {
    setStatus(`${to.name} does not have ${getAmt} ${getRes}.`);
    render();
    return;
  }

  const accepted = window.confirm(
    `${to.name}, accept this trade?\n` +
      `${from.name} gives ${giveAmt} ${giveRes}\n` +
      `${to.name} gives ${getAmt} ${getRes}`
  );
  if (!accepted) {
    logEvent(`${to.name} declined a trade from ${from.name}.`);
    setStatus("Trade declined.");
    render();
    return;
  }

  from.hand[giveRes] -= giveAmt;
  to.hand[giveRes] += giveAmt;
  to.hand[getRes] -= getAmt;
  from.hand[getRes] += getAmt;
  logEvent(`${from.name} traded ${giveAmt} ${giveRes} for ${getAmt} ${getRes} with ${to.name}.`);
  setStatus("Trade completed.");
  render();
  recordGameAction("player_trade");
}

function initTradeSelectors() {
  refs.tradeGive.innerHTML = "";
  refs.tradeGet.innerHTML = "";
  refs.p2pGive.innerHTML = "";
  refs.p2pGet.innerHTML = "";
  for (const res of RESOURCES) {
    const a = document.createElement("option");
    a.value = res;
    a.textContent = res;
    refs.tradeGive.appendChild(a);

    const b = document.createElement("option");
    b.value = res;
    b.textContent = res;
    refs.tradeGet.appendChild(b);

    const c = document.createElement("option");
    c.value = res;
    c.textContent = res;
    refs.p2pGive.appendChild(c);

    const d = document.createElement("option");
    d.value = res;
    d.textContent = res;
    refs.p2pGet.appendChild(d);
  }
  refs.tradeGet.value = "ore";
  refs.p2pGet.value = "ore";
}

function refreshPlayerTradeTargets() {
  const selected = refs.p2pTarget.value;
  refs.p2pTarget.innerHTML = "";
  if (state.players.length < 2) return;

  for (let idx = 0; idx < state.players.length; idx += 1) {
    if (idx === state.currentPlayer) continue;
    if (resourceCount(state.players[idx]) === 0) continue;
    const option = document.createElement("option");
    option.value = String(idx);
    option.textContent = state.players[idx].name;
    refs.p2pTarget.appendChild(option);
  }

  if (selected && refs.p2pTarget.querySelector(`option[value="${selected}"]`)) {
    refs.p2pTarget.value = selected;
    return;
  }
  refs.p2pTarget.selectedIndex = 0;
}

function createNameInputs() {
  refs.nameInputs.innerHTML = "";
  const count = Number(refs.playerCount.value);
  for (let i = 0; i < count; i += 1) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "name-input";
    input.maxLength = 18;
    input.value = `Player ${i + 1}`;
    refs.nameInputs.appendChild(input);
  }
}

function bindEvents() {
  refs.playerCount.addEventListener("change", createNameInputs);
  refs.startBtn.addEventListener("click", startGame);
  refs.resumeGameBtn.addEventListener("click", requestResumeGame);
  refs.restartBtn.addEventListener("click", restartGame);
  refs.createRoomBtn.addEventListener("click", requestCreateRoom);
  refs.joinRoomBtn.addEventListener("click", requestJoinRoom);
  refs.copyRoomCodeBtn.addEventListener("click", copyRoomCode);
  refs.leaveRoomBtn.addEventListener("click", requestLeaveRoom);
  refs.rollbackActionBtn.addEventListener("click", requestRollbackAction);
  refs.roomCodeInput.addEventListener("input", () => {
    refs.roomCodeInput.value = refs.roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
  refs.onlineName.addEventListener("change", () => {
    refs.onlineName.value = sanitizePlayerName(refs.onlineName.value, "Player");
  });
  refs.rollBtn.addEventListener("click", rollDice);
  refs.endTurnBtn.addEventListener("click", endTurn);
  refs.histogramToggleBtn.addEventListener("click", () => {
    if (state.phase !== "main" && state.phase !== "gameover") return;
    state.histogramOpen = !state.histogramOpen;
    renderRollHistogram();
  });
  refs.openTradeMenuBtn.addEventListener("click", () => {
    if (refs.tradePromptPopup.classList.contains("hidden")) return;
    state.tradeMenuOpen = true;
    render();
  });
  refs.closeTradeMenuBtn.addEventListener("click", () => {
    state.tradeMenuOpen = false;
    render();
  });
  refs.tradeBtn.addEventListener("click", bankTrade);
  refs.p2pTradeBtn.addEventListener("click", playerTrade);
  refs.actionModalCancelBtn.addEventListener("click", () => closeActionModal(null));
  refs.actionModal.addEventListener("click", (event) => {
    const cancelVisible = !refs.actionModalCancelBtn.classList.contains("hidden");
    if (event.target === refs.actionModal && cancelVisible) closeActionModal(null);
  });
  window.addEventListener("keydown", (event) => {
    const cancelVisible = !refs.actionModalCancelBtn.classList.contains("hidden");
    if (event.key === "Escape" && actionModalResolver && cancelVisible) closeActionModal(null);
  });

  refs.modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!assertLocalTurnControl()) return;
      if (state.phase !== "main") return;
      if (refs.buildActionPopup.classList.contains("hidden")) return;
      state.mode = btn.dataset.mode;
      if (state.mode === "none") {
        setStatus("Build selection cleared.");
      } else {
        setStatus(`Build mode: ${state.mode}.`);
      }
      render();
    });
  });
}

function init() {
  createNameInputs();
  initTradeSelectors();
  bindEvents();
  refs.onlineName.value = "Player 1";
  refs.turnSeconds.value = String(state.turnSeconds);
  stopTurnTimer(true);
  state.rollHistogram = emptyRollHistogram();
  state.rollCountTotal = 0;
  state.histogramOpen = false;
  setBoardDiceFaces(1, 2);
  render();
  void refreshLatestSaveAvailability();
}

init();
