"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 8000;
const ROOT_DIR = process.cwd();
const SAVE_ROOT_DIR = path.join(ROOT_DIR, "game_saves");
const ROOM_MAX_PLAYERS = 4;
const ROOM_MIN_PLAYERS = 3;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_HISTORY_STATES = 400;
const MAX_LOCAL_SAVE_SESSIONS = 16;
const MAX_JSON_BODY_BYTES = 12 * 1024 * 1024;
const MAX_SAVE_LIST_ITEMS = 120;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

const rooms = new Map();
const socketMeta = new Map();
const localSaveSessions = new Map();
let nextClientId = 1;
let nextLocalSaveSessionId = 1;

fs.mkdirSync(SAVE_ROOT_DIR, { recursive: true });

function sendMessage(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readJsonBody(req, onDone) {
  let finished = false;
  const done = (err, payload) => {
    if (finished) return;
    finished = true;
    onDone(err, payload);
  };
  let totalBytes = 0;
  const chunks = [];
  req.on("data", (chunk) => {
    totalBytes += chunk.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      done(new Error("Payload too large."));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch (_err) {
      done(new Error("Invalid JSON body."));
    }
  });
  req.on("error", (err) => {
    done(err);
  });
}

function cloneState(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

function safeFileTime() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function createSaveFilePath(room) {
  const safeCode = String(room.code || "ROOM").replace(/[^A-Z0-9_-]/gi, "").slice(0, 12) || "ROOM";
  return path.join(SAVE_ROOT_DIR, `${safeCode}-${safeFileTime()}.jsonl`);
}

function writeSaveLine(room, lineObj) {
  if (!room.saveFile) return;
  const line = JSON.stringify(lineObj) + "\n";
  fs.appendFile(room.saveFile, line, (err) => {
    if (!err) return;
    // eslint-disable-next-line no-console
    console.error("Failed to write save line:", err.message);
  });
}

function beginSaveSession(room, details = {}) {
  room.saveFile = createSaveFilePath(room);
  const header = {
    type: "session_start",
    roomCode: room.code,
    createdAt: new Date().toISOString(),
    hostId: room.hostId,
    reason: details.reason || "game_start",
    versionAtStart: room.version,
    players: room.players.map((player) => ({ id: player.id, name: player.name })),
  };
  fs.writeFile(room.saveFile, JSON.stringify(header) + "\n", (err) => {
    if (!err) return;
    // eslint-disable-next-line no-console
    console.error("Failed to create save file:", err.message);
  });
}

function pushHistoryState(room, state, meta = {}) {
  if (!room.saveFile) beginSaveSession(room, { reason: meta.action || "sync" });
  const stateCopy = cloneState(state);
  room.version += 1;
  room.gameState = stateCopy;
  room.history.push({
    version: room.version,
    state: stateCopy,
    actorId: meta.actorId || "",
    action: meta.action || "sync",
    at: new Date().toISOString(),
  });
  if (room.history.length > MAX_HISTORY_STATES) {
    room.history.splice(0, room.history.length - MAX_HISTORY_STATES);
  }
  writeSaveLine(room, {
    type: "state",
    version: room.version,
    actorId: meta.actorId || "",
    action: meta.action || "sync",
    at: new Date().toISOString(),
    gameState: stateCopy,
  });
}

function nextLocalSessionId() {
  const id = `l${nextLocalSaveSessionId.toString(36)}`;
  nextLocalSaveSessionId += 1;
  return id;
}

function createLocalSaveSession(payload = {}) {
  const playerNames = Array.isArray(payload.playerNames) ? payload.playerNames : [];
  const players = playerNames
    .slice(0, ROOM_MAX_PLAYERS)
    .map((name, idx) => ({ id: `local-${idx + 1}`, name: sanitizeName(name, `Player ${idx + 1}`) }));

  const session = {
    id: nextLocalSessionId(),
    code: "LOCAL",
    hostId: "local",
    players,
    version: 0,
    gameState: null,
    saveFile: "",
    createdAt: new Date().toISOString(),
  };

  beginSaveSession(session, { reason: sanitizeAction(payload.reason || "local_game_start") });
  writeSaveLine(session, {
    type: "local_session",
    sessionId: session.id,
    at: new Date().toISOString(),
    turnSeconds: Number(payload.turnSeconds) || null,
  });

  localSaveSessions.set(session.id, session);
  while (localSaveSessions.size > MAX_LOCAL_SAVE_SESSIONS) {
    const oldestKey = localSaveSessions.keys().next().value;
    if (!oldestKey) break;
    localSaveSessions.delete(oldestKey);
  }

  return session;
}

function pushLocalSessionState(session, state, meta = {}) {
  if (!session.saveFile) beginSaveSession(session, { reason: meta.action || "local_sync" });
  const stateCopy = cloneState(state);
  session.version += 1;
  session.gameState = stateCopy;
  writeSaveLine(session, {
    type: "state",
    sessionId: session.id,
    version: session.version,
    actorId: "local",
    action: meta.action || "sync",
    at: new Date().toISOString(),
    gameState: stateCopy,
  });
}

function listSaveFilesByNewest() {
  let entries;
  try {
    entries = fs.readdirSync(SAVE_ROOT_DIR, { withFileTypes: true });
  } catch (_err) {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => {
      const fullPath = path.join(SAVE_ROOT_DIR, entry.name);
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(fullPath).mtimeMs;
      } catch (_err) {
        mtimeMs = 0;
      }
      return { fullPath, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function parseSaveSnapshot(filePath, options = {}) {
  const includeGameState = options.includeGameState !== false;
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (_err) {
    return null;
  }

  const lines = raw.split(/\r?\n/);
  let header = null;
  let latestState = null;
  let latestAction = "";
  let latestAt = "";
  let moveCount = 0;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch (_err) {
      return;
    }
    if (!header && entry.type === "session_start") header = entry;
    if (!entry || typeof entry.gameState !== "object" || !entry.gameState) return;
    latestState = entry.gameState;
    latestAction = sanitizeAction(entry.action || entry.type || "state");
    latestAt = typeof entry.at === "string" ? entry.at : latestAt;
    moveCount += 1;
  });

  if (!latestState) return null;

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (_err) {
    stat = null;
  }
  const createdAt =
    typeof header?.createdAt === "string" ? header.createdAt : stat ? stat.birthtime.toISOString() : new Date().toISOString();
  const updatedAt = latestAt || (stat ? stat.mtime.toISOString() : createdAt);
  return {
    id: path.basename(filePath),
    file: path.relative(ROOT_DIR, filePath),
    createdAt,
    updatedAt,
    moveCount,
    latestAction,
    roomCode: typeof header?.roomCode === "string" ? header.roomCode : "",
    players: Array.isArray(header?.players) ? header.players : [],
    gameState: includeGameState ? latestState : undefined,
  };
}

function getLatestSavedGame() {
  const candidates = listSaveFilesByNewest();
  for (const candidate of candidates) {
    const snapshot = parseSaveSnapshot(candidate.fullPath, { includeGameState: true });
    if (snapshot) return snapshot;
  }
  return null;
}

function listSavedGames() {
  const candidates = listSaveFilesByNewest();
  const out = [];
  for (const candidate of candidates) {
    const snapshot = parseSaveSnapshot(candidate.fullPath, { includeGameState: false });
    if (!snapshot) continue;
    out.push(snapshot);
    if (out.length >= MAX_SAVE_LIST_ITEMS) break;
  }
  return out;
}

function resolveSaveFileById(saveId) {
  const normalized = String(saveId || "").trim();
  if (!/^[A-Za-z0-9_-]+\.jsonl$/.test(normalized)) return "";
  const fullPath = path.resolve(path.join(SAVE_ROOT_DIR, normalized));
  const insideSaveRoot = fullPath === SAVE_ROOT_DIR || fullPath.startsWith(SAVE_ROOT_DIR + path.sep);
  if (!insideSaveRoot) return "";
  return fullPath;
}

function loadSavedGameById(saveId) {
  const fullPath = resolveSaveFileById(saveId);
  if (!fullPath) return null;
  return parseSaveSnapshot(fullPath, { includeGameState: true });
}

function sanitizeName(raw, fallback = "Player") {
  const name = String(raw ?? "").trim();
  if (!name) return fallback;
  return name.slice(0, 18);
}

function sanitizeAction(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "sync";
  return value.slice(0, 48);
}

function randomRoomCode() {
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    const idx = Math.floor(Math.random() * ROOM_CODE_CHARS.length);
    code += ROOM_CODE_CHARS[idx];
  }
  return code;
}

function uniqueRoomCode() {
  for (let attempts = 0; attempts < 50; attempts += 1) {
    const code = randomRoomCode();
    if (!rooms.has(code)) return code;
  }
  throw new Error("Unable to allocate room code.");
}

function createPublicRoom(room) {
  const fileLabel = room.saveFile ? path.relative(ROOT_DIR, room.saveFile) : "";
  const historyCount = Array.isArray(room.history) ? room.history.length : 0;
  return {
    code: room.code,
    hostId: room.hostId,
    started: room.started,
    seatMap: room.seatMap.slice(),
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      connected: player.connected,
    })),
    version: room.version,
    gameState: room.gameState,
    save: {
      file: fileLabel,
      historyCount,
    },
  };
}

