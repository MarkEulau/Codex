// game.js — Rules engine: placement validation, building, trading, robber, victory

"use strict";

import { RESOURCES, COST } from "./constants.js";
import {
  canAfford, payCost, addResources, resourceCount, victoryPoints,
  resourceMap, randomChoice,
} from "./utils.js";

// ── Graph helpers ─────────────────────────────────────────────────────────────

export function nodeNeighbors(state, nodeIdx) {
  const node = state.nodes[nodeIdx];
  const out = new Set();
  for (const edgeIdx of node.edges) {
    const edge = state.edges[edgeIdx];
    out.add(edge.a === nodeIdx ? edge.b : edge.a);
  }
  return out;
}

function distanceRuleOk(state, nodeIdx) {
  for (const nbr of nodeNeighbors(state, nodeIdx)) {
    if (state.nodes[nbr].owner !== null) return false;
  }
  return true;
}

function hasConnectedRoad(state, playerIdx, nodeIdx) {
  for (const edgeIdx of state.nodes[nodeIdx].edges) {
    if (state.edges[edgeIdx].owner === playerIdx) return true;
  }
  return false;
}

// ── Placement validation ──────────────────────────────────────────────────────

export function canBuildRoad(state, playerIdx, edgeIdx, setupNode = null) {
  if (edgeIdx < 0 || edgeIdx >= state.edges.length) return { ok: false, reason: "Invalid edge." };
  const edge = state.edges[edgeIdx];
  if (edge.owner !== null) return { ok: false, reason: "Road already exists there." };

  if (setupNode !== null) {
    return (edge.a === setupNode || edge.b === setupNode)
      ? { ok: true }
      : { ok: false, reason: "Setup road must touch your new settlement." };
  }

  for (const nIdx of [edge.a, edge.b]) {
    const node = state.nodes[nIdx];
    if (node.owner === playerIdx) return { ok: true };
    for (const eidx of node.edges) {
      if (state.edges[eidx].owner === playerIdx) return { ok: true };
    }
  }
  return { ok: false, reason: "Road must connect to your road or building." };
}

export function canBuildSettlement(state, playerIdx, nodeIdx, setup = false) {
  if (nodeIdx < 0 || nodeIdx >= state.nodes.length) return { ok: false, reason: "Invalid node." };
  const node = state.nodes[nodeIdx];
  if (node.owner !== null) return { ok: false, reason: "That corner is already occupied." };
  if (!distanceRuleOk(state, nodeIdx)) return { ok: false, reason: "Distance rule violation." };
  if (!setup && !hasConnectedRoad(state, playerIdx, nodeIdx)) {
    return { ok: false, reason: "Settlement must connect to one of your roads." };
  }
  return { ok: true };
}

export function canBuildCity(state, playerIdx, nodeIdx) {
  if (nodeIdx < 0 || nodeIdx >= state.nodes.length) return { ok: false, reason: "Invalid node." };
  const node = state.nodes[nodeIdx];
  if (node.owner !== playerIdx) return { ok: false, reason: "You do not own this settlement." };
  if (node.isCity) return { ok: false, reason: "That is already a city." };
  return { ok: true };
}

// ── Build actions ─────────────────────────────────────────────────────────────

export function buildRoad(state, playerIdx, edgeIdx, options = {}) {
  const verdict = canBuildRoad(state, playerIdx, edgeIdx, options.setupNode ?? null);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  const player = state.players[playerIdx];
  if (!options.free) {
    if (!canAfford(player, COST.road)) return { ok: false, reason: "Not enough resources for road." };
    payCost(player, COST.road);
  }
  state.edges[edgeIdx].owner = playerIdx;
  player.roads.add(edgeIdx);
  return { ok: true, message: `${player.name} built road on edge ${edgeIdx}.` };
}

export function buildSettlement(state, playerIdx, nodeIdx, options = {}) {
  const verdict = canBuildSettlement(state, playerIdx, nodeIdx, options.setup ?? false);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  const player = state.players[playerIdx];
  if (!options.free) {
    if (!canAfford(player, COST.settlement)) return { ok: false, reason: "Not enough resources for settlement." };
    payCost(player, COST.settlement);
  }
  const node = state.nodes[nodeIdx];
  node.owner = playerIdx;
  node.isCity = false;
  player.settlements.add(nodeIdx);
  return { ok: true, message: `${player.name} built settlement on node ${nodeIdx}.` };
}

