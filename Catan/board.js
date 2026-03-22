// board.js — Board generation: hex layout, node/edge construction, number placement

"use strict";

import {
  RESOURCES, RESOURCE_COUNTS, NUMBER_TOKENS, HIGH_PROBABILITY_NUMBERS,
  HEX_NEIGHBOR_DIRS, BOARD_RADIUS, HEX_SIZE, BOARD_PADDING,
} from "./constants.js";
import { shuffle, randomChoice } from "./utils.js";

// ── Geometry helpers ──────────────────────────────────────────────────────────

export function axialHexes(radius) {
  const coords = [];
  for (let q = -radius; q <= radius; q += 1) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r += 1) coords.push({ q, r });
  }
  return coords;
}

export function hexCenter(q, r) {
  return {
    x: Math.sqrt(3) * HEX_SIZE * (q + r / 2),
    y: 1.5 * HEX_SIZE * r,
  };
}

export function pointKey(x, y) {
  return `${Math.round(x * 1000)}:${Math.round(y * 1000)}`;
}

function coordKey(q, r) {
  return `${q}:${r}`;
}

// ── Number token placement (backtracking, no adjacent 6/8) ────────────────────

function buildTileAdjacency(coords) {
  const byCoord = new Map();
  coords.forEach((coord, idx) => byCoord.set(coordKey(coord.q, coord.r), idx));

  return coords.map((coord) => {
    const out = [];
    for (const [dq, dr] of HEX_NEIGHBOR_DIRS) {
      const neighbor = byCoord.get(coordKey(coord.q + dq, coord.r + dr));
      if (neighbor !== undefined) out.push(neighbor);
    }
    return out;
  });
}

export function assignNumbersWithConstraints(coords, resourcesByTile) {
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

  // Attempt high-degree tiles first to reduce backtracking
  const order = nonDesertTiles.slice().sort((a, b) => {
    const diff = adjacency[b].length - adjacency[a].length;
    return diff !== 0 ? diff : (Math.random() < 0.5 ? -1 : 1);
  });

  function canPlace(tileIdx, number) {
    if (!HIGH_PROBABILITY_NUMBERS.has(number)) return true;
    return adjacency[tileIdx].every((nbr) => {
      const n = assigned[nbr];
      return n === null || !HIGH_PROBABILITY_NUMBERS.has(n);
    });
  }

  function backtrack(pos) {
    if (pos >= order.length) return true;
    const tileIdx = order[pos];
    const choices = shuffle(distinctNumbers.filter((n) => remaining[n] > 0));
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

// ── Full board construction ───────────────────────────────────────────────────

/**
 * Build a complete randomised board.
 * Returns { tiles, nodes, edges, robberTile, geometry }.
 */
export function buildBoard() {
  const coords = shuffle(axialHexes(BOARD_RADIUS));

  const resources = [];
  for (const [res, count] of Object.entries(RESOURCE_COUNTS)) {
    for (let i = 0; i < count; i += 1) resources.push(res);
  }
  const shuffledResources = shuffle(resources);
  const numbersByTile = assignNumbersWithConstraints(coords, shuffledResources);

  const tiles = [];
  const nodes = [];
  const edges = [];
  let robberTile = -1;

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
        const nodeIdx = nodes.length;
        nodeByPoint.set(key, nodeIdx);
        nodes.push({ idx: nodeIdx, x, y, hexes: [], edges: new Set(), owner: null, isCity: false });
      }
      const nodeIdx = nodeByPoint.get(key);
      nodeIds.push(nodeIdx);
      nodes[nodeIdx].hexes.push(i);
    }

    tiles.push({ idx: i, q, r, resource, number, cx: center.x, cy: center.y, corners, nodes: nodeIds });
    if (resource === "desert") robberTile = i;

    for (let c = 0; c < 6; c += 1) {
      const a = nodeIds[c];
      const b = nodeIds[(c + 1) % 6];
      const pair = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!edgeByPair.has(pair)) {
        const edgeIdx = edges.length;
        edgeByPair.set(pair, edgeIdx);
        edges.push({ idx: edgeIdx, a: Math.min(a, b), b: Math.max(a, b), owner: null });
        nodes[a].edges.add(edgeIdx);
        nodes[b].edges.add(edgeIdx);
      }
    }
  }

  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const geometry = {
    minX,
    minY,
    width:  Math.max(...xs) - minX + BOARD_PADDING * 2,
    height: Math.max(...ys) - minY + BOARD_PADDING * 2,
  };

  return { tiles, nodes, edges, robberTile, geometry };