function broadcastRoomState(room) {
  const payload = { type: "room_state", room: createPublicRoom(room) };
  room.players.forEach((player) => {
    if (player.ws) sendMessage(player.ws, payload);
  });
}

function findRoomForSocket(ws) {
  const meta = socketMeta.get(ws);
  if (!meta || !meta.roomCode) return null;
  return rooms.get(meta.roomCode) || null;
}

function markHost(room) {
  if (room.hostId && room.players.some((player) => player.id === room.hostId && player.connected)) return;
  const nextHost = room.players.find((player) => player.connected);
  room.hostId = nextHost ? nextHost.id : "";
}

function leaveRoom(ws) {
  const meta = socketMeta.get(ws);
  if (!meta || !meta.roomCode) return;
  const room = rooms.get(meta.roomCode);
  meta.roomCode = "";
  if (!room) return;

  const player = room.players.find((entry) => entry.id === meta.id);
  if (!player) return;

  if (room.started) {
    player.connected = false;
    player.ws = null;
  } else {
    room.players = room.players.filter((entry) => entry.id !== meta.id);
  }

  markHost(room);

  const connectedCount = room.players.filter((entry) => entry.connected).length;
  if (room.players.length === 0 || connectedCount === 0) {
    rooms.delete(room.code);
    return;
  }

  broadcastRoomState(room);
}

