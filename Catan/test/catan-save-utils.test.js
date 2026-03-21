"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SAVE_SCHEMA_VERSION,
  normalizeHand,
  emptyRollHistogram,
  makeSaveId,
  saveRecordKey,
  formatSaveTimestamp,
  friendlySavePhase,
  sortSaveSummaries,
  sanitizeSaveIndex,
  captureGameSnapshot,
  buildSaveSummary,
  deserializeSnapshot,
} = require("../catan-save-utils.js");

const RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"];
const DICE_SUMS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const PLAYER_COLORS = ["#b93b2a", "#2b66be", "#d49419", "#2f8852"];
const DEFAULT_TURN_SECONDS = 60;

function clampTurnSeconds(raw) {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_TURN_SECONDS;
  return Math.min(600, Math.max(1, parsed));
}

function createBaseState() {
  const rollHistogram = emptyRollHistogram(DICE_SUMS);
  rollHistogram[6] = 1;
  rollHistogram[8] = 2;

  return {
    players: [
      {
        name: "Alice",
        color: PLAYER_COLORS[0],
        hand: { wood: 2, brick: 1, sheep: 0, wheat: 1, ore: 0 },
        roads: new Set([0]),
        settlements: new Set([0]),
        cities: new Set(),
      },
      {
        name: "Bob",
        color: PLAYER_COLORS[1],
        hand: { wood: 0, brick: 0, sheep: 1, wheat: 2, ore: 3 },
        roads: new Set([2]),
        settlements: new Set(),
        cities: new Set([2]),
      },
      {
        name: "Casey",
        color: PLAYER_COLORS[2],
        hand: { wood: 1, brick: 0, sheep: 1, wheat: 0, ore: 0 },
        roads: new Set(),
        settlements: new Set(),
        cities: new Set(),
      },
    ],
    tiles: [
      {
        idx: 0,
        q: 0,
        r: 0,
        resource: "wood",
        number: 8,
        cx: 10,
        cy: 20,
        corners: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 1 },
          { x: 1, y: 2 },
          { x: 0, y: 2 },
          { x: -1, y: 1 },
        ],
        nodes: [0, 1, 2],
      },
    ],
    nodes: [
      { idx: 0, x: 0, y: 0, hexes: [0], edges: new Set([0, 2]), owner: 0, isCity: false },
      { idx: 1, x: 1, y: 0, hexes: [0], edges: new Set([0, 1]), owner: null, isCity: false },
      { idx: 2, x: 2, y: 1, hexes: [0], edges: new Set([1, 2]), owner: 1, isCity: true },
    ],
    edges: [
      { idx: 0, a: 0, b: 1, owner: 0 },
      { idx: 1, a: 1, b: 2, owner: null },
      { idx: 2, a: 0, b: 2, owner: 1 },
    ],
    geometry: { minX: 0, minY: 0, width: 100, height: 120 },
    robberTile: 0,
    phase: "main",
    setup: null,
    currentPlayer: 1,
    round: 3,
    hasRolled: true,
    diceResult: 8,
    rollHistogram,
    rollCountTotal: 3,
    histogramOpen: true,
    turnSeconds: 75,
    turnTimerActive: true,
    turnTimerEndMs: Date.now() + 24000,
    turnTimerRemainingMs: 24000,
    turnTimeoutBusy: false,
    pendingRobberMove: false,
    mode: "road",
    tradeMenuOpen: true,
    status: "Bob: choose actions, then end turn.",
    log: ["Bob rolled 8.", "Alice built a road."],
    currentSaveId: "game-fixed-save-id",
    saveCreatedAt: "2026-03-21T08:00:00.000Z",
    lastSaveAt: "2026-03-21T08:05:00.000Z",
  };
}

test("normalizeHand clamps invalid counts to safe integers", () => {
  assert.deepEqual(normalizeHand({ wood: 2.9, brick: -4, sheep: "3", wheat: null }, RESOURCES), {
    wood: 2,
    brick: 0,
    sheep: 3,
    wheat: 0,
    ore: 0,
  });
});

