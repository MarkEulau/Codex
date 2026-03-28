"use strict";

const RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"];
const BASE_RESOURCE_COUNTS = {
  wood: 4,
  brick: 3,
  sheep: 4,
  wheat: 4,
  ore: 3,
  desert: 1,
};
const EXTENSION_RESOURCE_COUNTS = {
  wood: 6,
  brick: 5,
  sheep: 6,
  wheat: 6,
  ore: 5,
  desert: 2,
};
const BASE_NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const EXTENSION_NUMBER_TOKENS = [
  2,
  2,
  3,
  3,
  3,
  4,
  4,
  4,
  5,
  5,
  5,
  6,
  6,
  6,
  8,
  8,
  8,
  9,
  9,
  9,
  10,
  10,
  10,
  11,
  11,
  11,
  12,
  12,
];
const COST = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  development: { sheep: 1, wheat: 1, ore: 1 },
};
const PLAYER_COLORS = ["#b93b2a", "#2b66be", "#d49419", "#2f8852", "#7a4d24", "#2e8d73"];
const HIGH_PROBABILITY_NUMBERS = new Set([6, 8]);
const DICE_SUMS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DEFAULT_TURN_SECONDS = 60;
const RESOURCE_FX_COLORS = {
  wood: "rgba(118, 175, 82, 0.66)",
  brick: "rgba(218, 134, 98, 0.68)",
  sheep: "rgba(223, 241, 199, 0.72)",
  wheat: "rgba(237, 203, 88, 0.7)",
  ore: "rgba(174, 184, 206, 0.7)",
};
const {
  SAVE_SCHEMA_VERSION,
  SAVE_INDEX_KEY,
  makeSaveId,
  saveRecordKey,
  formatSaveTimestamp,
  friendlySavePhase,
  sanitizeSaveIndex,
  captureGameSnapshot: buildSnapshotData,
  buildSaveSummary,
  deserializeSnapshot,
} = window.CatanSaveUtils;
const {
  ROAD_COST,
  SETTLEMENT_COST,
  CITY_COST,
  DEVELOPMENT_CARD_COST,
  DEFAULT_PIECE_LIMITS,
  createBank,
  createDevelopmentDeck,
  normalizeDevelopmentState,
  promoteBoughtDevelopmentCards,
  countVictoryPointCards,
  canAffordCost,
  canBuildRoad: canBuildRoadByRule,
  canBuildSettlement: canBuildSettlementByRule,
  canBuildCity: canBuildCityByRule,
  performBankTrade,
  resolveHarborTradeRate,
  applyBankPayout,
  applyYearOfPlentyEffect,
  applyMonopolyEffect,
  buyDevelopmentCard,
  canPlayDevelopmentCard,
  spendDevelopmentCard,
  applyRoadBuildingEffect,
  applyResourceDelta,
  recomputeLargestArmy,
  recomputeLongestRoad,
  computeVictoryPoints,
} = window.CatanRules;
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
const EXTENSION_BOARD_ROWS = [3, 4, 5, 6, 5, 4, 3];
const HEX_SIZE = 74;
const BOARD_PADDING = 36;
const SVG_NS = "http://www.w3.org/2000/svg";
const ONLINE_MAX_PLAYERS = 6;
const PAIRED_PLAYER_OFFSET = 3;
const ROOM_TOKEN_KEY_PREFIX = "catan:room-token:";
const ROOM_RESUME_KEY_PREFIX = "catan:room-resume:";
const ROOM_CODE_REGEX = /^[A-Z0-9]{4,6}$/;

const state = {
  players: [],
  tiles: [],
  nodes: [],
  edges: [],
  geometry: null,
  robberTile: -1,
  bank: createBank(),
  devDeck: [],
  harbors: [],
  awards: {
    largestArmyHolder: null,
    largestArmyCount: 0,
    longestRoadHolder: null,
    longestRoadLength: 0,
  },

  phase: "pregame", // pregame | setup | main | gameover
  setup: null,
  currentPlayer: 0,
  round: 1,
  hasRolled: false,
  mainStep: "before_roll", // before_roll | discard | move_robber | main_actions | dev_card_resolution
  pairStep: "inactive",
  pairPlayerIndex: null,
  pairTurnIndex: null,
  turnState: {
    mainStep: "before_roll",
    pairStep: "inactive",
    pairPlayerIndex: null,
    pairTurnIndex: null,
  },
  pairedTurn: {
    enabled: false,
    primaryPlayer: 0,
    secondaryPlayer: null,
    stage: "primary", // primary | secondary
  },
  pendingDevReturnStep: "main_actions",
  pendingDevCardAction: "",
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
  activeTradeTab: "bank",
  tradeDrafts: {
    bank: { give: resourceMap(0), get: resourceMap(0) },
    player: { give: resourceMap(0), get: resourceMap(0) },
  },
  discardDraft: {
    playerIdx: null,
    required: 0,
    selection: resourceMap(0),
  },
  bankShortage: null,
  status: "Set players and start.",
  log: [],
  currentSaveId: null,
  saveCreatedAt: null,
  lastSaveAt: null,
  availableSaveCount: 0,
  saveStatus: "No local saves yet.",
};

const refs = {
  board: document.getElementById("board"),
  buildActionPopup: document.getElementById("buildActionPopup"),
  tradePromptPopup: document.getElementById("tradePromptPopup"),
  tradeActionPopup: document.getElementById("tradeActionPopup"),
  openBankTradeBtn: document.getElementById("openBankTradeBtn"),
  openPlayerTradeBtn: document.getElementById("openPlayerTradeBtn"),
  closeTradeMenuBtn: document.getElementById("closeTradeMenuBtn"),
  tradeTabBar: document.getElementById("tradeTabBar"),
  bankTradeTabBtn: document.getElementById("bankTradeTabBtn"),
  playerTradeTabBtn: document.getElementById("playerTradeTabBtn"),
  bankTradeSection: document.getElementById("bankTradeSection"),
  bankTradeTitle: document.getElementById("bankTradeTitle"),
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
  bankTradeGiveGrid: document.getElementById("bankTradeGiveGrid"),
  bankTradeGetGrid: document.getElementById("bankTradeGetGrid"),
  p2pTradeBtn: document.getElementById("p2pTradeBtn"),
  p2pTarget: document.getElementById("p2pTarget"),
  p2pGiveGrid: document.getElementById("p2pGiveGrid"),
  p2pGetGrid: document.getElementById("p2pGetGrid"),
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
  boardOrbDock: document.getElementById("boardOrbDock"),
  buildDock: document.getElementById("buildDock"),
  buildDockToggleBtn: document.getElementById("buildDockToggleBtn"),
  tradeDock: document.getElementById("tradeDock"),
  tradeDockToggleBtn: document.getElementById("tradeDockToggleBtn"),
  diceRollStage: document.getElementById("diceRollStage"),
  boardDieA: document.getElementById("boardDieA"),
  boardDieB: document.getElementById("boardDieB"),
  rollResultPopup: document.getElementById("rollResultPopup"),
  histogramToggleBtn: document.getElementById("histogramToggleBtn"),
  rollHistogram: document.getElementById("rollHistogram"),
  statusText: document.getElementById("statusText"),
  resourceFxLayer: document.getElementById("resourceFxLayer"),
  boardPlayerHud: document.getElementById("boardPlayerHud"),
  tableStats: document.getElementById("tableStats"),
  buildPanel: document.getElementById("buildPanel"),
  tradePanel: document.getElementById("tradePanel"),
  logList: document.getElementById("logList"),
  modeButtons: Array.from(document.querySelectorAll(".mode-btn")),
  actionModal: document.getElementById("actionModal"),
  actionModalTitle: document.getElementById("actionModalTitle"),
  actionModalText: document.getElementById("actionModalText"),
  actionModalOptions: document.getElementById("actionModalOptions"),
  actionModalCancelBtn: document.getElementById("actionModalCancelBtn"),
  discardModal: document.getElementById("discardModal"),
  discardModalTitle: document.getElementById("discardModalTitle"),
  discardModalText: document.getElementById("discardModalText"),
  discardResourceGrid: document.getElementById("discardResourceGrid"),
  discardModalHint: document.getElementById("discardModalHint"),
  discardSubmitBtn: document.getElementById("discardSubmitBtn"),
};

let actionModalResolver = null;
let discardModalResolver = null;
let turnTimerInterval = null;
let pendingRoomCommand = null;
let remoteSyncVersion = 0;
let roomStatusOverride = "";
let roomReconnectTimer = null;

const onlineState = {
  socket: null,
  connected: false,
  clientId: "",
  selfId: "",
  roomCode: "",
  hostId: "",
  started: false,
  players: [],
  seatMap: [],
  version: 0,
  historyCount: 0,
  saveFile: "",
  reconnectToken: "",
  reconnectAttempt: 0,
  reconnecting: false,
  expectedResume: false,
};