function handleCreateRoom(ws, payload) {
  const meta = socketMeta.get(ws);
  if (!meta) return;
  if (meta.roomCode) {
    sendMessage(ws, { type: "room_error", message: "Leave your current room first." });
    return;
  }

  const code = uniqueRoomCode();
  const room = {
    code,
    hostId: meta.id,
    started: false,
    players: [
      {
        id: meta.id,
        name: sanitizeName(payload.name, "Host"),
        connected: true,
        ws,
      },
    ],
    seatMap: [],
    gameState: null,
    version: 0,
    history: [],
    saveFile: "",
  };
  rooms.set(code, room);
  meta.roomCode = code;
  broadcastRoomState(room);
}

function handleJoinRoom(ws, payload) {
  const meta = socketMeta.get(ws);
  if (!meta) return;
  if (meta.roomCode) {
    sendMessage(ws, { type: "room_error", message: "Leave your current room first." });
    return;
  }

  const code = String(payload.code || "").toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    sendMessage(ws, { type: "room_error", message: "Room not found." });
    return;
  }
  if (room.started) {
    sendMessage(ws, { type: "room_error", message: "Game already started." });
    return;
  }
  if (room.players.length >= ROOM_MAX_PLAYERS) {
    sendMessage(ws, { type: "room_error", message: "Room is full." });
    return;
  }

  room.players.push({
    id: meta.id,
    name: sanitizeName(payload.name, `Player ${room.players.length + 1}`),
    connected: true,
    ws,
  });
  meta.roomCode = code;
  broadcastRoomState(room);
}

function handleStartGame(ws, payload) {
  const room = findRoomForSocket(ws);
  const meta = socketMeta.get(ws);
  if (!room || !meta) return;
  if (room.hostId !== meta.id) {
    sendMessage(ws, { type: "room_error", message: "Only the host can start the game." });
    return;
  }
  if (room.started) {
    sendMessage(ws, { type: "room_error", message: "Game has already started." });
    return;
  }
  if (room.players.length < ROOM_MIN_PLAYERS || room.players.length > ROOM_MAX_PLAYERS) {
    sendMessage(ws, { type: "room_error", message: "Rooms require 3-4 players." });
    return;
  }

  room.started = true;
  room.seatMap = room.players.map((player) => player.id);
  room.gameState = null;
  room.history = [];
  room.version = 0;
  room.turnSeconds = Number(payload.turnSeconds) || 60;
  room.saveFile = "";
  broadcastRoomState(room);
}