test("sanitizeSaveIndex removes duplicates and missing records, then sorts newest first", () => {
  const raw = [
    {
      id: "older",
      createdAt: "2026-03-21T08:00:00.000Z",
      savedAt: "2026-03-21T08:01:00.000Z",
      phase: "main",
      round: 2,
      currentPlayerName: "Alice",
      playerNames: ["Alice", "Bob", "Casey"],
    },
    {
      id: "missing",
      createdAt: "2026-03-21T08:00:00.000Z",
      savedAt: "2026-03-21T08:03:00.000Z",
      phase: "setup",
      round: 1,
      currentPlayerName: "Bob",
      playerNames: ["Alice", "Bob", "Casey"],
    },
    {
      id: "newer",
      createdAt: "2026-03-21T08:00:00.000Z",
      savedAt: "2026-03-21T08:04:00.000Z",
      phase: "main",
      round: 3,
      currentPlayerName: "Casey",
      playerNames: ["Alice", "Bob", "Casey"],
    },
    {
      id: "newer",
      createdAt: "2026-03-21T08:00:00.000Z",
      savedAt: "2026-03-21T08:04:00.000Z",
      phase: "main",
      round: 3,
      currentPlayerName: "Casey",
      playerNames: ["Alice", "Bob", "Casey"],
    },
  ];

  const { items, dirty } = sanitizeSaveIndex(raw, (saveId) => saveId !== "missing");

  assert.equal(dirty, true);
  assert.deepEqual(items.map((item) => item.id), ["newer", "older"]);
});

test("helper utilities produce stable save labels and ids", () => {
  const saveId = makeSaveId();

  assert.match(saveId, /^game-\d+-[a-z0-9]+$/);
  assert.equal(saveRecordKey("abc123"), "catan:save:v1:abc123");
  assert.equal(formatSaveTimestamp(""), "unknown time");
  assert.equal(formatSaveTimestamp("not-a-date"), "not-a-date");
  assert.equal(friendlySavePhase({ phase: "main", round: 4 }), "Round 4");
  assert.equal(friendlySavePhase({ phase: "setup", round: 1 }), "Setup");
  assert.equal(friendlySavePhase({ phase: "gameover", round: 1 }), "Game Over");
  assert.equal(friendlySavePhase({ phase: "pregame", round: 1 }), "Pregame");
});

test("sortSaveSummaries and sanitizeSaveIndex preserve a clean sorted index", () => {
  const raw = sortSaveSummaries([
    {
      id: "b",
      createdAt: "2026-03-21T08:00:00.000Z",
      savedAt: "2026-03-21T08:02:00.000Z",
      phase: "main",
      round: 2,
      currentPlayerName: "Bob",
      playerNames: ["Alice", "Bob", "Casey"],
    },
    {
      id: "a",
      createdAt: "2026-03-21T08:00:00.000Z",
      savedAt: "2026-03-21T08:01:00.000Z",
      phase: "setup",
      round: 1,
      currentPlayerName: "Alice",
      playerNames: ["Alice", "Bob", "Casey"],
    },
  ]);

  const { items, dirty } = sanitizeSaveIndex(raw, () => true);

  assert.equal(dirty, false);
  assert.deepEqual(items, raw);
});

test("captureGameSnapshot skips incomplete games", () => {
  const pregameState = createBaseState();
  pregameState.phase = "pregame";
  assert.equal(
    captureGameSnapshot({
      state: pregameState,
      resources: RESOURCES,
      diceSums: DICE_SUMS,
      turnTimerRemainingMs: 1000,
    }),
    null
  );
});

test("captureGameSnapshot and deserializeSnapshot round-trip core game state", () => {
  const snapshot = captureGameSnapshot({
    state: createBaseState(),
    resources: RESOURCES,
    diceSums: DICE_SUMS,
    turnTimerRemainingMs: 12345,
  });

  assert.equal(snapshot.version, SAVE_SCHEMA_VERSION);
  assert.deepEqual(snapshot.players[0].roads, [0]);
  assert.deepEqual(snapshot.nodes[0].edges, [0, 2]);
  assert.equal(snapshot.turnTimerRemainingMs, 12345);

  const restored = deserializeSnapshot({
    snapshot,
    resources: RESOURCES,
    diceSums: DICE_SUMS,
    playerColors: PLAYER_COLORS,
    clampTurnSeconds,
  });

  assert.ok(restored);
  assert.equal(restored.phase, "main");
  assert.equal(restored.currentPlayer, 1);
  assert.equal(restored.turnTimerRemainingMs, 12345);
  assert.equal(restored.tradeMenuOpen, true);
  assert.equal(restored.mode, "road");
  assert.equal(restored.currentSaveId, "game-fixed-save-id");
  assert.equal(restored.players[0].roads.has(0), true);
  assert.equal(restored.players[1].cities.has(2), true);
  assert.equal(restored.players[0].settlements.has(0), true);
});