const localSaveState = {
  sessionId: "",
  saveFile: "",
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

function createEmptyTradeDraft() {
  return {
    give: resourceMap(0),
    get: resourceMap(0),
  };
}

function createEmptyDiscardDraft() {
  return {
    playerIdx: null,
    required: 0,
    selection: resourceMap(0),
  };
}

function ensureTradeDrafts() {
  if (!state.tradeDrafts || typeof state.tradeDrafts !== "object") {
    state.tradeDrafts = {
      bank: createEmptyTradeDraft(),
      player: createEmptyTradeDraft(),
    };
    return;
  }
  if (!state.tradeDrafts.bank) state.tradeDrafts.bank = createEmptyTradeDraft();
  if (!state.tradeDrafts.player) state.tradeDrafts.player = createEmptyTradeDraft();
}

function resetTradeDrafts(kind = null) {
  ensureTradeDrafts();
  if (kind) {
    state.tradeDrafts[kind] = createEmptyTradeDraft();
    return;
  }
  state.tradeDrafts.bank = createEmptyTradeDraft();
  state.tradeDrafts.player = createEmptyTradeDraft();
}

function normalizeActiveTradeTab(canBankTrade, canPlayerTrade) {
  if (canBankTrade && canPlayerTrade) {
    if (state.activeTradeTab !== "bank" && state.activeTradeTab !== "player") {
      state.activeTradeTab = "bank";
    }
    return state.activeTradeTab;
  }
  if (canBankTrade) {
    state.activeTradeTab = "bank";
    return state.activeTradeTab;
  }
  if (canPlayerTrade) {
    state.activeTradeTab = "player";
    return state.activeTradeTab;
  }
  state.activeTradeTab = "bank";
  return state.activeTradeTab;
}

function focusTradeTab(tab = state.activeTradeTab) {
  if (tab === "player") {
    refs.p2pTarget.focus();
    return;
  }
  refs.bankTradeGiveGrid.querySelector(".trade-resource-btn:not(:disabled)")?.focus();
}

function openTradeMenu(tab) {
  state.activeTradeTab = tab;
  state.tradeMenuOpen = true;
  render();
  focusTradeTab(state.activeTradeTab);
}

function switchTradeTab(tab) {
  state.activeTradeTab = tab;
  render();
  focusTradeTab(tab);
}

function ensureDiscardDraft() {
  if (!state.discardDraft || typeof state.discardDraft !== "object") {
    state.discardDraft = createEmptyDiscardDraft();
    return;
  }
  if (!state.discardDraft.selection || typeof state.discardDraft.selection !== "object") {
    state.discardDraft.selection = resourceMap(0);
  }
}

function resetDiscardDraft() {
  state.discardDraft = createEmptyDiscardDraft();
}

function tradeSelectionEntries(selection) {
  return RESOURCES.filter((resource) => (selection?.[resource] ?? 0) > 0).map((resource) => [
    resource,
    selection[resource],
  ]);
}

function tradeSelectionSummary(selection) {
  const entries = tradeSelectionEntries(selection);
  if (entries.length === 0) return "none";
  return entries.map(([resource, amount]) => `${resource} x${amount}`).join(" | ");
}

function discardSelectionTotal(selection) {
  return RESOURCES.reduce((total, resource) => {
    const parsed = Number(selection?.[resource] ?? 0);
    return total + (Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0);
  }, 0);
}

function discardDraftPlayer() {
  ensureDiscardDraft();
  const idx = Number(state.discardDraft.playerIdx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= state.players.length) return null;
  return state.players[idx];
}

function normalizeDiscardDraft() {
  ensureDiscardDraft();
  const player = discardDraftPlayer();
  state.discardDraft.required = Math.max(0, Math.floor(Number(state.discardDraft.required) || 0));

  for (const resource of RESOURCES) {
    const parsed = Number(state.discardDraft.selection[resource] || 0);
    const value = Number.isFinite(parsed) ? Math.floor(parsed) : 0;
    const limit = player ? player.hand[resource] : 0;
    state.discardDraft.selection[resource] = Math.max(0, Math.min(value, limit));
  }

  let extra = discardSelectionTotal(state.discardDraft.selection) - state.discardDraft.required;
  if (extra <= 0) return;
  for (const resource of RESOURCES.slice().reverse()) {
    if (extra <= 0) break;
    const removable = Math.min(extra, state.discardDraft.selection[resource] || 0);
    if (removable <= 0) continue;
    state.discardDraft.selection[resource] -= removable;
    extra -= removable;
  }
}

function discardDraftState() {
  ensureDiscardDraft();
  normalizeDiscardDraft();
  const player = discardDraftPlayer();
  const required = state.discardDraft.required;
  const selection = state.discardDraft.selection;
  const selected = discardSelectionTotal(selection);
  const remaining = Math.max(0, required - selected);
  return {
    player,
    required,
    selected,
    remaining,
    complete: Boolean(player && required > 0 && remaining === 0),
    selection: { ...selection },
    summary: tradeSelectionSummary(selection),
  };
}

function canIncreaseDiscardDraft(resource) {
  if (!RESOURCES.includes(resource)) return false;
  normalizeDiscardDraft();
  const player = discardDraftPlayer();
  if (!player) return false;
  if (discardSelectionTotal(state.discardDraft.selection) >= state.discardDraft.required) return false;
  return (state.discardDraft.selection[resource] || 0) < player.hand[resource];
}

function adjustDiscardDraft(resource, direction = 1) {
  if (!RESOURCES.includes(resource) || !discardModalResolver) return;
  normalizeDiscardDraft();
  if (direction > 0) {
    if (!canIncreaseDiscardDraft(resource)) return;
    state.discardDraft.selection[resource] += 1;
  } else {
    if ((state.discardDraft.selection[resource] || 0) <= 0) return;
    state.discardDraft.selection[resource] -= 1;
  }
  normalizeDiscardDraft();
  render();
}

function currentTradeTargetIndex() {
  const idx = Number(refs.p2pTarget.value);
  if (!Number.isInteger(idx) || idx < 0 || idx >= state.players.length || idx === state.currentPlayer) return null;
  return idx;
}

function resourceCardsInCirculation(resource) {
  if (!RESOURCES.includes(resource)) return 0;
  let total = Number(state.bank?.[resource] ?? 0) || 0;
  for (const player of state.players) {
    total += Number(player?.hand?.[resource] ?? 0) || 0;
  }
  return total;
}

function tradeStepAmount(kind, side, resource) {
  if (kind === "bank" && side === "give") return resolveHarborTradeRate(state, state.currentPlayer, resource);
  return 1;
}

function tradeResourceLimit(kind, side, resource) {
  if (!RESOURCES.includes(resource) || state.players.length === 0) return 0;
  if (kind === "bank") {
    return side === "give" ? currentPlayerObj().hand[resource] : state.bank[resource];
  }
  if (side === "give") return currentPlayerObj().hand[resource];
  const targetIdx = currentTradeTargetIndex();
  if (targetIdx === null) return 0;
  return resourceCardsInCirculation(resource);
}

function normalizeTradeDraft(kind) {
  ensureTradeDrafts();
  const draft = state.tradeDrafts[kind];
  if (!draft) return;

  for (const side of ["give", "get"]) {
    for (const resource of RESOURCES) {
      const step = tradeStepAmount(kind, side, resource);
      const limit = tradeResourceLimit(kind, side, resource);
      let value = Math.max(0, Math.min(draft[side][resource] || 0, limit));
      if (step > 1) value -= value % step;
      draft[side][resource] = value;
    }
  }

  for (const resource of RESOURCES) {
    const giveStep = tradeStepAmount(kind, "give", resource);
    const getStep = tradeStepAmount(kind, "get", resource);
    const cancelCount = Math.min(
      Math.floor((draft.give[resource] || 0) / giveStep),
      Math.floor((draft.get[resource] || 0) / getStep)
    );
    if (cancelCount > 0) {
      draft.give[resource] -= cancelCount * giveStep;
      draft.get[resource] -= cancelCount * getStep;
    }
  }
}

function canIncreaseTradeDraft(kind, side, resource) {
  ensureTradeDrafts();
  normalizeTradeDraft(kind);
  const draft = state.tradeDrafts[kind];
  const oppositeSide = side === "give" ? "get" : "give";
  if ((draft[oppositeSide][resource] || 0) > 0) return true;
  const step = tradeStepAmount(kind, side, resource);
  const limit = tradeResourceLimit(kind, side, resource);
  return (draft[side][resource] || 0) + step <= limit;
}

function adjustTradeDraft(kind, side, resource, direction = 1) {
  if (!RESOURCES.includes(resource)) return;
  ensureTradeDrafts();
  normalizeTradeDraft(kind);
  const draft = state.tradeDrafts[kind];
  const oppositeSide = side === "give" ? "get" : "give";

  if (direction > 0) {
    const oppositeStep = tradeStepAmount(kind, oppositeSide, resource);
    if ((draft[oppositeSide][resource] || 0) > 0) {
      draft[oppositeSide][resource] = Math.max(0, draft[oppositeSide][resource] - oppositeStep);
    } else {
      const step = tradeStepAmount(kind, side, resource);
      const limit = tradeResourceLimit(kind, side, resource);
      if ((draft[side][resource] || 0) + step > limit) return;
      draft[side][resource] += step;
    }
  } else {
    const step = tradeStepAmount(kind, side, resource);
    if ((draft[side][resource] || 0) <= 0) return;
    draft[side][resource] = Math.max(0, draft[side][resource] - step);
  }

  normalizeTradeDraft(kind);
  render();
}

function bankTradeDraftState() {
  ensureTradeDrafts();
  normalizeTradeDraft("bank");
  const draft = state.tradeDrafts.bank;
  const giveEntries = tradeSelectionEntries(draft.give);
  const getEntries = tradeSelectionEntries(draft.get);

  if (giveEntries.length === 0 || getEntries.length === 0) {
    return { ok: false, reason: "Pick one resource to give and one to get." };
  }
  if (giveEntries.length !== 1 || getEntries.length !== 1) {
    return { ok: false, reason: "Bank trades use one give resource and one get resource." };
  }

  const [giveResource, giveAmount] = giveEntries[0];
  const [getResource, getAmount] = getEntries[0];
  const rate = resolveHarborTradeRate(state, state.currentPlayer, giveResource);

  if (giveResource === getResource) {
    return { ok: false, reason: "Choose different resources for trade." };
  }
  if (giveAmount !== rate * getAmount) {
    return {
      ok: false,
      reason: `Need ${rate} ${giveResource} for each ${getResource}.`,
      rate,
      giveResource,
      giveAmount,
      getResource,
      getAmount,
    };
  }
  if (tradeResourceLimit("bank", "give", giveResource) < giveAmount) {
    return { ok: false, reason: `Need ${giveAmount} ${giveResource} to trade.` };
  }
  if (tradeResourceLimit("bank", "get", getResource) < getAmount) {
    return { ok: false, reason: `The bank is short on ${getResource}.` };
  }

  return {
    ok: true,
    rate,
    giveResource,
    giveAmount,
    getResource,
    getAmount,
    bundles: getAmount,
  };
}

function playerTradeDraftState() {
  ensureTradeDrafts();
  normalizeTradeDraft("player");
  const targetIdx = currentTradeTargetIndex();
  if (targetIdx === null) {
    return { ok: false, reason: "Choose a valid target player." };
  }

  const draft = state.tradeDrafts.player;
  const giveEntries = tradeSelectionEntries(draft.give);
  const getEntries = tradeSelectionEntries(draft.get);
  if (giveEntries.length === 0 || getEntries.length === 0) {
    return { ok: false, reason: "Pick resources for both sides of the trade." };
  }

  for (const resource of RESOURCES) {
    if ((draft.give[resource] || 0) > 0 && (draft.get[resource] || 0) > 0) {
      return { ok: false, reason: "A resource cannot be on both sides of the same trade." };
    }
  }

  const from = state.players[state.currentPlayer];
  for (const [resource, amount] of giveEntries) {
    if (from.hand[resource] < amount) {
      return { ok: false, reason: `${from.name} does not have ${amount} ${resource}.` };
    }
  }

  return {
    ok: true,
    targetIdx,
    giveEntries,
    getEntries,
    giveSelection: { ...draft.give },
    getSelection: { ...draft.get },
  };
}

function tradeResourceAvailabilityLabel(kind, side, resource) {
  const available = tradeResourceLimit(kind, side, resource);
  if (kind === "bank") {
    return side === "give" ? `Have ${available}` : `Bank ${available}`;
  }
  if (side === "give") return `Have ${available}`;
  const targetIdx = currentTradeTargetIndex();
  if (targetIdx === null) return "Pick player";
  return `${state.players[targetIdx].name} ${available}`;
}

function activeResourceCounts(playerCount) {
  return playerCount > 4 ? EXTENSION_RESOURCE_COUNTS : BASE_RESOURCE_COUNTS;
}

function activeNumberTokens(playerCount) {
  return playerCount > 4 ? EXTENSION_NUMBER_TOKENS : BASE_NUMBER_TOKENS;
}

function isExtensionPlayerCount(playerCount) {
  return Number(playerCount) > 4;
}

function pairedTurnEnabled(playerCount = state.players.length) {
  return Number(playerCount) >= 5;
}

function pairedPartnerIndex(playerIdx, playerCount = state.players.length) {
  if (!pairedTurnEnabled(playerCount)) return null;
  return (playerIdx + PAIRED_PLAYER_OFFSET) % playerCount;
}

function createExtensionHexes() {
  const coords = [];
  const rowStarts = [1, 0, -1, -2, -2, -2, -2];
  EXTENSION_BOARD_ROWS.forEach((count, rowIdx) => {
    const r = rowIdx - 3;
    const qStart = rowStarts[rowIdx];
    for (let offset = 0; offset < count; offset += 1) {
      coords.push({ q: qStart + offset, r });
    }
  });
  return coords;
}

function createBoardCoords(playerCount) {
  return isExtensionPlayerCount(playerCount) ? createExtensionHexes() : axialHexes(BOARD_RADIUS);
}

function harborTypesForPlayerCount(playerCount) {
  if (isExtensionPlayerCount(playerCount)) {
    return ["generic", "generic", "generic", "generic", "generic", "generic", ...RESOURCES];
  }
  return ["generic", "generic", "generic", "generic", ...RESOURCES];
}

function intersectNodeHexes(nodeA, nodeB) {
  const hexes = new Set(nodeA.hexes);
  return nodeB.hexes.filter((tileIdx) => hexes.has(tileIdx));
}

function coastalEdges() {
  const centerX = state.tiles.reduce((sum, tile) => sum + tile.cx, 0) / Math.max(1, state.tiles.length);
  const centerY = state.tiles.reduce((sum, tile) => sum + tile.cy, 0) / Math.max(1, state.tiles.length);
  return state.edges
    .map((edge) => {
      const nodeA = state.nodes[edge.a];
      const nodeB = state.nodes[edge.b];
      const sharedHexes = intersectNodeHexes(nodeA, nodeB);
      if (sharedHexes.length !== 1) return null;
      const mx = (nodeA.x + nodeB.x) / 2;
      const my = (nodeA.y + nodeB.y) / 2;
      return {
        edgeIdx: edge.idx,
        nodes: [edge.a, edge.b],
        mx,
        my,
        angle: Math.atan2(my - centerY, mx - centerX),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.angle - right.angle);
}

function generateHarbors(playerCount) {
  const coast = coastalEdges();
  const harborTypes = shuffle(harborTypesForPlayerCount(playerCount));
  if (coast.length === 0) return [];
  const harbors = [];
  const usedEdges = new Set();
  const desiredCount = harborTypes.length;
  const spacing = coast.length / desiredCount;
  for (let idx = 0; idx < desiredCount; idx += 1) {
    let pickIndex = Math.floor(idx * spacing);
    while (usedEdges.has(coast[pickIndex % coast.length].edgeIdx)) pickIndex += 1;
    const spot = coast[pickIndex % coast.length];
    usedEdges.add(spot.edgeIdx);
    harbors.push({
      idx,
      type: harborTypes[idx],
      edgeIdx: spot.edgeIdx,
      nodes: spot.nodes.slice(),
      mx: spot.mx,
      my: spot.my,
      angle: spot.angle,
    });
  }
  return harbors;
}

function createPlayerState(name, idx) {
  return {
    name,
    color: PLAYER_COLORS[idx],
    hand: resourceMap(0),
    roads: new Set(),
    settlements: new Set(),
    cities: new Set(),
    devCards: normalizeDevelopmentState(),
    playedKnights: 0,
  };
}

function initializeRuleState(playerCount) {
  state.bank = createBank(playerCount);
  state.devDeck = shuffle(createDevelopmentDeck(playerCount));
  state.harbors = [];
  state.awards = {
    largestArmyHolder: null,
    largestArmyCount: 0,
    longestRoadHolder: null,
    longestRoadLength: 0,
  };
  state.bankShortage = null;
  state.mainStep = "before_roll";
  state.pendingDevReturnStep = "main_actions";
  state.pendingDevCardAction = "";
  state.pairedTurn = {
    enabled: pairedTurnEnabled(playerCount),
    primaryPlayer: 0,
    secondaryPlayer: pairedPartnerIndex(0, playerCount),
    stage: "primary",
  };
  syncTurnStateMirror();
}

function recomputeAwards() {
  const longestRoad = recomputeLongestRoad(state, state.awards.longestRoadHolder);
  const largestArmy = recomputeLargestArmy(state.players, state.awards.largestArmyHolder);
  state.awards.longestRoadHolder = longestRoad.holder;
  state.awards.longestRoadLength = longestRoad.length;
  state.awards.largestArmyHolder = largestArmy.holder;
  state.awards.largestArmyCount = largestArmy.count;
}

function preparePlayerActionPhase(playerIdx, options = {}) {
  const player = state.players[playerIdx];
  if (!player) return;
  player.devCards = promoteBoughtDevelopmentCards(player.devCards);
  player.playedKnights = player.devCards.playedKnights;
  if (options.beforeRoll) {
    state.mainStep = "before_roll";
    state.hasRolled = false;
    state.diceResult = null;
  } else {
    state.mainStep = "main_actions";
    state.hasRolled = true;
  }
  state.currentPlayer = playerIdx;
  state.pendingRobberMove = false;
  state.mode = "none";
  state.tradeMenuOpen = false;
  resetTradeDrafts();
  syncTurnStateMirror();
}

function roomTokenStorageKey(roomCode, playerId = "") {
  return `${ROOM_TOKEN_KEY_PREFIX}${roomCode}:${playerId}`;
}

function roomResumeStorageKey(roomCode) {
  return `${ROOM_RESUME_KEY_PREFIX}${roomCode}`;
}

function storeReconnectToken(roomCode, playerId, token) {
  const storage = getLocalStorageHandle();
  if (!storage || !roomCode || !playerId || !token) return;
  storage.setItem(roomTokenStorageKey(roomCode, playerId), token);
  storage.setItem(
    roomResumeStorageKey(roomCode),
    JSON.stringify({
      roomCode,
      playerId,
      reconnectToken: token,
      savedAt: new Date().toISOString(),
    })
  );
}

function readReconnectToken(roomCode, playerId) {
  const storage = getLocalStorageHandle();
  if (!storage || !roomCode || !playerId) return "";
  return String(storage.getItem(roomTokenStorageKey(roomCode, playerId)) || "");
}

function readReconnectSession(roomCode) {
  const storage = getLocalStorageHandle();
  if (!storage || !roomCode) return null;
  try {
    const parsed = JSON.parse(storage.getItem(roomResumeStorageKey(roomCode)) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    if (String(parsed.roomCode || "").toUpperCase() !== roomCode) return null;
    const reconnectToken = String(parsed.reconnectToken || "").trim();
    if (!reconnectToken) return null;
    return {
      roomCode,
      playerId: String(parsed.playerId || "").trim(),
      reconnectToken,
    };
  } catch {
    return null;
  }
}

function clearReconnectSession(roomCode, playerId = "") {
  const storage = getLocalStorageHandle();
  if (!storage || !roomCode) return;
  storage.removeItem(roomResumeStorageKey(roomCode));
  if (playerId) storage.removeItem(roomTokenStorageKey(roomCode, playerId));
}

function clearReconnectTimer() {
  if (roomReconnectTimer === null) return;
  window.clearTimeout(roomReconnectTimer);
  roomReconnectTimer = null;
}

function syncTurnStateMirror() {
  const enabled = pairedTurnEnabled();
  const pairStep = enabled && state.pairedTurn.stage === "secondary" ? "paired" : "inactive";
  const pairPlayerIndex = enabled && state.pairedTurn.stage === "secondary" ? state.currentPlayer : null;
  const pairTurnIndex = enabled ? state.pairedTurn.primaryPlayer : null;
  state.pairStep = pairStep;
  state.pairPlayerIndex = pairPlayerIndex;
  state.pairTurnIndex = pairTurnIndex;
  state.turnState = {
    mainStep: state.mainStep,
    pairStep,
    pairPlayerIndex,
    pairTurnIndex,
  };
}

function restorePairedTurnState() {
  const enabled = pairedTurnEnabled();
  if (!enabled) {
    state.pairedTurn.enabled = false;
    state.pairedTurn.primaryPlayer = state.currentPlayer;
    state.pairedTurn.secondaryPlayer = null;
    state.pairedTurn.stage = "primary";
    syncTurnStateMirror();
    return;
  }

  const rawStep = String(state.pairStep || state.turnState?.pairStep || "primary").toLowerCase();
  const stage = rawStep === "secondary" || rawStep === "paired" ? "secondary" : "primary";
  const primaryPlayer = Number.isInteger(state.pairTurnIndex)
    ? state.pairTurnIndex
    : stage === "primary"
    ? state.currentPlayer
    : 0;
  const secondaryPlayer =
    stage === "secondary"
      ? state.currentPlayer
      : pairedPartnerIndex(primaryPlayer, state.players.length);

  state.pairedTurn.enabled = true;
  state.pairedTurn.primaryPlayer = primaryPlayer;
  state.pairedTurn.secondaryPlayer = secondaryPlayer;
  state.pairedTurn.stage = stage;
  syncTurnStateMirror();
}

function resetOnlineRoomState(options = {}) {
  const preserveRoom = options.preserveRoom === true;
  const preserveSave = options.preserveSave === true;
  const preserveConnection = options.preserveConnection === true;
  clearReconnectTimer();
  pendingRoomCommand = null;
  if (!preserveConnection) {
    onlineState.connected = false;
    onlineState.socket = null;
  }
  onlineState.reconnecting = false;
  onlineState.expectedResume = false;
  onlineState.reconnectAttempt = 0;
  if (!preserveRoom) {
    onlineState.roomCode = "";
    onlineState.hostId = "";
    onlineState.started = false;
    onlineState.players = [];
    onlineState.seatMap = [];
    onlineState.version = 0;
    onlineState.historyCount = 0;
    onlineState.reconnectToken = "";
    onlineState.selfId = "";
    if (!preserveSave) onlineState.saveFile = "";
    remoteSyncVersion = 0;
  }
}

function scheduleRoomReconnect() {
  clearReconnectTimer();
  if (!onlineState.started || !onlineState.roomCode || !onlineState.reconnectToken) return;
  const delayMs = Math.min(5000, 500 + onlineState.reconnectAttempt * 800);
  onlineState.reconnecting = true;
  onlineState.expectedResume = true;
  roomReconnectTimer = window.setTimeout(() => {
    roomReconnectTimer = null;
    onlineState.reconnectAttempt += 1;
    queueRoomCommand("resume_room", {
      code: onlineState.roomCode,
      reconnectToken: onlineState.reconnectToken,
    });
    renderRoomPanel();
    renderControls();
  }, delayMs);
}

function canUseDomesticTrade() {
  return !(pairedTurnEnabled() && state.pairedTurn.stage === "secondary");
}

function canRollDiceNow() {
  return state.phase === "main" && state.mainStep === "before_roll" && !state.isRollingDice;
}

function canTakeMainActions() {
  return state.phase === "main" && state.mainStep === "main_actions" && !state.pendingRobberMove && !state.isRollingDice;
}

function advancePairedTurn() {
  if (!pairedTurnEnabled()) {
    state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
    if (state.currentPlayer === 0) state.round += 1;
    state.pairedTurn.primaryPlayer = state.currentPlayer;
    state.pairedTurn.secondaryPlayer = null;
    state.pairedTurn.stage = "primary";
    preparePlayerActionPhase(state.currentPlayer, { beforeRoll: true });
    syncTurnStateMirror();
    return;
  }

  if (state.pairedTurn.stage === "primary") {
    const secondary = pairedPartnerIndex(state.pairedTurn.primaryPlayer);
    state.pairedTurn.secondaryPlayer = secondary;
    state.pairedTurn.stage = "secondary";
    preparePlayerActionPhase(secondary, { beforeRoll: false });
    syncTurnStateMirror();
    return;
  }

  const nextPrimary = (state.pairedTurn.primaryPlayer + 1) % state.players.length;
  if (nextPrimary === 0) state.round += 1;
  state.pairedTurn.primaryPlayer = nextPrimary;
  state.pairedTurn.secondaryPlayer = pairedPartnerIndex(nextPrimary);
  state.pairedTurn.stage = "primary";
  preparePlayerActionPhase(nextPrimary, { beforeRoll: true });
  syncTurnStateMirror();
}

function getLocalStorageHandle() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function snapshotTurnRemainingMs() {
  if (state.turnTimerActive) return Math.max(0, state.turnTimerEndMs - Date.now());
  return Math.max(0, state.turnTimerRemainingMs);
}

function readSaveIndex() {
  const storage = getLocalStorageHandle();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(SAVE_INDEX_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSaveIndex(index) {
  const storage = getLocalStorageHandle();
  if (!storage) return;
  storage.setItem(SAVE_INDEX_KEY, JSON.stringify(index));
}

function getSaveSummaries() {
  const storage = getLocalStorageHandle();
  if (!storage) return [];

  const { items, dirty } = sanitizeSaveIndex(readSaveIndex(), (saveId) => storage.getItem(saveRecordKey(saveId)) !== null);
  if (dirty) writeSaveIndex(items);
  return items;
}

function refreshSaveCatalogState() {
  const summaries = getSaveSummaries();
  state.availableSaveCount = summaries.length;
  return summaries;
}

function persistCurrentGame(action = "sync") {
  const storage = getLocalStorageHandle();
  if (!state.currentSaveId) state.currentSaveId = makeSaveId();
  if (!state.saveCreatedAt) state.saveCreatedAt = new Date().toISOString();
  syncTurnStateMirror();

  const snapshot = buildSnapshotData({
    state,
    resources: RESOURCES,
    diceSums: DICE_SUMS,
    turnTimerRemainingMs: snapshotTurnRemainingMs(),
  });
  if (!snapshot) {
    refreshSaveCatalogState();
    return null;
  }

  const summary = buildSaveSummary(snapshot);
  if (!storage) {
    state.lastSaveAt = snapshot.savedAt;
    state.saveStatus = "Browser local saving is unavailable, but server sync can still continue.";
    return snapshot;
  }
  try {
    storage.setItem(saveRecordKey(summary.id), JSON.stringify(snapshot));
    const index = [summary, ...getSaveSummaries().filter((item) => item.id !== summary.id)];
    writeSaveIndex(index);
    state.lastSaveAt = snapshot.savedAt;
    state.availableSaveCount = index.length;
    state.saveStatus = `Autosaved locally at ${formatSaveTimestamp(snapshot.savedAt)}.`;
    resumeState.hasSave = true;
    if (!resumeState.latestFile) resumeState.latestFile = "Browser local save";
    return snapshot;
  } catch (error) {
    console.error("Failed to save game snapshot.", error);
    state.saveStatus = "Autosave failed: browser storage is unavailable or full.";
    return snapshot;
  }
}

function deleteSavedGame(saveId) {
  const storage = getLocalStorageHandle();
  if (!storage || !saveId) return;
  storage.removeItem(saveRecordKey(saveId));
  const nextIndex = getSaveSummaries().filter((item) => item.id !== saveId);
  writeSaveIndex(nextIndex);
  state.availableSaveCount = nextIndex.length;
}

function readSavedSnapshot(saveId) {
  const storage = getLocalStorageHandle();
  if (!storage || !saveId) return null;
  try {
    const parsed = JSON.parse(storage.getItem(saveRecordKey(saveId)) || "null");
    if (
      !parsed ||
      typeof parsed.version !== "number" ||
      !Array.isArray(parsed.players) ||
      !Array.isArray(parsed.tiles) ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function hydrateGameSnapshot(snapshot, options = {}) {
  const restored = deserializeSnapshot({
    snapshot,
    resources: RESOURCES,
    diceSums: DICE_SUMS,
    playerColors: PLAYER_COLORS,
    clampTurnSeconds,
  });
  if (!restored) return false;

  Object.assign(state, restored);
  if (discardModalResolver) closeDiscardModal(null);
  else {
    resetDiscardDraft();
    clearDiscardModalUi();
  }
  restorePairedTurnState();

  refs.playerCount.value = String(state.players.length);
  createNameInputs();
  const inputs = refs.nameInputs.querySelectorAll("input");
  state.players.forEach((player, idx) => {
    if (inputs[idx]) inputs[idx].value = player.name;
  });
  refs.turnSeconds.value = String(state.turnSeconds);

  stopTurnTimer(false);
  if (state.phase === "setup" || state.phase === "main") {
    restartTurnTimer(state.turnTimerRemainingMs);
  } else {
    stopTurnTimer(true);
  }

  if (state.diceResult !== null) {
    const pair = dicePairForTotal(state.diceResult);
    if (pair) {
      setBoardDiceFaces(pair[0], pair[1]);
    } else {
      setBoardDiceFaces(1, 2);
    }
  } else {
    setBoardDiceFaces(1, 2);
  }

  state.availableSaveCount = getSaveSummaries().length;
  if (options.skipSaveStatus !== true) {
    state.saveStatus = `Loaded local save from ${formatSaveTimestamp(state.lastSaveAt)}.`;
  }
  return true;
}

function saveOptionLabel(summary) {
  const players = summary.playerNames.length > 0 ? summary.playerNames.join(", ") : "Unknown players";
  return `${formatSaveTimestamp(summary.savedAt)} | ${players} | ${friendlySavePhase(summary)}`;
}

function resetLocalSaveSession() {
  localSaveState.token += 1;
  localSaveState.sessionId = "";
  localSaveState.saveFile = "";
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
    if (localSaveState.saveFile) {
      resumeState.hasSave = true;
      resumeState.latestFile = localSaveState.saveFile;
    }
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
            gameState: entry.snapshot,
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
  }
}

function queueLocalSaveSnapshot(action, snapshot) {
  if (isOnlineGameStarted()) return;
  if (state.players.length === 0 || state.phase === "pregame" || !snapshot) return;
  localSaveState.queue.push({
    action: normalizeActionLabel(action),
    snapshot,
  });
  if (!localSaveState.sessionId && !localSaveState.starting) {
    void startLocalSaveSession();
    return;
  }
  void flushLocalSaveQueue();
}

function recordGameAction(action, options = {}) {
  const normalized = normalizeActionLabel(action);
  const snapshot = persistCurrentGame(normalized);
  if (!snapshot) return;
  if (isOnlineGameStarted()) {
    const force = options.force !== false;
    publishOnlineState(snapshot, { force, action: normalized });
    return;
  }
  queueLocalSaveSnapshot(normalized, snapshot);
}

async function fetchSavedGamesList() {
  return apiJson("/api/game-saves", { method: "GET" });
}

async function fetchSavedGameById(saveId) {
  const encoded = encodeURIComponent(String(saveId || ""));
  return apiJson(`/api/game-saves/load?id=${encoded}`, { method: "GET" });
}

function playerNamesFromList(players) {
  if (!Array.isArray(players) || players.length === 0) return [];
  return players
    .map((player, idx) => sanitizePlayerName(player?.name, `Player ${idx + 1}`))
    .filter(Boolean);
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

  refreshSaveCatalogState().forEach((summary) => {
    options.push({
      value: `local:${summary.id}`,
      label: saveOptionLabel(summary),
      sourceLabel: "Browser local save",
      sortAt: summary.savedAt,
    });
  });

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
    state.availableSaveCount = getSaveSummaries().length;
    renderControls();
  }
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
      throw new Error("No saved games found.");
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
      render();
      return;
    }

    const selected = resumeOptions.find((option) => option.value === pickedValue);
    if (!selected) {
      throw new Error("Invalid saved-game selection.");
    }

    let resumeSnapshot = null;
    let sourceLabel = selected.sourceLabel;
    if (selected.value.startsWith("local:")) {
      const localId = selected.value.slice("local:".length);
      resumeSnapshot = readSavedSnapshot(localId);
      if (!resumeSnapshot) {
        deleteSavedGame(localId);
        refreshSaveCatalogState();
        throw new Error("That browser save could not be loaded and was removed.");
      }
    } else if (selected.value.startsWith("server:")) {
      const saveId = selected.value.slice("server:".length);
      const payload = await fetchSavedGameById(saveId);
      if (payload && payload.gameState && typeof payload.gameState === "object") {
        resumeSnapshot = payload.gameState;
        sourceLabel = String(payload.save?.file || sourceLabel);
      }
    }

    if (!resumeSnapshot || !hydrateGameSnapshot(resumeSnapshot)) {
      throw new Error("Could not load the selected saved game.");
    }

    resetLocalSaveSession();
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
    clearReconnectTimer();
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
    const shouldReconnect = Boolean(onlineState.started && onlineState.roomCode && onlineState.reconnectToken);
    onlineState.connected = false;
    onlineState.socket = null;
    pendingRoomCommand = null;
    if (shouldReconnect) {
      onlineState.reconnecting = true;
      onlineState.expectedResume = true;
      setRoomStatusOverride("Connection lost. Reconnecting to room...");
      scheduleRoomReconnect();
    } else {
      resetOnlineRoomState();
      setRoomStatusOverride("Disconnected from server.");
    }
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
    if (onlineState.expectedResume) {
      onlineState.reconnecting = false;
      onlineState.expectedResume = false;
      clearReconnectTimer();
      if (/room not found/i.test(String(msg.message || ""))) {
        clearReconnectSession(onlineState.roomCode, onlineState.selfId);
        setStatus("Room no longer exists. Use Resume Game to load the latest saved state.");
        resetOnlineRoomState({ preserveSave: true, preserveConnection: true });
      } else if (/token/i.test(String(msg.message || ""))) {
        clearReconnectSession(onlineState.roomCode, onlineState.selfId);
        resetOnlineRoomState({ preserveSave: true, preserveConnection: true });
      }
    }
    setRoomStatusOverride(String(msg.message || "Room error."));
    renderRoomPanel();
    renderControls();
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
  if (onlineState.saveFile) {
    resumeState.hasSave = true;
    resumeState.latestFile = onlineState.saveFile;
  }
  onlineState.selfId = String(room.self?.id || onlineState.selfId || "");
  onlineState.reconnectToken = String(room.self?.reconnectToken || onlineState.reconnectToken || "");
  if (onlineState.roomCode && onlineState.selfId && onlineState.reconnectToken) {
    storeReconnectToken(onlineState.roomCode, onlineState.selfId, onlineState.reconnectToken);
  }
  if (onlineState.started && room.self) {
    onlineState.reconnecting = false;
    onlineState.expectedResume = false;
    onlineState.reconnectAttempt = 0;
    clearReconnectTimer();
  }

  if (onlineState.started && room.gameState && typeof room.version === "number" && room.version >= remoteSyncVersion) {
    if (room.version > remoteSyncVersion || state.phase === "pregame") {
      remoteSyncVersion = room.version;
      if (hydrateGameSnapshot(room.gameState, { skipSaveStatus: true })) {
        render();
      }
    }
  } else if (!onlineState.started) {
    remoteSyncVersion = 0;
  }

  renderRoomPanel();
  renderControls();
}

function publishOnlineState(snapshot, options = {}) {
  if (!isOnlineGameStarted()) return;
  if (!onlineState.connected) return;
  if (!options.force && !localControlsCurrentTurn()) return;
  const action = typeof options.action === "string" && options.action.trim() ? options.action.trim() : "sync";
  sendSocketMessage("state_sync", { gameState: snapshot, action });
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
  const reconnect = readReconnectSession(code);
  if (reconnect?.reconnectToken) {
    onlineState.roomCode = code;
    onlineState.selfId = reconnect.playerId || "";
    onlineState.reconnectToken = reconnect.reconnectToken;
    onlineState.reconnecting = true;
    onlineState.expectedResume = true;
    setRoomStatusOverride("Attempting to resume your previous seat...");
    queueRoomCommand("resume_room", { code, reconnectToken: reconnect.reconnectToken });
    return;
  }
  queueRoomCommand("join_room", { code, name: localDisplayName() });
}

function requestLeaveRoom() {
  if (!isOnlineRoomActive()) return;
  clearReconnectSession(onlineState.roomCode, onlineState.selfId);
  clearReconnectTimer();
  onlineState.reconnectToken = "";
  onlineState.selfId = "";
  onlineState.reconnecting = false;
  onlineState.expectedResume = false;
  sendSocketMessage("leave_room");
  resetOnlineRoomState({ preserveConnection: true });
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
    const selfId = onlineState.selfId || onlineState.clientId;
    onlineState.players.forEach((player, idx) => {
      const li = document.createElement("li");
      const mine = player.id === selfId ? " (you)" : "";
      const host = player.id === onlineState.hostId ? " [host]" : "";
      const seat = onlineState.seatMap[idx] ? ` P${idx + 1}` : "";
      const offline = player.connected === false ? " (offline)" : "";
      li.textContent = `${player.name}${mine}${host}${seat}${offline}`;
      if (player.id === selfId) li.classList.add("current");
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
        statusText = "Host: max 6 players.";
      } else {
        statusText = "Host: room ready. Start game when ready.";
      }
    } else {
      statusText = "Waiting for host to start the game.";
    }
  } else if (inRoom && onlineState.started) {
    const seat = localSeatIndex();
    if (onlineState.reconnecting) {
      statusText = `Reconnecting to room ${onlineState.roomCode}...`;
    } else if (seat >= 0) {
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

function assignNumbersWithConstraints(coords, resourcesByTile, numberPool = BASE_NUMBER_TOKENS) {
  const adjacency = buildTileAdjacency(coords);
  const nonDesertTiles = [];
  resourcesByTile.forEach((resource, idx) => {
    if (resource !== "desert") nonDesertTiles.push(idx);
  });

  const baseCounts = {};
  for (const number of numberPool) {
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
  const selfId = onlineState.selfId || onlineState.clientId;
  return isOnlineRoomActive() && selfId !== "" && selfId === onlineState.hostId;
}

function localSeatIndex() {
  if (!isOnlineRoomActive()) return -1;
  const selfId = onlineState.selfId || onlineState.clientId;
  return onlineState.seatMap.indexOf(selfId);
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

function parsePositiveInt(raw) {
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 1) return null;
  return num;
}

function clampTurnSeconds(raw) {
  const parsed = parsePositiveInt(raw);
  if (parsed === null) return DEFAULT_TURN_SECONDS;
  return Math.min(600, Math.max(1, parsed));
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

function canRunTurnTimeoutAutomation() {
  if (state.phase !== "setup" && state.phase !== "main") return false;
  if (!isOnlineGameStarted()) return true;
  return localControlsCurrentTurn();
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

function boardOrbDockEntries() {
  return [
    { key: "build", root: refs.buildDock, button: refs.buildDockToggleBtn },
    { key: "trade", root: refs.tradeDock, button: refs.tradeDockToggleBtn },
  ];
}

function isOrbDockPinned(key) {
  return boardOrbDockEntries().some(
    (entry) => entry.key === key && entry.root && entry.root.classList.contains("is-pinned")
  );
}

function hasPinnedOrbDock() {
  return boardOrbDockEntries().some((entry) => entry.root && entry.root.classList.contains("is-pinned"));
}

function setPinnedOrbDock(key = null) {
  boardOrbDockEntries().forEach((entry) => {
    if (!entry.root || !entry.button) return;
    const open = entry.key === key;
    entry.root.classList.toggle("is-pinned", open);
    entry.button.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) entry.button.blur();
  });
}

function syncBoardHudVisibility() {
  const showHud = state.players.length > 0;
  refs.boardOrbDock.classList.toggle("hidden", !showHud);
  refs.boardPlayerHud.classList.toggle("hidden", !showHud);
  refs.boardOrbDock.classList.toggle("without-clock", refs.turnClock?.classList.contains("hidden"));
  if (!showHud) setPinnedOrbDock(null);
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

function restartTurnTimer(remainingOverrideMs = null) {
  clearTurnTimerInterval();
  state.turnTimerActive = false;
  const fullDurationMs = state.turnSeconds * 1000;
  state.turnTimerRemainingMs =
    remainingOverrideMs === null
      ? fullDurationMs
      : Math.max(250, Math.min(fullDurationMs, Math.floor(remainingOverrideMs)));
  renderTurnClock();
  if (!shouldDisplayTurnClock()) return;

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

function clearDiscardModalUi() {
  refs.discardModal.classList.add("hidden");
  refs.discardModal.setAttribute("aria-hidden", "true");
  refs.discardModalTitle.textContent = "";
  refs.discardModalText.textContent = "";
  refs.discardResourceGrid.innerHTML = "";
  refs.discardModalHint.textContent = "";
  refs.discardSubmitBtn.disabled = true;
}

function closeDiscardModal(result = null) {
  if (!discardModalResolver) {
    clearDiscardModalUi();
    resetDiscardDraft();
    return;
  }
  const resolve = discardModalResolver;
  discardModalResolver = null;
  clearDiscardModalUi();
  resetDiscardDraft();
  resolve(result);
}

function showActionModal({ title, text, options, allowCancel = false }) {
  if (actionModalResolver) closeActionModal(null);
  if (discardModalResolver) closeDiscardModal(null);

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

function showDiscardModal(playerIdx, required) {
  if (discardModalResolver) closeDiscardModal(null);
  if (actionModalResolver) closeActionModal(null);

  state.discardDraft = {
    playerIdx,
    required,
    selection: resourceMap(0),
  };

  return new Promise((resolve) => {
    discardModalResolver = resolve;
    render();
    refs.discardResourceGrid.querySelector(".trade-resource-btn:not(:disabled)")?.focus();
  });
}

function submitDiscardDraft() {
  if (!discardModalResolver) return;
  const draft = discardDraftState();
  if (!draft.complete) return;
  closeDiscardModal({
    playerIdx: state.discardDraft.playerIdx,
    required: draft.required,
    selection: draft.selection,
  });
}

function currentPlayerObj() {
  return state.players[state.currentPlayer];
}

function victoryPoints(player) {
  const playerIdx = state.players.indexOf(player);
  return computeVictoryPoints(player, state.awards, playerIdx, player?.devCards);
}

function resourceCount(player) {
  return RESOURCES.reduce((sum, res) => sum + player.hand[res], 0);
}

function canAfford(player, cost) {
  return canAffordCost(player.hand, cost, RESOURCES);
}

function hasAnyBuildByResources(player) {
  const idx = state.players.indexOf(player);
  return (
    canBuildRoad(idx, -1, null, { skipEdgeCheck: true }).ok ||
    canBuildSettlement(idx, -1, false, { skipNodeCheck: true }).ok ||
    canBuildCity(idx, -1, { skipNodeCheck: true }).ok ||
    (canAfford(player, COST.development) && state.devDeck.length > 0)
  );
}

function hasBankTradeOption(player) {
  const playerIdx = state.players.indexOf(player);
  return RESOURCES.some((giveResource) => {
    const rate = resolveHarborTradeRate(state, playerIdx, giveResource);
    if (player.hand[giveResource] < rate) return false;
    return RESOURCES.some((getResource) => getResource !== giveResource && state.bank[getResource] > 0);
  });
}

function hasPlayerTradeOption(playerIdx) {
  const player = state.players[playerIdx];
  if (!player || resourceCount(player) === 0) return false;
  if (pairedTurnEnabled() && state.pairedTurn.stage === "secondary") return false;
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
  if (state.mainStep === "before_roll") return `${player.name}: play a dev card or roll dice.`;
  if (state.mainStep === "discard") return `${player.name}: resolve discards.`;
  if (state.mainStep === "move_robber") return `${player.name}: move the robber.`;
  if (state.mainStep === "dev_card_resolution" && player.devCards.freeRoadPlacements > 0) {
    return `${player.name}: place ${player.devCards.freeRoadPlacements} free road(s).`;
  }
  if (pairedTurnEnabled() && state.pairedTurn.stage === "secondary") {
    return `${player.name}: paired action phase. Trade with the bank, build, or play 1 dev card.`;
  }
  return `${player.name}: trade, build, or end turn.`;
}

function turnBadgeText(player) {
  if (!player) return "Start a game";
  if (state.phase === "setup") return `${player.name} | Setup`;
  if (state.phase === "gameover") return `${player.name} | Winner`;
  if (state.phase !== "main") return `${player.name} | Waiting`;
  const badgeRole = pairedTurnEnabled() ? (state.pairedTurn.stage === "primary" ? "P1" : "P2") : "TURN";
  if (state.mainStep === "before_roll") return `${player.name} | ${badgeRole} Roll`;
  if (state.mainStep === "discard") return `${player.name} | ${badgeRole} Discard`;
  if (state.mainStep === "move_robber") return `${player.name} | ${badgeRole} Robber`;
  if (state.mainStep === "dev_card_resolution") return `${player.name} | ${badgeRole} Dev`;
  return `${player.name} | ${badgeRole} Actions`;
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

function canBuildRoad(playerIdx, edgeIdx, setupNode = null, options = {}) {
  if (options.skipEdgeCheck === true) {
    const player = state.players[playerIdx];
    if (!player) return { ok: false, reason: "Invalid player." };
    if (player.roads.size >= DEFAULT_PIECE_LIMITS.road) return { ok: false, reason: "No roads remain." };
    if (player.devCards?.freeRoadPlacements > 0) return { ok: true };
    if (!canAfford(player, COST.road)) return { ok: false, reason: "Not enough resources for road." };
    return { ok: true };
  }
  return canBuildRoadByRule(state, playerIdx, edgeIdx, {
    setupNode,
    pieceLimits: DEFAULT_PIECE_LIMITS,
  });
}

function canBuildSettlement(playerIdx, nodeIdx, setup = false, options = {}) {
  if (options.skipNodeCheck === true) {
    const player = state.players[playerIdx];
    if (!player) return { ok: false, reason: "Invalid player." };
    if (player.settlements.size >= DEFAULT_PIECE_LIMITS.settlement) return { ok: false, reason: "No settlements remain." };
    if (!canAfford(player, COST.settlement)) return { ok: false, reason: "Not enough resources for settlement." };
    return { ok: true };
  }
  return canBuildSettlementByRule(state, playerIdx, nodeIdx, {
    setup,
    pieceLimits: DEFAULT_PIECE_LIMITS,
  });
}

function canBuildCity(playerIdx, nodeIdx, options = {}) {
  if (options.skipNodeCheck === true) {
    const player = state.players[playerIdx];
    if (!player) return { ok: false, reason: "Invalid player." };
    if (player.cities.size >= DEFAULT_PIECE_LIMITS.city) return { ok: false, reason: "No cities remain." };
    if (!canAfford(player, COST.city)) return { ok: false, reason: "Not enough resources for city." };
    if (player.settlements.size === 0) return { ok: false, reason: "Need a settlement to upgrade." };
    return { ok: true };
  }
  return canBuildCityByRule(state, playerIdx, nodeIdx, {
    pieceLimits: DEFAULT_PIECE_LIMITS,
  });
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
    if (player.devCards.freeRoadPlacements > 0) {
      player.devCards.freeRoadPlacements = Math.max(0, player.devCards.freeRoadPlacements - 1);
    } else {
      if (!canAfford(player, COST.road)) {
        setStatus("Not enough resources for road.");
        return false;
      }
      payCost(player, COST.road);
      state.bank = applyResourceDelta(state.bank, COST.road, RESOURCES);
    }
  }
  state.edges[edgeIdx].owner = playerIdx;
  player.roads.add(edgeIdx);
  state.bankShortage = null;
  recomputeAwards();
  logEvent(`${player.name} built a road.`);
  setStatus(`${player.name} built road on edge ${edgeIdx}.`);
  if (state.mainStep === "dev_card_resolution" && player.devCards.freeRoadPlacements <= 0) {
    state.mainStep = state.pendingDevReturnStep || "main_actions";
  }
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
    state.bank = applyResourceDelta(state.bank, COST.settlement, RESOURCES);
  }
  const node = state.nodes[nodeIdx];
  node.owner = playerIdx;
  node.isCity = false;
  player.settlements.add(nodeIdx);
  state.bankShortage = null;
  recomputeAwards();
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
  state.bank = applyResourceDelta(state.bank, COST.city, RESOURCES);
  const node = state.nodes[nodeIdx];
  node.isCity = true;
  player.settlements.delete(nodeIdx);
  player.cities.add(nodeIdx);
  state.bankShortage = null;
  recomputeAwards();
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
  const payout = applyBankPayout(state.bank, gains, RESOURCES);
  state.bank = payout.bank;
  addResources(player, payout.granted);
  state.bankShortage = payout.shortage;
}

function distributeResources(roll) {
  const gains = state.players.map(() => resourceMap(0));
  const grantedTotals = state.players.map(() => resourceMap(0));
  const shortageTotals = resourceMap(0);
  const productionSources = [];

  for (const tile of state.tiles) {
    if (tile.resource === "desert") continue;
    if (tile.idx === state.robberTile) continue;
    if (tile.number !== roll) continue;

    const tileContributions = new Map();
    for (const nodeIdx of tile.nodes) {
      const node = state.nodes[nodeIdx];
      if (node.owner === null) continue;
      const amount = node.isCity ? 2 : 1;
      gains[node.owner][tile.resource] += amount;
      tileContributions.set(node.owner, (tileContributions.get(node.owner) || 0) + amount);
    }

    for (const [playerIdx, amount] of tileContributions.entries()) {
      productionSources.push({
        playerIdx,
        resource: tile.resource,
        amount,
        tileIdx: tile.idx,
      });
    }
  }

  const shortages = [];
  const transferEffects = [];
  for (let i = 0; i < state.players.length; i += 1) {
    const payout = applyBankPayout(state.bank, gains[i], RESOURCES);
    state.bank = payout.bank;
    addResources(state.players[i], payout.granted);
    for (const resource of RESOURCES) grantedTotals[i][resource] = payout.granted[resource];
    for (const resource of RESOURCES) shortageTotals[resource] += payout.shortage[resource];
    const totalShortage = RESOURCES.reduce((sum, resource) => sum + payout.shortage[resource], 0);
    if (totalShortage > 0) shortages.push(`${state.players[i].name}: short ${totalShortage}`);

    for (const resource of RESOURCES) {
      let remainingGranted = payout.granted[resource];
      if (remainingGranted <= 0) continue;
      for (const source of productionSources) {
        if (source.playerIdx !== i || source.resource !== resource || remainingGranted <= 0) continue;
        const grantedAmount = Math.min(source.amount, remainingGranted);
        if (grantedAmount <= 0) continue;
        transferEffects.push({
          resource,
          amount: grantedAmount,
          source: { type: "tile", tileIdx: source.tileIdx },
          target: { type: "player", playerIdx: i, resource },
        });
        remainingGranted -= grantedAmount;
      }
    }
  }
  state.bankShortage = RESOURCES.some((resource) => shortageTotals[resource] > 0) ? shortageTotals : null;

  const summary = state.players
    .map((p, idx) => {
      const parts = RESOURCES.filter((res) => grantedTotals[idx][res] > 0).map((res) => `${grantedTotals[idx][res]} ${res}`);
      return parts.length > 0 ? `${p.name}: ${parts.join(", ")}` : null;
    })
    .filter(Boolean);

  if (summary.length > 0) {
    logEvent(`Production on ${roll}: ${summary.join(" | ")}`);
    setStatus(
      shortages.length > 0
        ? `Resources distributed for roll ${roll}. Bank shortages: ${shortages.join(" | ")}.`
        : `Resources distributed for roll ${roll}.`
    );
  } else {
    logEvent(`Production on ${roll}: no resources generated.`);
    setStatus(`No resources generated on roll ${roll}.`);
  }

  return transferEffects;
}

async function chooseDiscardResource(player, toDiscard) {
  const playerIdx = state.players.indexOf(player);
  if (playerIdx < 0) return { auto: false, selection: null };
  while (true) {
    if (state.turnTimeoutBusy) {
      discardRandomResources(player, toDiscard);
      render();
      return { auto: true, selection: null };
    }

    const picked = await showDiscardModal(playerIdx, toDiscard);
    if (picked?.auto || state.turnTimeoutBusy) {
      discardRandomResources(player, toDiscard);
      render();
      return { auto: true, selection: null };
    }
    if (!picked) {
      if (state.phase !== "main" || state.mainStep !== "discard") return { auto: false, selection: null };
      continue;
    }

    for (const resource of RESOURCES) {
      const amount = picked.selection[resource] || 0;
      if (amount <= 0) continue;
      player.hand[resource] -= amount;
      state.bank[resource] += amount;
    }
    render();
    return { auto: false, selection: picked.selection };
  }
}

async function handleRollSeven() {
  for (const player of state.players) {
    const total = resourceCount(player);
    if (total <= 7) continue;
    const toDiscard = Math.floor(total / 2);
    state.mainStep = "discard";
    const discardResult = await chooseDiscardResource(player, toDiscard);
    const summary = discardResult?.selection ? `: ${tradeSelectionSummary(discardResult.selection)}.` : ".";
    logEvent(
      discardResult?.auto
        ? `${player.name} discarded ${toDiscard} card(s) (timer auto).`
        : `${player.name} discarded ${toDiscard} card(s)${summary}`
    );
  }
  state.pendingRobberMove = true;
  state.mainStep = "move_robber";
  state.mode = "robber";
  setStatus("Rolled 7: click a tile to move the robber.");
}

function discardRandomResources(player, amount) {
  for (let i = 0; i < amount; i += 1) {
    const options = RESOURCES.filter((res) => player.hand[res] > 0);
    const picked = randomChoice(options);
    if (!picked) break;
    player.hand[picked] -= 1;
    state.bank[picked] += 1;
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
  state.mainStep = "main_actions";
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
    state.mainStep = state.pendingDevReturnStep || "main_actions";
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
  state.mainStep = state.pendingDevReturnStep || "main_actions";
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

    if (state.mainStep === "before_roll") {
      logEvent(`${timedOutPlayerName} timed out. Auto-rolling.`);
      await rollDice({ auto: true });
    } else if (state.mainStep === "discard") {
      if (discardModalResolver) closeDiscardModal({ auto: true });
      await delay(0);
    } else if (state.pendingRobberMove) {
      autoMoveRobberForPlayer(state.currentPlayer);
      state.pendingRobberMove = false;
      state.mainStep = "main_actions";
      state.mode = "none";
      logEvent(`${timedOutPlayerName} timed out. Robber resolved automatically.`);
    } else if (state.mainStep === "dev_card_resolution" && currentPlayerObj().devCards.freeRoadPlacements > 0) {
      currentPlayerObj().devCards.freeRoadPlacements = 0;
      state.mainStep = state.pendingDevReturnStep || "main_actions";
      logEvent(`${timedOutPlayerName} timed out. Remaining free roads were forfeited.`);
    } else {
      logEvent(`${timedOutPlayerName} timed out.`);
    }

    if (state.phase === "main" && !state.pendingRobberMove && !state.isRollingDice && state.mainStep === "main_actions") {
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
  state.mainStep = "before_roll";
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
  resetTradeDrafts();
  resetDiscardDraft();
  state.setup = null;
  state.pairedTurn.enabled = pairedTurnEnabled();
  state.pairedTurn.primaryPlayer = 0;
  state.pairedTurn.secondaryPlayer = pairedPartnerIndex(0);
  state.pairedTurn.stage = "primary";
  preparePlayerActionPhase(0, { beforeRoll: true });
  syncTurnStateMirror();
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
  state.mainStep = "before_roll";
  state.mode = "none";
  state.tradeMenuOpen = false;
  resetTradeDrafts();
  resetDiscardDraft();
  syncTurnStateMirror();
  setStatus(`${currentPlayerObj().name}: select settlement, then click again to confirm.`);
  logEvent("Setup started.");
  restartTurnTimer();
}

function startGame(options = {}) {
  const fromRoom = options.fromRoom === true;
  const providedNames = Array.isArray(options.playerNames) ? options.playerNames : null;
  const shouldSync = options.sync !== false;

  if (actionModalResolver) closeActionModal(null);
  if (discardModalResolver) closeDiscardModal(null);

  if (isOnlineRoomActive() && !fromRoom) {
    if (!isRoomHost()) {
      setStatus("Only the room host can start.");
      render();
      return;
    }
    if (onlineState.players.length < 3 || onlineState.players.length > ONLINE_MAX_PLAYERS) {
      setStatus("Online rooms require 3-6 players.");
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
    setStatus("This prototype supports 3-6 players.");
    render();
    return;
  }

  state.turnSeconds = clampTurnSeconds(refs.turnSeconds.value);
  refs.turnSeconds.value = String(state.turnSeconds);
  state.currentSaveId = makeSaveId();
  state.saveCreatedAt = new Date().toISOString();
  state.lastSaveAt = null;
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
      names.push(sanitizePlayerName(inputs[i]?.value, `Player ${i + 1}`));
    }
  }

  state.players = names.map((name, idx) => createPlayerState(name, idx));
  state.tradeMenuOpen = false;
  resetTradeDrafts();
  initializeRuleState(playerCount);

  buildBoard();
  state.log = [];
  logEvent(`New game: ${names.join(", ")}.`);
  if (pairedTurnEnabled(playerCount)) logEvent("5-6 player extension enabled: paired turns are active.");
  beginSetup(state.players);
  resetLocalSaveSession();
  if (!isOnlineGameStarted()) {
    void startLocalSaveSession({ reason: "local_game_start" });
  }
  if (shouldSync || !isOnlineGameStarted()) recordGameAction("game_start");
  render();
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
  if (discardModalResolver) closeDiscardModal(null);

  const existingNames = state.players.map((player) => player.name);
  if (existingNames.length >= 3 && existingNames.length <= ONLINE_MAX_PLAYERS) {
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
  const coords = shuffle(createBoardCoords(state.players.length));

  const resources = [];
  for (const [res, count] of Object.entries(activeResourceCounts(state.players.length))) {
    for (let i = 0; i < count; i += 1) resources.push(res);
  }
  const shuffledResources = shuffle(resources);
  const numbersByTile = assignNumbersWithConstraints(coords, shuffledResources, activeNumberTokens(state.players.length));

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
  state.harbors = generateHarbors(state.players.length);
  recomputeAwards();
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

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function resourceFxColor(resource) {
  return RESOURCE_FX_COLORS[resource] || "#ffd79a";
}

function rectCenter(rect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function rectVisible(rect, margin = 18) {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > margin &&
    rect.right > margin &&
    rect.top < window.innerHeight - margin &&
    rect.left < window.innerWidth - margin
  );
}

function boardPointToViewport(boardX, boardY) {
  if (!state.geometry) return null;
  const rect = refs.board.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const scale = Math.min(rect.width / state.geometry.width, rect.height / state.geometry.height);
  const insetX = (rect.width - state.geometry.width * scale) / 2;
  const insetY = (rect.height - state.geometry.height * scale) / 2;
  return {
    x: rect.left + insetX + boardX * scale,
    y: rect.top + insetY + boardY * scale,
  };
}

function getPlayerCardEl(playerIdx) {
  return refs.tableStats.querySelector(`[data-player-card="${playerIdx}"]`);
}

function getPlayerResourceChipEl(playerIdx, resource) {
  return refs.tableStats.querySelector(`[data-player-idx="${playerIdx}"][data-resource="${resource}"]`);
}

function getBankTransferAnchorEl() {
  const bankPopupVisible =
    refs.bankTradeSection &&
    refs.tradeActionPopup &&
    !refs.tradeActionPopup.classList.contains("hidden") &&
    !refs.bankTradeSection.classList.contains("hidden");
  if (bankPopupVisible) return refs.bankTradeSection;
  return refs.buildPanel.querySelector('[data-bank-anchor="tray"]');
}

function resolveTransferAnchorPoint(anchor, resource) {
  if (!anchor) return null;

  if (anchor.type === "tile") {
    const tile = state.tiles[anchor.tileIdx];
    if (!tile) return null;
    return boardPointToViewport(sx(tile.cx), sy(tile.cy) - 35);
  }

  if (anchor.type === "bank") {
    const bankAnchor = getBankTransferAnchorEl();
    if (!bankAnchor) return null;
    const rect = bankAnchor.getBoundingClientRect();
    return rectVisible(rect, 0) ? rectCenter(rect) : null;
  }

  if (anchor.type === "player") {
    const chip = getPlayerResourceChipEl(anchor.playerIdx, anchor.resource || resource);
    if (chip) {
      const chipRect = chip.getBoundingClientRect();
      if (rectVisible(chipRect, 0)) return rectCenter(chipRect);
    }
    const card = getPlayerCardEl(anchor.playerIdx);
    if (!card) return null;
    const cardRect = card.getBoundingClientRect();
    return rectVisible(cardRect, 0) ? rectCenter(cardRect) : null;
  }

  return null;
}

function pulseResourceChip(playerIdx, resource, direction, amount, delayMs = 0) {
  if (amount <= 0) return;
  const chip = getPlayerResourceChipEl(playerIdx, resource);
  if (!chip) return;

  window.setTimeout(() => {
    if (!chip.isConnected) return;
    const pulseToken = `${Date.now()}-${Math.random()}`;
    chip.dataset.fxPulseToken = pulseToken;
    chip.style.setProperty("--resource-fx-glow", resourceFxColor(resource));
    chip.classList.remove("resource-chip-receiving", "resource-chip-sending");
    void chip.offsetWidth;
    chip.classList.add(direction === "send" ? "resource-chip-sending" : "resource-chip-receiving");

    const delta = document.createElement("span");
    delta.className = `resource-chip-delta ${direction === "send" ? "out" : "in"}`;
    delta.textContent = `${direction === "send" ? "-" : "+"}${amount}`;
    chip.appendChild(delta);
    delta.addEventListener("animationend", () => delta.remove(), { once: true });

    window.setTimeout(() => {
      if (!chip.isConnected) return;
      if (chip.dataset.fxPulseToken === pulseToken) {
        chip.classList.remove("resource-chip-receiving", "resource-chip-sending");
      }
    }, 900);
  }, Math.max(0, delayMs));
}

function createResourceTransferToken({ resource, amount, from, to, delayMs, durationMs }) {
  if (!refs.resourceFxLayer) return;

  const token = document.createElement("div");
  token.className = "resource-transfer-token";
  token.style.left = `${from.x}px`;
  token.style.top = `${from.y}px`;
  token.style.setProperty("--dx", `${to.x - from.x}px`);
  token.style.setProperty("--dy", `${to.y - from.y}px`);
  token.style.setProperty("--dx1", `${(to.x - from.x) * 0.08}px`);
  token.style.setProperty("--dy1", `${(to.y - from.y) * 0.08 - 5}px`);
  token.style.setProperty("--dx2", `${(to.x - from.x) * 0.84}px`);
  token.style.setProperty("--dy2", `${(to.y - from.y) * 0.84 - 10}px`);
  token.style.setProperty("--flight-delay", `${delayMs}ms`);
  token.style.setProperty("--flight-duration", `${durationMs}ms`);
  token.style.setProperty("--resource-glow", resourceFxColor(resource));

  const iconWrap = document.createElement("span");
  iconWrap.className = "resource-transfer-icon";
  iconWrap.appendChild(createResourceIconSvg(resource));
  token.appendChild(iconWrap);

  if (amount > 1) {
    const amountBadge = document.createElement("span");
    amountBadge.className = "resource-transfer-amount";
    amountBadge.textContent = String(amount);
    token.appendChild(amountBadge);
  }

  refs.resourceFxLayer.appendChild(token);
  window.requestAnimationFrame(() => {
    token.classList.add("launch");
  });

  const cleanup = () => token.remove();
  token.addEventListener("animationend", cleanup, { once: true });
  window.setTimeout(cleanup, delayMs + durationMs + 240);
}

function playResourceTransferEffects(transfers) {
  if (!Array.isArray(transfers) || transfers.length === 0) return;
  const reduceMotion = prefersReducedMotion();

  transfers.forEach((transfer, index) => {
    if (!transfer || !transfer.resource || transfer.amount <= 0) return;

    const startDelay = Math.min(420, index * 70);
    if (transfer.source?.type === "player") {
      pulseResourceChip(
        transfer.source.playerIdx,
        transfer.source.resource || transfer.resource,
        "send",
        transfer.amount,
        startDelay
      );
    }

    let arrivalDelay = startDelay;
    if (!reduceMotion) {
      const from = resolveTransferAnchorPoint(transfer.source, transfer.resource);
      const to = resolveTransferAnchorPoint(transfer.target, transfer.resource);
      if (from && to) {
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        if (distance >= 18) {
          const durationMs = Math.max(560, Math.min(980, Math.round(560 + distance * 0.42)));
          createResourceTransferToken({
            resource: transfer.resource,
            amount: transfer.amount,
            from,
            to,
            delayMs: startDelay,
            durationMs,
          });
          arrivalDelay = startDelay + Math.round(durationMs * 0.62);
        }
      }
    }

    if (transfer.target?.type === "player") {
      pulseResourceChip(
        transfer.target.playerIdx,
        transfer.target.resource || transfer.resource,
        "receive",
        transfer.amount,
        arrivalDelay
      );
    }
  });
}

function appendResourceIcon(layer, tile) {
  const g = el("g", {
    class: "resource-icon",
    transform: `translate(${sx(tile.cx)} ${sy(tile.cy) - 35})`,
  });
  appendResourceIconShapes(g, tile.resource);

  layer.appendChild(g);
}

function harborLabel(harbor) {
  if (!harbor) return "";
  if (harbor.type === "generic") return "3:1";
  return `${harbor.type[0].toUpperCase() + harbor.type.slice(1)} 2:1`;
}

function isClickableNode(nodeIdx) {
  if (isOnlineGameStarted() && !localControlsCurrentTurn()) return false;
  if (state.phase === "setup") {
    const setup = state.setup;
    if (!setup || setup.expecting !== "settlement") return false;
    return canBuildSettlement(state.currentPlayer, nodeIdx, true).ok;
  }
  if (state.phase !== "main" || state.phase === "gameover") return false;
  if (state.mainStep !== "main_actions" || state.pendingRobberMove) return false;
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
  if (state.pendingRobberMove) return false;
  if (state.mode !== "road") return false;
  if (state.mainStep !== "main_actions" && !(state.mainStep === "dev_card_resolution" && currentPlayerObj().devCards.freeRoadPlacements > 0)) {
    return false;
  }
  return canBuildRoad(state.currentPlayer, edgeIdx).ok;
}

function isClickableTile(tileIdx) {
  if (isOnlineGameStarted() && !localControlsCurrentTurn()) return false;
  if (state.phase !== "main" || state.phase === "gameover") return false;
  if (!(state.pendingRobberMove || state.mainStep === "move_robber" || state.mode === "robber")) return false;
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
  if (state.mainStep === "before_roll") {
    setStatus("Roll dice or play a dev card first.");
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
  if (state.mainStep === "before_roll") {
    setStatus("Roll dice or play a dev card first.");
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
  if (changed) {
    if (state.pendingDevCardAction === "road_building" && currentPlayerObj().devCards.freeRoadPlacements <= 0) {
      state.pendingDevCardAction = "";
      logEvent(`${currentPlayerObj().name} played Road Building.`);
      checkVictory(state.currentPlayer);
      recordGameAction("play_road_building");
      return;
    }
    recordGameAction("build_road");
  }
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
  if (state.pendingDevCardAction === "knight") {
    state.pendingDevCardAction = "";
    logEvent(`${currentPlayerObj().name} played Knight.`);
    recomputeAwards();
    checkVictory(state.currentPlayer);
    recordGameAction("play_knight");
    return;
  }
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
  const harborLayer = el("g");
  const edgeLayer = el("g");
  const nodeLayer = el("g");
  const overlayLayer = el("g");

  for (const harbor of state.harbors) {
    const dx = Math.cos(harbor.angle || 0);
    const dy = Math.sin(harbor.angle || 0);
    const anchorX = sx(harbor.mx);
    const anchorY = sy(harbor.my);
    const dockX = sx(harbor.mx + dx * 26);
    const dockY = sy(harbor.my + dy * 26);
    const labelX = sx(harbor.mx + dx * 62);
    const labelY = sy(harbor.my + dy * 62);

    const pier = el("line", {
      x1: anchorX,
      y1: anchorY,
      x2: dockX,
      y2: dockY,
      class: "harbor-pier",
    });
    harborLayer.appendChild(pier);

    const plaque = el("rect", {
      x: labelX - 33,
      y: labelY - 12,
      rx: 9,
      ry: 9,
      width: 66,
      height: 24,
      class: "harbor-plaque",
    });
    harborLayer.appendChild(plaque);

    const label = el("text", {
      x: labelX,
      y: labelY + 0.5,
      class: `harbor-label harbor-${harbor.type}`,
    });
    label.textContent = harborLabel(harbor);
    harborLayer.appendChild(label);
  }

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
  refs.board.appendChild(harborLayer);
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
    card.dataset.playerCard = String(idx);

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
    const awards = [];
    if (state.awards.longestRoadHolder === idx) awards.push(`Longest Road ${state.awards.longestRoadLength}`);
    if (state.awards.largestArmyHolder === idx) awards.push(`Largest Army ${player.playedKnights}`);
    vp.textContent = `VP ${victoryPoints(player)} | Roads ${player.roads.size} | Settlements ${player.settlements.size} | Cities ${player.cities.size}`;
    card.appendChild(vp);

    if (awards.length > 0) {
      const awardRow = document.createElement("div");
      awardRow.className = "resource-row";
      awardRow.textContent = awards.join(" | ");
      card.appendChild(awardRow);
    }

    const resources = document.createElement("div");
    resources.className = "resource-strip";
    RESOURCES.forEach((resource) => {
      const chip = document.createElement("div");
      chip.className = "resource-chip";
      chip.title = `${resource}: ${player.hand[resource]}`;
      chip.dataset.playerIdx = String(idx);
      chip.dataset.resource = resource;

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

    const devSummary = document.createElement("div");
    devSummary.className = "resource-row";
    const devCounts = player.devCards
      ? ["knight", "road_building", "year_of_plenty", "monopoly", "victory_point"]
          .map((cardType) => `${cardType.replaceAll("_", " ")} ${player.devCards.hand[cardType] + player.devCards.boughtThisTurn[cardType]}`)
          .join(" | ")
      : "No development cards";
    devSummary.textContent = `Dev: ${devCounts}`;
    card.appendChild(devSummary);

    grid.appendChild(card);
  });

  refs.tableStats.appendChild(grid);
}

function renderTradeResourceGrid(kind, side, container) {
  if (!container) return;
  ensureTradeDrafts();
  normalizeTradeDraft(kind);
  container.innerHTML = "";
  const selection = state.tradeDrafts[kind][side];

  for (const resource of RESOURCES) {
    const count = selection[resource] || 0;
    const step = tradeStepAmount(kind, side, resource);
    const canAdd = canIncreaseTradeDraft(kind, side, resource);

    const card = document.createElement("div");
    card.className = `trade-resource-card${count > 0 ? " selected" : ""}${canAdd ? "" : " locked"}`;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "trade-resource-btn";
    addBtn.disabled = !canAdd;
    addBtn.title = `${resource}: click to add ${step}`;
    addBtn.addEventListener("click", () => adjustTradeDraft(kind, side, resource, 1));

    const iconWrap = document.createElement("span");
    iconWrap.className = "trade-resource-icon";
    iconWrap.appendChild(createResourceIconSvg(resource));
    addBtn.appendChild(iconWrap);

    const name = document.createElement("span");
    name.className = "trade-resource-name";
    name.textContent = resource;
    addBtn.appendChild(name);

    const meta = document.createElement("span");
    meta.className = "trade-resource-meta";
    meta.textContent = tradeResourceAvailabilityLabel(kind, side, resource);
    addBtn.appendChild(meta);

    const stepPill = document.createElement("span");
    stepPill.className = "trade-resource-step";
    stepPill.textContent = `+${step}`;
    addBtn.appendChild(stepPill);

    card.appendChild(addBtn);

    if (count > 0) {
      const selected = document.createElement("span");
      selected.className = "trade-resource-selected";
      selected.textContent = String(count);
      card.appendChild(selected);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "trade-resource-dec";
      removeBtn.textContent = "-";
      removeBtn.title = `Remove ${step} ${resource}`;
      removeBtn.addEventListener("click", () => adjustTradeDraft(kind, side, resource, -1));
      card.appendChild(removeBtn);
    }

    container.appendChild(card);
  }
}

function renderDiscardResourceGrid() {
  if (!refs.discardResourceGrid) return;
  refs.discardResourceGrid.innerHTML = "";

  const draft = discardDraftState();
  const player = draft.player;
  if (!player) return;

  for (const resource of RESOURCES) {
    const count = draft.selection[resource] || 0;
    const inHand = player.hand[resource] || 0;
    const canAdd = canIncreaseDiscardDraft(resource);

    const card = document.createElement("div");
    card.className = `trade-resource-card${count > 0 ? " selected" : ""}${canAdd || count > 0 ? "" : " locked"}`;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "trade-resource-btn";
    addBtn.disabled = !canAdd;
    addBtn.title = `${resource}: click to add 1`;
    addBtn.addEventListener("click", () => adjustDiscardDraft(resource, 1));

    const iconWrap = document.createElement("span");
    iconWrap.className = "trade-resource-icon";
    iconWrap.appendChild(createResourceIconSvg(resource));
    addBtn.appendChild(iconWrap);

    const name = document.createElement("span");
    name.className = "trade-resource-name";
    name.textContent = resource;
    addBtn.appendChild(name);

    const meta = document.createElement("span");
    meta.className = "trade-resource-meta";
    meta.textContent = `${inHand} in hand`;
    addBtn.appendChild(meta);

    const stepPill = document.createElement("span");
    stepPill.className = "trade-resource-step";
    stepPill.textContent = "+1";
    addBtn.appendChild(stepPill);

    card.appendChild(addBtn);

    if (count > 0) {
      const selected = document.createElement("span");
      selected.className = "trade-resource-selected";
      selected.textContent = String(count);
      card.appendChild(selected);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "trade-resource-dec";
      removeBtn.textContent = "-";
      removeBtn.title = `Remove 1 ${resource}`;
      removeBtn.addEventListener("click", () => adjustDiscardDraft(resource, -1));
      card.appendChild(removeBtn);
    }

    refs.discardResourceGrid.appendChild(card);
  }
}

function renderBuildPanel() {
  refs.buildPanel.innerHTML = "";
  if (state.players.length === 0) {
    refs.buildPanel.textContent = "Start a game to see build options.";
    return;
  }

  const player = currentPlayerObj();
  const canAct = canTakeMainActions();
  const canResolveFreeRoads = state.mainStep === "dev_card_resolution" && player.devCards?.freeRoadPlacements > 0;
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
    { label: "Dev Card", cost: COST.development },
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
    const actionReady =
      entry.label === "Road" && player.devCards?.freeRoadPlacements > 0
        ? true
        : entry.label === "Road"
        ? canBuildRoad(state.currentPlayer, -1, null, { skipEdgeCheck: true }).ok
        : entry.label === "Settlement"
        ? canBuildSettlement(state.currentPlayer, -1, false, { skipNodeCheck: true }).ok
        : entry.label === "City"
        ? canBuildCity(state.currentPlayer, -1, { skipNodeCheck: true }).ok
        : canAfford(player, entry.cost) && state.devDeck.length > 0;
    const canBuild =
      entry.label === "Road"
        ? canResolveFreeRoads || (canAct && actionReady)
        : entry.label === "Dev Card"
        ? canAct && actionReady
        : canAct && actionReady;
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
    if (entry.label === "Dev Card") {
      const meta = document.createElement("div");
      meta.className = "resource-row";
      meta.textContent = `${state.devDeck.length} cards remain`;
      card.appendChild(meta);

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Buy";
      button.disabled = !canBuild;
      button.addEventListener("click", buyDevelopmentCardForCurrentPlayer);
      card.appendChild(button);
    }
    wrap.appendChild(card);
  });

  const playableDevCards = ["knight", "road_building", "year_of_plenty", "monopoly"].filter((cardType) =>
    canPlayDevelopmentCard(player.devCards, cardType, { mainStep: state.mainStep })
  );
  if (player.devCards && (playableDevCards.length > 0 || countVictoryPointCards(player.devCards) > 0)) {
    const devTray = document.createElement("div");
    devTray.className = `build-chip ${playableDevCards.length > 0 ? "ok" : "locked"}`;
    const devHead = document.createElement("div");
    devHead.className = "build-chip-head";
    const devLabel = document.createElement("span");
    devLabel.className = "build-chip-label";
    devLabel.textContent = "Dev Cards";
    devHead.appendChild(devLabel);
    const devState = document.createElement("span");
    devState.className = "build-chip-state";
    devState.textContent = playableDevCards.length > 0 ? "Playable" : "Held";
    devHead.appendChild(devState);
    devTray.appendChild(devHead);

    const detail = document.createElement("div");
    detail.className = "resource-row";
    detail.textContent = `VP cards ${countVictoryPointCards(player.devCards)} | Playable ${playableDevCards.length}`;
    devTray.appendChild(detail);

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.textContent = "Play Card";
    playButton.disabled = playableDevCards.length === 0 || !localControlsCurrentTurn();
    playButton.addEventListener("click", () => {
      void playDevelopmentCardForCurrentPlayer();
    });
    devTray.appendChild(playButton);
    wrap.appendChild(devTray);
  }

  refs.buildPanel.appendChild(wrap);
}

function renderTradePanel() {
  refs.tradePanel.innerHTML = "";
  if (state.players.length === 0) {
    refs.tradePanel.textContent = "Start a game to see trade options.";
    return;
  }

  const player = currentPlayerObj();
  const canAct = canTakeMainActions();
  const availableTargets = state.players
    .filter((entry, idx) => idx !== state.currentPlayer && resourceCount(entry) > 0)
    .map((entry) => entry.name);
  const canBankTrade = canAct && hasBankTradeOption(player);
  const canPlayerTrade = canAct && availableTargets.length > 0 && hasPlayerTradeOption(state.currentPlayer);

  const wrap = document.createElement("div");
  wrap.className = "build-grid trade-grid";

  const title = document.createElement("div");
  title.className = "build-title";
  title.textContent = `Trade (${player.name})`;
  wrap.appendChild(title);

  const bankTrade = document.createElement("div");
  bankTrade.className = `build-chip ${canBankTrade ? "ok" : "locked"}`;

  const bankHead = document.createElement("div");
  bankHead.className = "build-chip-head";
  const bankLabel = document.createElement("span");
  bankLabel.className = "build-chip-label";
  bankLabel.textContent = "Bank Trade";
  bankHead.appendChild(bankLabel);

  const bankState = document.createElement("span");
  bankState.className = "build-chip-state";
  bankState.textContent = canBankTrade ? "Ready" : "Not Ready";
  bankHead.appendChild(bankState);
  bankTrade.appendChild(bankHead);

  const bankDetail = document.createElement("div");
  bankDetail.className = "resource-row";
  bankDetail.textContent = `Best rate: ${RESOURCES.map((resource) => `${resource} ${resolveHarborTradeRate(state, state.currentPlayer, resource)}:1`).join(" | ")}`;
  bankTrade.appendChild(bankDetail);
  wrap.appendChild(bankTrade);

  const playerTrade = document.createElement("div");
  playerTrade.className = `build-chip ${canPlayerTrade ? "ok" : "locked"}`;
  const playerTradeHead = document.createElement("div");
  playerTradeHead.className = "build-chip-head";
  const playerTradeLabel = document.createElement("span");
  playerTradeLabel.className = "build-chip-label";
  playerTradeLabel.textContent = "Player Trade";
  playerTradeHead.appendChild(playerTradeLabel);
  const playerTradeState = document.createElement("span");
  playerTradeState.className = "build-chip-state";
  playerTradeState.textContent = canPlayerTrade ? "Ready" : "Waiting";
  playerTradeHead.appendChild(playerTradeState);
  playerTrade.appendChild(playerTradeHead);

  const playerTradeDetail = document.createElement("div");
  playerTradeDetail.className = "resource-row";
  playerTradeDetail.textContent =
    availableTargets.length > 0
      ? `Targets: ${availableTargets.join(", ")}`
      : "No opponents currently have cards to trade.";
  playerTrade.appendChild(playerTradeDetail);
  wrap.appendChild(playerTrade);

  const bankTray = document.createElement("div");
  bankTray.className = "build-chip";
  bankTray.dataset.bankAnchor = "tray";
  const bankTrayHead = document.createElement("div");
  bankTrayHead.className = "build-chip-head";
  const bankTrayLabel = document.createElement("span");
  bankTrayLabel.className = "build-chip-label";
  bankTrayLabel.textContent = "Bank";
  bankTrayHead.appendChild(bankTrayLabel);
  bankTray.appendChild(bankTrayHead);

  const bankTrayDetail = document.createElement("div");
  bankTrayDetail.className = "resource-row";
  bankTrayDetail.textContent = RESOURCES.map((resource) => `${resource} ${state.bank[resource]}`).join(" | ");
  bankTray.appendChild(bankTrayDetail);

  if (state.bankShortage) {
    const shortages = RESOURCES.filter((resource) => state.bankShortage[resource] > 0).map(
      (resource) => `${resource} short ${state.bankShortage[resource]}`
    );
    if (shortages.length > 0) {
      const shortageRow = document.createElement("div");
      shortageRow.className = "resource-row";
      shortageRow.textContent = `Recent shortage: ${shortages.join(" | ")}`;
      bankTray.appendChild(shortageRow);
    }
  }
  wrap.appendChild(bankTray);

  refs.tradePanel.appendChild(wrap);
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
  syncBoardHudVisibility();
  refs.statusText.textContent = state.status;
  refs.turnCallout.textContent = turnContextText(activePlayer);

  const discardPlayer = discardModalResolver ? discardDraftPlayer() : null;
  const showDiscardModal = Boolean(discardModalResolver && state.mainStep === "discard" && discardPlayer);
  if (!showDiscardModal) {
    clearDiscardModalUi();
  } else {
    const draft = discardDraftState();
    refs.discardModal.classList.remove("hidden");
    refs.discardModal.setAttribute("aria-hidden", "false");
    refs.discardModalTitle.textContent = `${discardPlayer.name} Must Discard`;
    refs.discardModalText.textContent =
      draft.remaining > 0
        ? `Choose ${draft.remaining} more card(s) to discard.`
        : "Review the discard combo, then submit to give up the cards.";
    renderDiscardResourceGrid();
    refs.discardModalHint.textContent =
      draft.selected > 0
        ? `Selected ${draft.selected}/${draft.required}: ${draft.summary}. Add or remove cards before submitting.`
        : `Choose ${draft.required} card(s) to discard.`;
    refs.discardSubmitBtn.disabled = !draft.complete;
  }

  const inMainPhase = state.phase === "main" && state.phase !== "gameover";
  const canRoll = inMainPhase && !controlsLockedToOtherPlayer && canRollDiceNow();
  refs.rollBtn.disabled = !canRoll;

  const canResolveFreeRoads =
    inMainPhase &&
    !controlsLockedToOtherPlayer &&
    state.mainStep === "dev_card_resolution" &&
    Boolean(activePlayer?.devCards?.freeRoadPlacements > 0);
  const canEndTurn = inMainPhase && !controlsLockedToOtherPlayer && canTakeMainActions();
  refs.endTurnBtn.disabled = !canEndTurn;

  const canTakeActions = inMainPhase && !controlsLockedToOtherPlayer && canTakeMainActions();
  const canBankTrade = Boolean(activePlayer && canTakeActions && hasBankTradeOption(activePlayer));
  const canPlayerTrade = Boolean(
    activePlayer &&
      canTakeActions &&
      refs.p2pTarget.options.length > 0 &&
      hasPlayerTradeOption(state.currentPlayer)
  );
  const hasTradeChoice = canBankTrade || canPlayerTrade;
  const activeTradeTab = normalizeActiveTradeTab(canBankTrade, canPlayerTrade);
  if (!hasTradeChoice) {
    state.tradeMenuOpen = false;
    resetTradeDrafts();
  }
  const showTradeMenu = hasTradeChoice && state.tradeMenuOpen;

  refs.tradePromptPopup.classList.toggle("hidden", !hasTradeChoice || showTradeMenu);
  refs.tradeActionPopup.classList.toggle("hidden", !showTradeMenu);
  refs.tradeTabBar.classList.toggle("hidden", !showTradeMenu || !(canBankTrade && canPlayerTrade));
  refs.bankTradeSection.classList.toggle("hidden", !showTradeMenu || !canBankTrade || activeTradeTab !== "bank");
  refs.playerTradeSection.classList.toggle("hidden", !showTradeMenu || !canPlayerTrade || activeTradeTab !== "player");
  refs.openBankTradeBtn.classList.toggle("hidden", !canBankTrade);
  refs.openPlayerTradeBtn.classList.toggle("hidden", !canPlayerTrade);
  refs.openBankTradeBtn.disabled = !canBankTrade;
  refs.openPlayerTradeBtn.disabled = !canPlayerTrade;
  refs.closeTradeMenuBtn.disabled = !hasTradeChoice;
  refs.bankTradeTabBtn.classList.toggle("hidden", !canBankTrade);
  refs.playerTradeTabBtn.classList.toggle("hidden", !canPlayerTrade);
  refs.bankTradeTabBtn.classList.toggle("active", activeTradeTab === "bank");
  refs.playerTradeTabBtn.classList.toggle("active", activeTradeTab === "player");
  refs.bankTradeTabBtn.setAttribute("aria-selected", activeTradeTab === "bank" ? "true" : "false");
  refs.playerTradeTabBtn.setAttribute("aria-selected", activeTradeTab === "player" ? "true" : "false");
  refs.bankTradeTabBtn.setAttribute("tabindex", activeTradeTab === "bank" ? "0" : "-1");
  refs.playerTradeTabBtn.setAttribute("tabindex", activeTradeTab === "player" ? "0" : "-1");

  normalizeTradeDraft("bank");
  normalizeTradeDraft("player");
  renderTradeResourceGrid("bank", "give", refs.bankTradeGiveGrid);
  renderTradeResourceGrid("bank", "get", refs.bankTradeGetGrid);
  renderTradeResourceGrid("player", "give", refs.p2pGiveGrid);
  renderTradeResourceGrid("player", "get", refs.p2pGetGrid);

  const bankDraftState = bankTradeDraftState();
  const playerDraftState = playerTradeDraftState();

  refs.tradeBtn.disabled = !showTradeMenu || !canBankTrade || !bankDraftState.ok;
  refs.p2pTarget.disabled = !showTradeMenu || !canPlayerTrade;
  refs.p2pTradeBtn.disabled = !showTradeMenu || !canPlayerTrade || !playerDraftState.ok;

  refs.bankTradeTitle.textContent = "Bank Trade";
  if (canBankTrade && activePlayer) {
    const tradeable = RESOURCES.map((resource) => ({
      resource,
      rate: resolveHarborTradeRate(state, state.currentPlayer, resource),
    })).filter(({ resource, rate }) => {
      if (activePlayer.hand[resource] < rate) return false;
      return RESOURCES.some((target) => target !== resource && state.bank[target] > 0);
    });
    const baseHint = `Can give: ${tradeable.map(({ resource, rate }) => `${resource} ${rate}:1`).join(" | ")}`;
    refs.bankTradeHint.textContent = bankDraftState.ok
      ? `Selected: ${bankDraftState.giveAmount} ${bankDraftState.giveResource} for ${bankDraftState.getAmount} ${bankDraftState.getResource}. ${baseHint}`
      : `${baseHint}${bankDraftState.reason ? ` | ${bankDraftState.reason}` : ""}`;
  } else {
    refs.bankTradeHint.textContent = "";
  }

  if (canPlayerTrade) {
    const targets = [];
    for (let idx = 0; idx < state.players.length; idx += 1) {
      if (idx === state.currentPlayer) continue;
      if (resourceCount(state.players[idx]) > 0) targets.push(state.players[idx].name);
    }
    const draftSummary = playerDraftState.ok
      ? `Selected: give ${tradeSelectionSummary(playerDraftState.giveSelection)} | get ${tradeSelectionSummary(playerDraftState.getSelection)}`
      : playerDraftState.reason;
    refs.p2pTradeHint.textContent = `Available players: ${targets.join(", ")}${draftSummary ? ` | ${draftSummary}` : ""}`;
  } else {
    refs.p2pTradeHint.textContent = "";
  }

  const showBuildActionPopup = Boolean(
    activePlayer && ((canTakeActions && hasAnyBuildByResources(activePlayer)) || canResolveFreeRoads)
  );
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
      btn.disabled = !(canResolveFreeRoads || (canTakeActions && canBuildRoad(state.currentPlayer, -1, null, { skipEdgeCheck: true }).ok));
      continue;
    }
    if (mode === "settlement") {
      btn.disabled = !(canTakeActions && canBuildSettlement(state.currentPlayer, -1, false, { skipNodeCheck: true }).ok);
      continue;
    }
    if (mode === "city") {
      btn.disabled = !(canTakeActions && canBuildCity(state.currentPlayer, -1, { skipNodeCheck: true }).ok);
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
  renderTradePanel();
  renderLog();
}

async function rollDice(options = {}) {
  const auto = options.auto === true;
  if (!auto && !assertLocalTurnControl()) return;
  if (!canRollDiceNow()) return;
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
    const transferEffects = distributeResources(roll);
    state.mainStep = "main_actions";
    if (!auto) setStatus(`${currentPlayerObj().name}: choose actions, then end turn.`);
    render();
    playResourceTransferEffects(transferEffects);
    recordGameAction("roll_dice");
    return;
  }
  render();
  recordGameAction("roll_dice");
}

function endTurn() {
  if (!assertLocalTurnControl()) return;
  if (!canTakeMainActions()) return;
  state.isRollingDice = false;
  state.rollingDiceValue = null;
  state.rollResultPopupValue = null;
  state.mode = "none";
  state.tradeMenuOpen = false;
  resetTradeDrafts();
  const previousPlayerName = currentPlayerObj().name;
  advancePairedTurn();
  setStatus(turnContextText(currentPlayerObj()));
  logEvent(`Turn passed from ${previousPlayerName} to ${currentPlayerObj().name}.`);
  restartTurnTimer();
  render();
  recordGameAction("end_turn");
}

function bankTrade() {
  if (!assertLocalTurnControl()) return;
  if (!canTakeMainActions()) return;
  const draft = bankTradeDraftState();
  if (!draft.ok) {
    setStatus(draft.reason);
    render();
    return;
  }
  const trade = performBankTrade(state, state.currentPlayer, draft.giveResource, draft.getResource, {
    count: draft.bundles,
  });
  if (!trade.ok) {
    setStatus(trade.reason);
    render();
    return;
  }
  state.players = trade.state.players;
  state.bank = trade.state.bank;
  state.bankShortage = null;
  resetTradeDrafts("bank");
  logEvent(
    `${currentPlayerObj().name} traded ${draft.giveAmount} ${draft.giveResource} for ${draft.getAmount} ${draft.getResource}.`
  );
  setStatus(
    `${currentPlayerObj().name} traded with the bank at ${trade.rate}:1 for ${draft.getAmount} ${draft.getResource}.`
  );
  const transferEffects = [
    {
      resource: draft.giveResource,
      amount: draft.giveAmount,
      source: { type: "player", playerIdx: state.currentPlayer, resource: draft.giveResource },
      target: { type: "bank" },
    },
    {
      resource: draft.getResource,
      amount: draft.getAmount,
      source: { type: "bank" },
      target: { type: "player", playerIdx: state.currentPlayer, resource: draft.getResource },
    },
  ];
  render();
  playResourceTransferEffects(transferEffects);
  recordGameAction("bank_trade");
}

function playerTrade() {
  if (!assertLocalTurnControl()) return;
  if (!canTakeMainActions()) return;
  if (!canUseDomesticTrade()) {
    setStatus("Paired player 2 cannot trade with other players.");
    render();
    return;
  }
  const fromIdx = state.currentPlayer;
  const draft = playerTradeDraftState();
  if (!draft.ok) {
    setStatus(draft.reason);
    render();
    return;
  }
  const toIdx = draft.targetIdx;

  const from = state.players[fromIdx];
  const to = state.players[toIdx];

  const accepted = window.confirm(
    `${to.name}, accept this trade?\n` +
      `${from.name} gives ${tradeSelectionSummary(draft.giveSelection)}\n` +
      `${to.name} gives ${tradeSelectionSummary(draft.getSelection)}`
  );
  if (!accepted) {
    logEvent(`${to.name} declined a trade from ${from.name}.`);
    setStatus("Trade declined.");
    render();
    return;
  }

  for (const [resource, amount] of draft.getEntries) {
    if (to.hand[resource] < amount) {
      setStatus(`${to.name} cannot fulfill ${amount} ${resource}.`);
      render();
      return;
    }
  }

  from.hand = applyResourceDelta(from.hand, draft.getSelection, RESOURCES);
  from.hand = applyResourceDelta(
    from.hand,
    Object.fromEntries(draft.giveEntries.map(([resource, amount]) => [resource, -amount])),
    RESOURCES
  );
  to.hand = applyResourceDelta(to.hand, draft.giveSelection, RESOURCES);
  to.hand = applyResourceDelta(
    to.hand,
    Object.fromEntries(draft.getEntries.map(([resource, amount]) => [resource, -amount])),
    RESOURCES
  );
  state.bankShortage = null;
  resetTradeDrafts("player");
  logEvent(
    `${from.name} traded ${tradeSelectionSummary(draft.giveSelection)} for ${tradeSelectionSummary(draft.getSelection)} with ${to.name}.`
  );
  setStatus("Trade completed.");
  const transferEffects = [
    ...draft.giveEntries.map(([resource, amount]) => ({
      resource,
      amount,
      source: { type: "player", playerIdx: fromIdx, resource },
      target: { type: "player", playerIdx: toIdx, resource },
    })),
    ...draft.getEntries.map(([resource, amount]) => ({
      resource,
      amount,
      source: { type: "player", playerIdx: toIdx, resource },
      target: { type: "player", playerIdx: fromIdx, resource },
    })),
  ];
  render();
  playResourceTransferEffects(transferEffects);
  recordGameAction("player_trade");
}

async function chooseResources(title, text, count) {
  const picks = resourceMap(0);
  for (let step = 0; step < count; step += 1) {
    const picked = await showActionModal({
      title,
      text: `${text} (${step + 1}/${count})`,
      options: RESOURCES.map((resource) => ({
        label: resource[0].toUpperCase() + resource.slice(1),
        value: resource,
      })),
      allowCancel: true,
    });
    if (!picked) return null;
    picks[picked] += 1;
  }
  return picks;
}

function updatePlayerDevState(playerIdx, devCards) {
  state.players[playerIdx].devCards = devCards;
  state.players[playerIdx].playedKnights = devCards.playedKnights;
  recomputeAwards();
}

function buyDevelopmentCardForCurrentPlayer() {
  if (!assertLocalTurnControl()) return;
  if (!canTakeMainActions()) return;
  const purchase = buyDevelopmentCard(state, state.currentPlayer);
  if (!purchase.ok) {
    setStatus(purchase.reason);
    render();
    return;
  }
  state.players[state.currentPlayer] = {
    ...state.players[state.currentPlayer],
    hand: purchase.player.hand,
    devCards: purchase.player.devCards,
    playedKnights: purchase.player.devCards.playedKnights,
  };
  state.bank = purchase.bank;
  state.devDeck = purchase.devDeck;
  state.bankShortage = null;
  setStatus(`${currentPlayerObj().name} bought a development card.`);
  logEvent(`${currentPlayerObj().name} bought a development card.`);
  checkVictory(state.currentPlayer);
  render();
  recordGameAction("buy_development_card");
}

async function playDevelopmentCardForCurrentPlayer() {
  if (!assertLocalTurnControl()) return;
  if (state.phase !== "main" || state.isRollingDice || state.pendingRobberMove) return;
  const player = currentPlayerObj();
  const turnState = { mainStep: state.mainStep };
  const originalDevCards = normalizeDevelopmentState(player.devCards);
  const playable = ["knight", "road_building", "year_of_plenty", "monopoly"].filter((cardType) =>
    canPlayDevelopmentCard(player.devCards, cardType, turnState)
  );
  if (playable.length === 0) {
    setStatus("No playable development cards right now.");
    render();
    return;
  }

  const picked = await showActionModal({
    title: "Play Development Card",
    text: "Choose a development card to play.",
    options: playable.map((cardType) => ({
      label: cardType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      value: cardType,
    })),
    allowCancel: true,
  });
  if (!picked) {
    render();
    return;
  }

  const spent = spendDevelopmentCard(player.devCards, picked, turnState);
  if (!spent.ok) {
    setStatus(spent.reason);
    render();
    return;
  }

  const returnStep = state.mainStep;
  state.pendingDevReturnStep = returnStep === "before_roll" ? "before_roll" : "main_actions";
  state.pendingDevCardAction = picked;
  updatePlayerDevState(state.currentPlayer, spent.devCards);

  if (picked === "knight") {
    state.pendingRobberMove = true;
    state.mainStep = "move_robber";
    state.mode = "robber";
    setStatus(`${currentPlayerObj().name}: move the robber.`);
    render();
    return;
  }

  if (picked === "road_building") {
    updatePlayerDevState(state.currentPlayer, applyRoadBuildingEffect(spent.devCards, 2));
    state.mainStep = "dev_card_resolution";
    state.mode = "road";
    setStatus(`${currentPlayerObj().name}: place 2 free roads.`);
    render();
    return;
  }

  if (picked === "year_of_plenty") {
    const desired = await chooseResources("Year of Plenty", "Choose a resource from the bank", 2);
    if (!desired) {
      updatePlayerDevState(state.currentPlayer, originalDevCards);
      state.mainStep = returnStep;
      state.pendingDevCardAction = "";
      render();
      return;
    }
    const effect = applyYearOfPlentyEffect(state.bank, player.hand, desired);
    state.bank = effect.bank;
    player.hand = effect.hand;
    state.bankShortage = effect.shortage;
    state.mainStep = state.pendingDevReturnStep || "main_actions";
    state.pendingDevCardAction = "";
    setStatus(`${player.name} resolved Year of Plenty.`);
    logEvent(`${player.name} played Year of Plenty.`);
    checkVictory(state.currentPlayer);
    render();
    recordGameAction("play_year_of_plenty");
    return;
  }

  if (picked === "monopoly") {
    const resource = await showActionModal({
      title: "Monopoly",
      text: "Choose the resource to collect from all opponents.",
      options: RESOURCES.map((entry) => ({
        label: entry[0].toUpperCase() + entry.slice(1),
        value: entry,
      })),
      allowCancel: true,
    });
    if (!resource) {
      updatePlayerDevState(state.currentPlayer, originalDevCards);
      state.mainStep = returnStep;
      state.pendingDevCardAction = "";
      render();
      return;
    }
    const effect = applyMonopolyEffect(state.players, state.currentPlayer, resource);
    state.players = effect.players.map((entry, idx) => ({
      ...state.players[idx],
      hand: entry.hand,
    }));
    state.bankShortage = null;
    state.mainStep = state.pendingDevReturnStep || "main_actions";
    state.pendingDevCardAction = "";
    logEvent(`${currentPlayerObj().name} played Monopoly on ${resource} and stole ${effect.stolen}.`);
    setStatus(`${currentPlayerObj().name} stole ${effect.stolen} ${resource}.`);
    checkVictory(state.currentPlayer);
    render();
    recordGameAction("play_monopoly");
  }
}

function initTradeSelectors() {
  resetTradeDrafts();
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
  refs.buildDockToggleBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    setPinnedOrbDock(isOrbDockPinned("build") ? null : "build");
  });
  refs.tradeDockToggleBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    setPinnedOrbDock(isOrbDockPinned("trade") ? null : "trade");
  });
  refs.boardOrbDock.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  document.addEventListener("click", (event) => {
    if (!hasPinnedOrbDock()) return;
    if (refs.boardOrbDock.contains(event.target)) return;
    setPinnedOrbDock(null);
  });
  refs.histogramToggleBtn.addEventListener("click", () => {
    if (state.phase !== "main" && state.phase !== "gameover") return;
    state.histogramOpen = !state.histogramOpen;
    renderRollHistogram();
  });
  refs.openBankTradeBtn.addEventListener("click", () => {
    if (refs.tradePromptPopup.classList.contains("hidden")) return;
    openTradeMenu("bank");
  });
  refs.openPlayerTradeBtn.addEventListener("click", () => {
    if (refs.tradePromptPopup.classList.contains("hidden")) return;
    openTradeMenu("player");
  });
  refs.bankTradeTabBtn.addEventListener("click", () => {
    if (refs.tradeActionPopup.classList.contains("hidden")) return;
    switchTradeTab("bank");
  });
  refs.playerTradeTabBtn.addEventListener("click", () => {
    if (refs.tradeActionPopup.classList.contains("hidden")) return;
    switchTradeTab("player");
  });
  refs.closeTradeMenuBtn.addEventListener("click", () => {
    state.tradeMenuOpen = false;
    resetTradeDrafts();
    render();
  });
  refs.tradeBtn.addEventListener("click", bankTrade);
  refs.p2pTradeBtn.addEventListener("click", playerTrade);
  refs.p2pTarget.addEventListener("change", () => {
    resetTradeDrafts("player");
    if (!refs.tradeActionPopup.classList.contains("hidden")) render();
  });
  refs.discardSubmitBtn.addEventListener("click", submitDiscardDraft);
  refs.actionModalCancelBtn.addEventListener("click", () => closeActionModal(null));
  refs.actionModal.addEventListener("click", (event) => {
    const cancelVisible = !refs.actionModalCancelBtn.classList.contains("hidden");
    if (event.target === refs.actionModal && cancelVisible) closeActionModal(null);
  });
  window.addEventListener("keydown", (event) => {
    const cancelVisible = !refs.actionModalCancelBtn.classList.contains("hidden");
    if (event.key === "Escape" && actionModalResolver && cancelVisible) closeActionModal(null);
    if (event.key === "Escape" && hasPinnedOrbDock()) setPinnedOrbDock(null);
  });

  refs.modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
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
  refs.turnSeconds.value = String(state.turnSeconds);
  stopTurnTimer(true);
  state.rollHistogram = emptyRollHistogram();
  state.rollCountTotal = 0;
  state.histogramOpen = false;
  refreshSaveCatalogState();
  void refreshLatestSaveAvailability();
  setBoardDiceFaces(1, 2);
  render();
}

init();
