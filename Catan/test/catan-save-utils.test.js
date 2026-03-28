"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SAVE_SCHEMA_VERSION,
  RESOURCE_TYPES,
  DEV_CARD_TYPES,
  createResourceMap,
  createBank,
  createDevelopmentDeck,
  normalizeDevelopmentState,
  normalizeAwards,
  normalizeHarbors,
  normalizeTurnState,
  migrateSnapshot,
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
const PLAYER_COLORS = ["#b93b2a", "#2b66be", "#d49419", "#2f8852", "#7b4cbf", "#9a6733"];
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
    bank: createBank(),
    devDeck: createDevelopmentDeck(),
    harbors: [
      { idx: 0, type: "generic", nodes: [0, 1] },
      { idx: 1, resource: "wood", nodeIds: [1, 2] },
    ],
    awards: {
      longestRoadHolder: 0,
      longestRoadLength: 3,
      largestArmyHolder: 1,
      largestArmyCount: 2,
    },
    turnState: {
      mainStep: "main_actions",
      pairStep: "paired",
      pairPlayerIndex: 2,
      pairTurnIndex: 1,
    },
    mainStep: "main_actions",
    pairStep: "paired",
    pairPlayerIndex: 2,
    pairTurnIndex: 1,
    currentSaveId: "game-fixed-save-id",
    saveCreatedAt: "2026-03-21T08:00:00.000Z",
    lastSaveAt: "2026-03-21T08:05:00.000Z",
  };
}

function createSixPlayerState() {
  const state = createBaseState();
  state.players = [
    ...state.players,
    {
      name: "Dana",
      color: PLAYER_COLORS[3],
      hand: { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 1 },
      roads: new Set([3]),
      settlements: new Set([3]),
      cities: new Set(),
      devCards: {
        hand: { knight: 1, road_building: 0, year_of_plenty: 1, monopoly: 0, victory_point: 1 },
        boughtThisTurn: { knight: 0, road_building: 0, year_of_plenty: 0, monopoly: 0, victory_point: 0 },
        playedNonVictoryThisTurn: false,
        playedKnights: 1,
        freeRoadPlacements: 0,
      },
      playedKnights: 1,
    },
    {
      name: "Eli",
      color: PLAYER_COLORS[4],
      hand: { wood: 0, brick: 2, sheep: 0, wheat: 2, ore: 1 },
      roads: new Set([4]),
      settlements: new Set(),
      cities: new Set(),
      devCards: {
        hand: { knight: 0, road_building: 1, year_of_plenty: 0, monopoly: 1, victory_point: 0 },
        boughtThisTurn: { knight: 1, road_building: 0, year_of_plenty: 0, monopoly: 0, victory_point: 0 },
        playedNonVictoryThisTurn: true,
        playedKnights: 2,
        freeRoadPlacements: 1,
      },
      playedKnights: 2,
    },
    {
      name: "Fin",
      color: PLAYER_COLORS[5],
      hand: { wood: 0, brick: 0, sheep: 2, wheat: 1, ore: 2 },
      roads: new Set(),
      settlements: new Set([4]),
      cities: new Set([2]),
      devCards: {
        hand: { knight: 2, road_building: 0, year_of_plenty: 0, monopoly: 0, victory_point: 2 },
        boughtThisTurn: { knight: 0, road_building: 1, year_of_plenty: 0, monopoly: 0, victory_point: 0 },
        playedNonVictoryThisTurn: false,
        playedKnights: 0,
        freeRoadPlacements: 0,
      },
      playedKnights: 0,
    },
  ];
  state.players[1].devCards = {
    hand: { knight: 0, road_building: 0, year_of_plenty: 0, monopoly: 0, victory_point: 0 },
    boughtThisTurn: { knight: 0, road_building: 0, year_of_plenty: 0, monopoly: 0, victory_point: 0 },
    playedNonVictoryThisTurn: false,
    playedKnights: 0,
    freeRoadPlacements: 0,
  };
  state.players[1].playedKnights = 0;
  state.bank = createBank(6);
  state.devDeck = createDevelopmentDeck(6);
  state.harbors = normalizeHarbors([
    { idx: 0, type: "generic", nodeIds: [0, 1] },
    { idx: 1, type: "wood", nodeIndices: [1, 2] },
  ]);
  state.awards = normalizeAwards({
    longestRoadHolder: 4,
    longestRoadLength: 7,
    largestArmyHolder: 5,
    largestArmyCount: 3,
  });
  state.turnState = normalizeTurnState({
    mainStep: "dev_card_resolution",
    pairStep: "paired",
    pairPlayerIndex: 4,
    pairTurnIndex: 2,
  });
  state.mainStep = state.turnState.mainStep;
  state.pairStep = state.turnState.pairStep;
  state.pairPlayerIndex = state.turnState.pairPlayerIndex;
  state.pairTurnIndex = state.turnState.pairTurnIndex;
  state.currentPlayer = 4;
  state.currentSaveId = "game-six-player-save-id";
  state.saveCreatedAt = "2026-03-21T08:10:00.000Z";
  state.lastSaveAt = "2026-03-21T08:15:00.000Z";
  return state;
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
  assert.equal(friendlySavePhase({ phase: "main", round: 4, mainStep: "move_robber" }), "Round 4 - Move Robber");
  assert.equal(friendlySavePhase({ phase: "main", round: 4, pairStep: "paired" }), "Round 4 - Pair Turn");
  assert.equal(friendlySavePhase({ phase: "setup", round: 1 }), "Setup");
  assert.equal(friendlySavePhase({ phase: "gameover", round: 1 }), "Game Over");
  assert.equal(friendlySavePhase({ phase: "pregame", round: 1 }), "Pregame");
});