test("deserializeSnapshot forces robber mode for pending robber moves and rejects invalid snapshots", () => {
  const snapshot = captureGameSnapshot({
    state: createBaseState(),
    resources: RESOURCES,
    diceSums: DICE_SUMS,
    turnTimerRemainingMs: 5000,
  });
  snapshot.pendingRobberMove = true;
  snapshot.mode = "road";
  snapshot.tradeMenuOpen = true;
  snapshot.phase = "setup";

  const restored = deserializeSnapshot({
    snapshot,
    resources: RESOURCES,
    diceSums: DICE_SUMS,
    playerColors: PLAYER_COLORS,
    clampTurnSeconds,
  });

  assert.ok(restored);
  assert.equal(restored.mode, "robber");
  assert.equal(restored.tradeMenuOpen, false);

  const invalid = deserializeSnapshot({
    snapshot: { ...snapshot, players: snapshot.players.slice(0, 2) },
    resources: RESOURCES,
    diceSums: DICE_SUMS,
    playerColors: PLAYER_COLORS,
    clampTurnSeconds,
  });

  assert.equal(invalid, null);
});

test("deserializeSnapshot normalizes fallback values from malformed save data", () => {
  const snapshot = captureGameSnapshot({
    state: createBaseState(),
    resources: RESOURCES,
    diceSums: DICE_SUMS,
    turnTimerRemainingMs: 6000,
  });

  snapshot.phase = "not-real";
  snapshot.setup = { order: "bad", turnIndex: "bad", expecting: "bad", lastSettlementNode: "bad", selectedSettlementNode: "bad" };
  snapshot.currentPlayer = 99;
  snapshot.round = "bad";
  snapshot.rollCountTotal = "bad";
  snapshot.turnSeconds = 9999;
  snapshot.turnTimerRemainingMs = "nope";
  snapshot.tradeMenuOpen = true;
  snapshot.status = "";
  snapshot.log = ["ok", 123, null, "still ok"];
  snapshot.saveId = "";
  snapshot.createdAt = "";
  snapshot.savedAt = "2026-03-21T09:00:00.000Z";

  const restored = deserializeSnapshot({
    snapshot,
    resources: RESOURCES,
    diceSums: DICE_SUMS,
    playerColors: PLAYER_COLORS,
    clampTurnSeconds,
  });

  assert.ok(restored);
  assert.equal(restored.phase, "pregame");
  assert.equal(restored.currentPlayer, 0);
  assert.equal(restored.round, 1);
  assert.equal(restored.turnSeconds, 600);
  assert.equal(restored.turnTimerRemainingMs, 600000);
  assert.equal(restored.tradeMenuOpen, false);
  assert.equal(restored.status, "Game resumed.");
  assert.deepEqual(restored.log, ["ok", "still ok"]);
  assert.match(restored.currentSaveId, /^game-\d+-[a-z0-9]+$/);
  assert.equal(restored.saveCreatedAt, "2026-03-21T09:00:00.000Z");
  assert.deepEqual(restored.setup, {
    order: [],
    turnIndex: 0,
    expecting: "settlement",
    lastSettlementNode: null,
    selectedSettlementNode: null,
  });
});

test("buildSaveSummary reports the active player and table metadata", () => {
  const snapshot = captureGameSnapshot({
    state: createBaseState(),
    resources: RESOURCES,
    diceSums: DICE_SUMS,
    turnTimerRemainingMs: 6000,
  });

  const summary = buildSaveSummary(snapshot);
  assert.equal(summary.id, "game-fixed-save-id");
  assert.equal(summary.currentPlayerName, "Bob");
  assert.equal(summary.round, 3);
  assert.deepEqual(summary.playerNames, ["Alice", "Bob", "Casey"]);
});