function handleStateSync(ws, payload) {
  const room = findRoomForSocket(ws);
  const meta = socketMeta.get(ws);
  if (!room || !meta) return;
  if (!room.started) {
    sendMessage(ws, { type: "room_error", message: "Game has not started yet." });
    return;
  }
  if (!room.seatMap.includes(meta.id)) {
    sendMessage(ws, { type: "room_error", message: "Only room players can sync state." });
    return;
  }
  if (!payload || typeof payload.gameState !== "object") {
    sendMessage(ws, { type: "room_error", message: "Missing game state payload." });
    return;
  }
  const action = sanitizeAction(payload.action);

  if (room.gameState && typeof room.gameState.currentPlayer === "number") {
    const expectedPlayerId = room.seatMap[room.gameState.currentPlayer];
    if (expectedPlayerId && expectedPlayerId !== meta.id && room.hostId !== meta.id) {
      sendMessage(ws, { type: "room_error", message: "Not your turn." });
      return;
    }
  }

  if (action === "game_start") {
    room.history = [];
    beginSaveSession(room, { reason: "game_start" });
  }

  pushHistoryState(room, payload.gameState, { actorId: meta.id, action });
  broadcastRoomState(room);
}

function handleRollbackState(ws) {
  const room = findRoomForSocket(ws);
  const meta = socketMeta.get(ws);
  if (!room || !meta) return;
  if (!room.started) {
    sendMessage(ws, { type: "room_error", message: "Game has not started yet." });
    return;
  }
  if (room.hostId !== meta.id) {
    sendMessage(ws, { type: "room_error", message: "Only the host can roll back." });
    return;
  }
  if (room.history.length < 2) {
    sendMessage(ws, { type: "room_error", message: "No earlier action to roll back to." });
    return;
  }

  const removedEntry = room.history.pop();
  const targetEntry = room.history[room.history.length - 1];
  room.version += 1;
  room.gameState = cloneState(targetEntry.state);
  writeSaveLine(room, {
    type: "rollback",
    by: meta.id,
    version: room.version,
    rolledBackAction: removedEntry.action,
    restoredAction: targetEntry.action,
    historyCount: room.history.length,
    at: new Date().toISOString(),
    gameState: room.gameState,
  });
  broadcastRoomState(room);
}

function handleApiGetLatestSave(_req, res) {
  const latest = getLatestSavedGame();
  if (!latest) {
    sendJson(res, 404, { error: "No saved games found." });
    return;
  }
  sendJson(res, 200, {
    save: {
      file: latest.file,
      createdAt: latest.createdAt,
      updatedAt: latest.updatedAt,
      moveCount: latest.moveCount,
      latestAction: latest.latestAction,
      roomCode: latest.roomCode,
      players: latest.players,
    },
    gameState: latest.gameState,
  });
}

function handleApiListSaves(_req, res) {
  const saves = listSavedGames().map((save) => ({
    id: save.id,
    file: save.file,
    createdAt: save.createdAt,
    updatedAt: save.updatedAt,
    moveCount: save.moveCount,
    latestAction: save.latestAction,
    roomCode: save.roomCode,
    players: save.players,
  }));
  sendJson(res, 200, { saves });
}

function handleApiLoadSaveById(_req, res, urlObj) {
  const saveId = String(urlObj.searchParams.get("id") || "");
  if (!saveId) {
    sendJson(res, 400, { error: "Missing save id." });
    return;
  }
  const save = loadSavedGameById(saveId);
  if (!save || !save.gameState) {
    sendJson(res, 404, { error: "Saved game not found." });
    return;
  }
  sendJson(res, 200, {
    save: {
      id: save.id,
      file: save.file,
      createdAt: save.createdAt,
      updatedAt: save.updatedAt,
      moveCount: save.moveCount,
      latestAction: save.latestAction,
      roomCode: save.roomCode,
      players: save.players,
    },
    gameState: save.gameState,
  });
}