test("bank and development deck helpers support the 5-6 player extension", () => {
  assert.deepEqual(createBank(), { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 });
  assert.deepEqual(createBank(6), { wood: 24, brick: 24, sheep: 24, wheat: 24, ore: 24 });

  const baseDeck = createDevelopmentDeck();
  const extensionDeck = createDevelopmentDeck(6);
  assert.equal(baseDeck.length, 25);
  assert.equal(extensionDeck.length, 34);
  assert.equal(extensionDeck.filter((card) => card === "knight").length, 20);
  assert.equal(extensionDeck.filter((card) => card === "victory_point").length, 5);
});

test("normalization helpers preserve the new runtime state contract", () => {
  assert.deepEqual(createResourceMap(2, ["a", "b"]), { a: 2, b: 2 });
  assert.deepEqual(
    normalizeDevelopmentState({
      hand: { knight: 2, road_building: 1, year_of_plenty: -3, monopoly: "1", victory_point: 4 },
      boughtThisTurn: { knight: 1, road_building: 0, year_of_plenty: 2, monopoly: 1, victory_point: 0 },
      playedNonVictoryThisTurn: true,
      playedKnights: 3,
      freeRoadPlacements: 2,
    }),
    {
      hand: { knight: 2, road_building: 1, year_of_plenty: 0, monopoly: 1, victory_point: 4 },
      boughtThisTurn: { knight: 1, road_building: 0, year_of_plenty: 2, monopoly: 1, victory_point: 0 },
      playedNonVictoryThisTurn: true,
      playedKnights: 3,
      freeRoadPlacements: 2,
    }
  );

  assert.deepEqual(
    normalizeAwards({
      longestRoad: { holder: 4, length: 7 },
      largestArmy: { holder: 5, count: 3 },
    }),
    {
      longestRoad: { holder: 4, length: 7 },
      largestArmy: { holder: 5, count: 3 },
      longestRoadHolder: 4,
      longestRoadLength: 7,
      largestArmyHolder: 5,
      largestArmyCount: 3,
    }
  );

  assert.deepEqual(
    normalizeHarbors([
      { resource: "wood", nodeIds: [3, 1, 3] },
      { type: "generic", nodeIndices: [8, 7] },
    ]),
    [
      { idx: 0, resource: "wood", nodeIds: [3, 1, 3], type: "wood", nodes: [1, 3] },
      { idx: 1, type: "generic", nodeIndices: [8, 7], nodes: [7, 8] },
    ]
  );

  assert.equal(
    normalizeTurnState({ main: { step: "move_robber" }, pair: { step: "paired", playerIndex: 4, turnIndex: 2 } }, { phase: "main" }).mainStep,
    "move_robber"
  );
  assert.equal(
    normalizeTurnState({}, { phase: "main", mainStep: "main_actions", pairStep: "paired", pairPlayerIndex: 2, pairTurnIndex: 1 }).pairStep,
    "paired"
  );
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
      playerCount: 3,
      mainStep: "main_actions",
      pairStep: "paired",
    },
    {
      id: "a",
      createdAt: "2026-03-21T08:00:00.000Z",
      savedAt: "2026-03-21T08:01:00.000Z",
      phase: "setup",
      round: 1,
      currentPlayerName: "Alice",
      playerNames: ["Alice", "Bob", "Casey"],
      playerCount: 3,
      mainStep: "setup",
      pairStep: "inactive",
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
  assert.deepEqual(snapshot.bank, { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 });
  assert.equal(snapshot.devDeck.length, 25);
  assert.deepEqual(snapshot.awards, {
    longestRoadHolder: 0,
    longestRoadLength: 3,
    largestArmyHolder: 1,
    largestArmyCount: 2,
    longestRoad: { holder: 0, length: 3 },
    largestArmy: { holder: 1, count: 2 },
  });
  assert.equal(snapshot.turnState.mainStep, "main_actions");
  assert.equal(snapshot.pairStep, "paired");

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
  assert.deepEqual(restored.bank, { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 });
  assert.equal(restored.devDeck.length, 25);
  assert.equal(restored.awards.longestRoadHolder, 0);
  assert.equal(restored.awards.largestArmyHolder, 1);
  assert.equal(restored.turnState.mainStep, "main_actions");
  assert.equal(restored.turnState.pairStep, "paired");
});

