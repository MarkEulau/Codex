"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 8000;
const ROOT_DIR = process.cwd();
const ROOM_MAX_PLAYERS = 4;
const ROOM_MIN_PLAYERS = 3;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
let nextClientId = 1;

function sendMessage(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function sanitizeName(raw, fallback = "Player") {
  const name = String(raw ?? "").trim();
  if (!name) return fallback;
  return name.slice(0, 18);
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
  room.version = 0;
  room.turnSeconds = Number(payload.turnSeconds) || 60;
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

  if (room.gameState && typeof room.gameState.currentPlayer === "number") {
    const expectedPlayerId = room.seatMap[room.gameState.currentPlayer];
    if (expectedPlayerId && expectedPlayerId !== meta.id && room.hostId !== meta.id) {
      sendMessage(ws, { type: "room_error", message: "Not your turn." });
      return;
    }
  }

  room.gameState = payload.gameState;
  room.version += 1;
  broadcastRoomState(room);
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  const requestPath = req.url.split("?")[0];
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