function handleApiLocalGameStart(req, res) {
  readJsonBody(req, (err, payload) => {
    if (err) {
      sendJson(res, 400, { error: err.message || "Invalid request body." });
      return;
    }
    const session = createLocalSaveSession(payload);
    sendJson(res, 200, {
      sessionId: session.id,
      save: {
        file: path.relative(ROOT_DIR, session.saveFile),
      },
    });
  });
}

function handleApiLocalGameState(req, res) {
  readJsonBody(req, (err, payload) => {
    if (err) {
      sendJson(res, 400, { error: err.message || "Invalid request body." });
      return;
    }

    const sessionId = String(payload?.sessionId || "");
    if (!sessionId) {
      sendJson(res, 400, { error: "Missing sessionId." });
      return;
    }

    const session = localSaveSessions.get(sessionId);
    if (!session) {
      sendJson(res, 404, { error: "Save session not found." });
      return;
    }

    if (!payload || typeof payload.gameState !== "object") {
      sendJson(res, 400, { error: "Missing gameState payload." });
      return;
    }

    pushLocalSessionState(session, payload.gameState, { action: sanitizeAction(payload.action) });
    sendJson(res, 200, {
      ok: true,
      version: session.version,
      save: {
        file: path.relative(ROOT_DIR, session.saveFile),
      },
    });
  });
}

function handleApiRequest(req, res, requestPath, urlObj) {
  if (req.method === "GET" && requestPath === "/api/game-saves/latest") {
    handleApiGetLatestSave(req, res);
    return true;
  }
  if (req.method === "GET" && requestPath === "/api/game-saves") {
    handleApiListSaves(req, res);
    return true;
  }
  if (req.method === "GET" && requestPath === "/api/game-saves/load") {
    handleApiLoadSaveById(req, res, urlObj);
    return true;
  }
  if (req.method === "POST" && requestPath === "/api/local-game/start") {
    handleApiLocalGameStart(req, res);
    return true;
  }
  if (req.method === "POST" && requestPath === "/api/local-game/state") {
    handleApiLocalGameState(req, res);
    return true;
  }
  sendJson(res, 404, { error: "Not found." });
  return true;
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  let urlObj;
  try {
    const host = req.headers.host || "localhost";
    urlObj = new URL(req.url, `http://${host}`);
  } catch (_err) {
    res.writeHead(400);
    res.end("Bad path");
    return;
  }
  const requestPath = urlObj.pathname;
  if (requestPath.startsWith("/api/")) {
    handleApiRequest(req, res, requestPath, urlObj);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  let filePath;
  try {
    filePath = requestPath === "/" ? "/index.html" : decodeURIComponent(requestPath);
  } catch (_err) {
    res.writeHead(400);
    res.end("Bad path");
    return;
  }
  const fullPath = path.resolve(path.join(ROOT_DIR, filePath));
  const insideRoot = fullPath === ROOT_DIR || fullPath.startsWith(ROOT_DIR + path.sep);
  if (!insideRoot) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (err, buffer) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(buffer);
  });
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  const clientId = `c${nextClientId.toString(36)}`;
  nextClientId += 1;
  socketMeta.set(ws, { id: clientId, roomCode: "" });
  sendMessage(ws, { type: "welcome", clientId });

  ws.on("message", (raw) => {
    let payload;
    try {
      payload = JSON.parse(String(raw));
    } catch (_err) {
      return;
    }
    if (!payload || typeof payload !== "object") return;

    if (payload.type === "create_room") {
      handleCreateRoom(ws, payload);
      return;
    }
    if (payload.type === "join_room") {
      handleJoinRoom(ws, payload);
      return;
    }
    if (payload.type === "leave_room") {
      leaveRoom(ws);
      return;
    }
    if (payload.type === "start_game") {
      handleStartGame(ws, payload);
      return;
    }
    if (payload.type === "state_sync") {
      handleStateSync(ws, payload);
      return;
    }
    if (payload.type === "rollback_state") {
      handleRollbackState(ws);
    }
  });

  ws.on("close", () => {
    leaveRoom(ws);
    socketMeta.delete(ws);
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Catan server listening on http://localhost:${PORT}`);
});
