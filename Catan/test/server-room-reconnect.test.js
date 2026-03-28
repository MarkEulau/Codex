"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const server = require("../server.js");

function connectClient() {
  const ws = server.createMockSocket();
  const clientId = server.registerSocket(ws);
  return { ws, clientId };
}

function dispatch(ws, type, payload = {}) {
  server.dispatchSocketCommand(ws, { type, ...payload });
}

function lastMessage(ws, type) {
  for (let idx = ws.messages.length - 1; idx >= 0; idx -= 1) {
    if (ws.messages[idx]?.type === type) return ws.messages[idx];
  }
  return null;
}

function lastRoomState(ws) {
  const msg = lastMessage(ws, "room_state");
  assert.ok(msg, "expected a room_state message");
  return msg.room;
}

function setupStartedRoom() {
  const host = connectClient();
  dispatch(host.ws, "create_room", { name: "Host" });
  const roomCode = lastRoomState(host.ws).code;

  const bob = connectClient();
  dispatch(bob.ws, "join_room", { code: roomCode, name: "Bob" });

  const cara = connectClient();
  dispatch(cara.ws, "join_room", { code: roomCode, name: "Cara" });

  dispatch(host.ws, "start_game", { turnSeconds: 75 });
  const room = server.getRoom(roomCode);
  assert.ok(room, "expected room to exist after start");
  assert.equal(room.started, true);

  return { roomCode, host, bob, cara, room };
}

test.beforeEach(() => {
  server.resetServerState();
});

test("started rooms issue reconnect tokens per seat and expose them to each socket", () => {
  const { host, bob, cara, room } = setupStartedRoom();

  const tokens = room.players.map((player) => player.reconnectToken);
  assert.equal(new Set(tokens).size, tokens.length);
  assert.ok(tokens.every((token) => typeof token === "string" && token.length > 0));

  const hostState = lastRoomState(host.ws);
  const bobState = lastRoomState(bob.ws);
  const caraState = lastRoomState(cara.ws);

  assert.equal(hostState.self.id, room.players[0].id);
  assert.equal(hostState.self.seatIndex, 0);
  assert.equal(hostState.self.reconnectToken, room.players[0].reconnectToken);

  assert.equal(bobState.self.id, room.players[1].id);
  assert.equal(bobState.self.seatIndex, 1);
  assert.equal(bobState.self.reconnectToken, room.players[1].reconnectToken);

  assert.equal(caraState.self.id, room.players[2].id);
  assert.equal(caraState.self.seatIndex, 2);
  assert.equal(caraState.self.reconnectToken, room.players[2].reconnectToken);
});

test("resume_room restores a disconnected seat, keeps seatMap stable, and preserves the current host", () => {
  const { roomCode, host, bob, cara, room } = setupStartedRoom();
  const originalSeatMap = room.seatMap.slice();
  const hostToken = room.players[0].reconnectToken;
  const bobToken = room.players[1].reconnectToken;
  const caraToken = room.players[2].reconnectToken;

  server.simulateSocketClose(host.ws);
  assert.equal(room.hostId, room.players[1].id, "host handoff should move to the first connected player");
  assert.equal(room.players[0].connected, false);

  server.simulateSocketClose(bob.ws);
  assert.equal(room.hostId, room.players[2].id, "host handoff should continue as players disconnect");
  assert.equal(room.players[1].connected, false);

  server.simulateSocketClose(cara.ws);
  assert.equal(room.hostId, "", "room host should clear once everyone disconnects");
  assert.equal(room.players[2].connected, false);
  assert.ok(server.getRoom(roomCode), "started room should persist after full disconnect");

  const rejoinBob = connectClient();
  dispatch(rejoinBob.ws, "resume_room", { code: roomCode, reconnectToken: bobToken });

  assert.equal(room.players[1].connected, true);
  assert.equal(room.players[1].ws, rejoinBob.ws);
  assert.equal(room.hostId, room.players[1].id, "first reconnect after empty room should reclaim host");
  assert.deepEqual(room.seatMap, originalSeatMap);

  const bobState = lastRoomState(rejoinBob.ws);
  assert.equal(bobState.self.id, room.players[1].id);
  assert.equal(bobState.self.reconnectToken, bobToken);
  assert.equal(bobState.self.seatIndex, 1);

  const rejoinHost = connectClient();
  dispatch(rejoinHost.ws, "resume_room", { code: roomCode, reconnectToken: hostToken });

  assert.equal(room.players[0].connected, true);
  assert.equal(room.players[0].ws, rejoinHost.ws);
  assert.equal(room.hostId, room.players[1].id, "existing host should not be displaced by a later reconnect");
  assert.deepEqual(room.seatMap, originalSeatMap);

  const hostState = lastRoomState(rejoinHost.ws);
  assert.equal(hostState.self.id, room.players[0].id);
  assert.equal(hostState.self.reconnectToken, hostToken);
  assert.equal(hostState.self.seatIndex, 0);

  const rejoinCara = connectClient();
  dispatch(rejoinCara.ws, "resume_room", { code: roomCode, reconnectToken: caraToken });
  assert.equal(room.players[2].connected, true);
  assert.equal(room.players[2].ws, rejoinCara.ws);
  assert.equal(room.hostId, room.players[1].id);
  assert.deepEqual(room.seatMap, originalSeatMap);
});

test("resume_room rejects invalid or premature reconnect attempts", () => {
  const { roomCode, host, bob } = setupStartedRoom();
  const invalid = connectClient();

  dispatch(invalid.ws, "resume_room", { code: roomCode, reconnectToken: "bad-token" });
  assert.equal(lastMessage(invalid.ws, "room_error").message, "Reconnect token not recognized.");

  server.simulateSocketClose(host.ws);
  const liveSeat = connectClient();
  dispatch(liveSeat.ws, "resume_room", { code: roomCode, reconnectToken: bob.ws.messages.length ? lastRoomState(bob.ws).self.reconnectToken : "" });
  assert.equal(lastMessage(liveSeat.ws, "room_error").message, "That seat is already connected.");
});

test("rooms can start with six players in the extension setup", () => {
  const host = connectClient();
  dispatch(host.ws, "create_room", { name: "Host" });
  const roomCode = lastRoomState(host.ws).code;

  ["Bob", "Cara", "Dana", "Eli", "Fin"].forEach((name) => {
    const player = connectClient();
    dispatch(player.ws, "join_room", { code: roomCode, name });
  });

  dispatch(host.ws, "start_game", { turnSeconds: 90 });
  const room = server.getRoom(roomCode);
  assert.ok(room, "expected room to exist");
  assert.equal(room.started, true);
  assert.equal(room.players.length, 6);
  assert.equal(room.seatMap.length, 6);
});