test("captureGameSnapshot and deserializeSnapshot preserve the 6-player extension contract", () => {
  const snapshot = captureGameSnapshot({
    state: createSixPlayerState(),
    resources: RESOURCES,
    diceSums: DICE_SUMS,
    turnTimerRemainingMs: 22000,
  });

  assert.equal(snapshot.players.length, 6);
  assert.deepEqual(snapshot.bank, { wood: 24, brick: 24, sheep: 24, wheat: 24, ore: 24 });
  assert.equal(snapshot.devDeck.length, 34);
  assert.equal(snapshot.players[4].devCards.boughtThisTurn.knight, 1);
  assert.equal(snapshot.players[4].playedKnights, 2);
  assert.equal(snapshot.awards.longestRoadHolder, 4);
  assert.equal(snapshot.turnState.mainStep, "dev_card_resolution");
  assert.equal(snapshot.turnState.pairStep, "paired");

  const restored = deserializeSnapshot({
    snapshot,
    resources: RESOURCES,
    diceSums: DICE_SUMS,
    playerColors: PLAYER_COLORS,
    clampTurnSeconds,
  });

  assert.ok(restored);
  assert.equal(restored.players.length, 6);
  assert.deepEqual(restored.bank, { wood: 24, brick: 24, sheep: 24, wheat: 24, ore: 24 });
  assert.equal(restored.devDeck.length, 34);
  assert.equal(restored.players[4].devCards.boughtThisTurn.knight, 1);
  assert.equal(restored.players[4].playedKnights, 2);
  assert.equal(restored.awards.largestArmyHolder, 5);
  assert.equal(restored.turnState.pairPlayerIndex, 4);
  assert.equal(restored.turnState.pairTurnIndex, 2);
});

test("migrateSnapshot upgrades a legacy v1 save into the new 6-player shape", () => {
  const legacySnapshot = {
    version: 1,
    saveId: "legacy-six-player",
    createdAt: "2026-03-21T08:00:00.000Z",
    savedAt: "2026-03-21T08:12:00.000Z",
    players: createSixPlayerState().players.map((player, idx) => ({
      name: player.name,
      color: player.color,
      hand: player.hand,
      roads: Array.from(player.roads),
      settlements: Array.from(player.settlements),
      cities: Array.from(player.cities),
      devCards: player.devCards,
      playedKnights: player.playedKnights,
    })),
    tiles: createBaseState().tiles,
    nodes: createBaseState().nodes,
    edges: createBaseState().edges,
    geometry: createBaseState().geometry,
    robberTile: 0,
    phase: "main",
    hasRolled: true,
    diceResult: 7,
    pendingRobberMove: false,
    mode: "robber",
    tradeMenuOpen: true,
    status: "Legacy save",
    log: ["Legacy save"],
    rollHistogram: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 2, 9: 0, 10: 0, 11: 0, 12: 0 },
    turnSeconds: 75,
    turnTimerRemainingMs: 18000,
    mainStep: "dev_card_resolution",
    pairStep: "paired",
    pairPlayerIndex: 4,
    pairTurnIndex: 2,
    awards: {
      longestRoad: { holder: 4, length: 7 },
      largestArmy: { holder: 5, count: 3 },
    },
    harbors: [
      { resource: "wood", nodeIds: [0, 1] },
      { type: "generic", nodeIndices: [1, 2] },
    ],
  };

  const migrated = migrateSnapshot(legacySnapshot, {
    playerColors: PLAYER_COLORS,
    diceSums: DICE_SUMS,
  });

  assert.ok(migrated);
  assert.equal(migrated.version, SAVE_SCHEMA_VERSION);
  assert.deepEqual(migrated.bank, { wood: 24, brick: 24, sheep: 24, wheat: 24, ore: 24 });
  assert.equal(migrated.devDeck.length, 34);
  assert.equal(migrated.awards.longestRoadHolder, 4);
  assert.equal(migrated.awards.largestArmyHolder, 5);
  assert.equal(migrated.turnState.mainStep, "dev_card_resolution");
  assert.equal(migrated.turnState.pairStep, "paired");
  assert.equal(migrated.turnState.pairPlayerIndex, 4);
  assert.equal(migrated.turnState.pairTurnIndex, 2);
  assert.deepEqual(migrated.harbors[0].nodes, [0, 1]);
  assert.equal(migrated.players.length, 6);

  const restored = deserializeSnapshot({
    snapshot: migrated,
    resources: RESOURCES,
    diceSums: DICE_SUMS,
    playerColors: PLAYER_COLORS,
    clampTurnSeconds,
  });

  assert.ok(restored);
  assert.equal(restored.players.length, 6);
  assert.deepEqual(restored.bank, { wood: 24, brick: 24, sheep: 24, wheat: 24, ore: 24 });
  assert.equal(restored.devDeck.length, 34);
  assert.equal(restored.turnState.mainStep, "dev_card_resolution");
  assert.equal(restored.turnState.pairStep, "paired");
  assert.equal(restored.turnState.pairPlayerIndex, 4);
  assert.equal(restored.turnState.pairTurnIndex, 2);
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
  assert.equal(summary.playerCount, 3);
  assert.equal(summary.mainStep, "main_actions");
  assert.equal(summary.pairStep, "paired");
  assert.deepEqual(summary.playerNames, ["Alice", "Bob", "Casey"]);
});
