// utils.js — Pure helper functions (math, RNG, resource ops)

"use strict";

import { RESOURCES, DICE_SUMS, DEFAULT_TURN_SECONDS } from "./constants.js";

// ── Collections ───────────────────────────────────────────────────────────────

export function resourceMap(init = 0) {
  const out = {};
  for (const res of RESOURCES) out[res] = init;
  return out;
}

export function emptyRollHistogram() {
  const out = {};
  for (const sum of DICE_SUMS) out[sum] = 0;
  return out;
}

export function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function randomChoice(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Number parsing ────────────────────────────────────────────────────────────

export function parsePositiveInt(raw) {
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 1) return null;
  return num;
}

export function clampTurnSeconds(raw) {
  const parsed = parsePositiveInt(raw);
  if (parsed === null) return DEFAULT_TURN_SECONDS;
  return Math.min(600, Math.max(10, parsed));
}

// ── Dice ──────────────────────────────────────────────────────────────────────

export function randomDieValue() {
  return 1 + Math.floor(Math.random() * 6);
}

export function randomInt(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

export function dicePairForTotal(total) {
  const pairs = [];
  for (let dieA = 1; dieA <= 6; dieA += 1) {
    const dieB = total - dieA;
    if (dieB >= 1 && dieB <= 6) pairs.push([dieA, dieB]);
  }
  return pairs[Math.floor(Math.random() * pairs.length)];
}

// ── Resources ─────────────────────────────────────────────────────────────────

export function canAfford(player, cost) {
  return Object.entries(cost).every(([res, amt]) => player.hand[res] >= amt);
}

export function payCost(player, cost) {
  for (const [res, amt] of Object.entries(cost)) player.hand[res] -= amt;
}

export function addResources(player, gains) {
  for (const [res, amt] of Object.entries(gains)) player.hand[res] += amt;
}

export function resourceCount(player) {
  return RESOURCES.reduce((sum, res) => sum + player.hand[res], 0);
}

export function victoryPoints(player) {
  return player.settlements.size + player.cities.size * 2;
}

// ── Async ─────────────────────────────────────────────────────────────────────

export function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));