export function buildCity(state, playerIdx, nodeIdx) {
  const verdict = canBuildCity(state, playerIdx, nodeIdx);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  const player = state.players[playerIdx];
  if (!canAfford(player, COST.city)) return { ok: false, reason: "Not enough resources for city." };
  payCost(player, COST.city);
  const node = state.nodes[nodeIdx];
  node.isCity = true;
  player.settlements.delete(nodeIdx);
  player.cities.add(nodeIdx);
  return { ok: true, message: `${player.name} upgraded node ${nodeIdx} to a city.` };
}

// ── Resources ─────────────────────────────────────────────────────────────────

export function gainStartingResources(state, playerIdx, nodeIdx) {
  const player = state.players[playerIdx];
  const gains = resourceMap(0);
  for (const tileIdx of state.nodes[nodeIdx].hexes) {
    const tile = state.tiles[tileIdx];
    if (tile.resource !== "desert") gains[tile.resource] += 1;
  }
  addResources(player, gains);
}

export function distributeResources(state, roll) {
  const gains = state.players.map(() => resourceMap(0));

  for (const tile of state.tiles) {
    if (tile.resource === "desert" || tile.idx === state.robberTile || tile.number !== roll) continue;
    for (const nodeIdx of tile.nodes) {
      const node = state.nodes[nodeIdx];
      if (node.owner === null) continue;
      gains[node.owner][tile.resource] += node.isCity ? 2 : 1;
    }
  }

  state.players.forEach((player, idx) => addResources(player, gains[idx]));

  const summary = state.players
    .map((p, idx) => {
      const parts = RESOURCES.filter((res) => gains[idx][res] > 0).map((res) => `${gains[idx][res]} ${res}`);
      return parts.length ? `${p.name}: ${parts.join(", ")}` : null;
    })
    .filter(Boolean);

  return {
    summary,
    logMessage: summary.length
      ? `Production on ${roll}: ${summary.join(" | ")}`
      : `Production on ${roll}: no resources generated.`,
  };
}

// ── Robber ────────────────────────────────────────────────────────────────────

export function stealRandomResource(state, fromIdx, toIdx) {
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

export function robberVictims(state, playerIdx, tileIdx) {
  const victims = new Set();
  for (const nodeIdx of state.tiles[tileIdx].nodes) {
    const owner = state.nodes[nodeIdx].owner;
    if (owner !== null && owner !== playerIdx && resourceCount(state.players[owner]) > 0) {
      victims.add(owner);
    }
  }
  return Array.from(victims);
}

export function discardRandomResources(state, playerIdx, amount) {
  const player = state.players[playerIdx];
  for (let i = 0; i < amount; i += 1) {
    const options = RESOURCES.filter((res) => player.hand[res] > 0);
    const picked = randomChoice(options);
    if (!picked) break;
    player.hand[picked] -= 1;
  }
}

export function autoMoveRobber(state, playerIdx) {
  const tileChoices = state.tiles.map((t) => t.idx).filter((idx) => idx !== state.robberTile);
  const newTile = randomChoice(tileChoices);
  if (newTile == null) return { logMessage: `${state.players[playerIdx].name} moved robber (no tiles).` };
  state.robberTile = newTile;

  const victims = robberVictims(state, playerIdx, newTile);
  const victimIdx = randomChoice(victims);
  if (victimIdx != null) {
    const stolen = stealRandomResource(state, victimIdx, playerIdx);
    if (stolen) {
      return {
        logMessage: `${state.players[playerIdx].name} stole ${stolen} from ${state.players[victimIdx].name} (auto).`,
      };
    }
  }
  return { logMessage: `${state.players[playerIdx].name} moved robber (auto, no victim).` };
}

// ── Victory ───────────────────────────────────────────────────────────────────

export function checkVictory(state, playerIdx) {
  return victoryPoints(state.players[playerIdx]) >= 10;
}

// ── Turn evaluation helpers ───────────────────────────────────────────────────

export function hasAnyBuildByResources(player) {
  return canAfford(player, COST.road) || canAfford(player, COST.settlement) || canAfford(player, COST.city);
}

export function hasBankTradeOption(player) {
  return RESOURCES.some((res) => player.hand[res] >= 4);
}

export function hasPlayerTradeOption(state, playerIdx) {
  const player = state.players[playerIdx];
  if (!player || resourceCount(player) === 0) return false;
  return state.players.some((p, idx) => idx !== playerIdx && resourceCount(p) > 0);
}

export function setupRoadOptionsForNode(state, playerIdx, nodeIdx) {
  const node = state.nodes[nodeIdx];
  if (!node) return [];
  return [...node.edges].filter((edgeIdx) => canBuildRoad(state, playerIdx, edgeIdx, nodeIdx).ok);