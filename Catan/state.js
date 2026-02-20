// state.js — Single source of truth: game state object + state mutation helpers

"use strict";

import { DEFAULT_TURN_SECONDS, DICE_SUMS } from "./constants.js";
import { emptyRollHistogram } from "./utils.js";

export const state = {
  // Players & board
  players: [],
  tiles: [],
  nodes: [],
  edges: [],
  geometry: null,
  robberTile: -1,

  // Phase management
  phase: "pregame", // pregame | setup | main | gameover
  setup: null,
  currentPlayer: 0,
  round: 1,

  // Dice / roll
  hasRolled: false,
  diceResult: null,
  isRollingDice: false,
  rollingDiceValue: null,
  rollResultPopupValue: null,
  rollHistogram: emptyRollHistogram(),
  rollCountTotal: 0,
  histogramOpen: false,

  // Timer
  turnSeconds: DEFAULT_TURN_SECONDS,
  turnTimerActive: false,
  turnTimerEndMs: 0,
  turnTimerRemainingMs: DEFAULT_TURN_SECONDS * 1000,
  turnTimeoutBusy: false,

  // Build / robber / trade
  pendingRobberMove: false,
  mode: "none", // none | road | settlement | city | robber
  tradeMenuOpen: false,

  // UI state
  status: "Set players and start.",
  log: [],
};

// ── Mutation helpers ──────────────────────────────────────────────────────────

export function setStatus(msg) {
  state.status = msg;
}

export function logEvent(msg) {
  state.log.unshift(msg);
  if (state.log.length > 16) state.log.length = 16;
}

export function currentPlayerObj() {
  return state.players[state.currentPlayer];