"use strict";

const RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"];
const RESOURCE_COUNTS = {
  wood: 4,
  brick: 3,
  sheep: 4,
  wheat: 4,
  ore: 3,
  desert: 1,
};
const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const COST = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
};
const PLAYER_COLORS = ["#b93b2a", "#2b66be", "#d49419", "#2f8852"];
const HIGH_PROBABILITY_NUMBERS = new Set([6, 8]);
const HEX_NEIGHBOR_DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const BOARD_RADIUS = 2;
const HEX_SIZE = 74;
const BOARD_PADDING = 36;
const SVG_NS = "http://www.w3.org/2000/svg";

const state = {
  players: [],
  tiles: [],
  nodes: [],
  edges: [],
  geometry: null,
  robberTile: -1,

  phase: "pregame", // pregame | setup | main | gameover
  setup: null,
  currentPlayer: 0,
  round: 1,
  hasRolled: false,
  diceResult: null,
  pendingRobberMove: false,
  mode: "none", // none | road | settlement | city | robber
  status: "Set players and start.",
  log: [],
};

const refs = {
  board: document.getElementById("board"),
  setupFields: document.getElementById("setupFields"),
  playerCount: document.getElementById("playerCount"),
  nameInputs: document.getElementById("nameInputs"),
  startBtn: document.getElementById("startBtn"),
  restartBtn: document.getElementById("restartBtn"),
  rollBtn: document.getElementById("rollBtn"),
  endTurnBtn: document.getElementById("endTurnBtn"),
  tradeBtn: document.getElementById("tradeBtn"),
  tradeGive: document.getElementById("tradeGive"),
  tradeGet: document.getElementById("tradeGet"),
  p2pTradeBtn: document.getElementById("p2pTradeBtn"),
  p2pTarget: document.getElementById("p2pTarget"),
  p2pGive: document.getElementById("p2pGive"),
  p2pGiveAmount: document.getElementById("p2pGiveAmount"),
  p2pGet: document.getElementById("p2pGet"),
  p2pGetAmount: document.getElementById("p2pGetAmount"),
  phaseLabel: document.getElementById("phaseLabel"),
  currentPlayerLabel: document.getElementById("currentPlayerLabel"),
  diceLabel: document.getElementById("diceLabel"),
  statusText: document.getElementById("statusText"),
  tableStats: document.getElementById("tableStats"),
  buildPanel: document.getElementById("buildPanel"),
  logList: document.getElementById("logList"),
  modeButtons: Array.from(document.querySelectorAll(".mode-btn")),
  actionModal: document.getElementById("actionModal"),
  actionModalTitle: document.getElementById("actionModalTitle"),
  actionModalText: document.getElementById("actionModalText"),
  actionModalOptions: document.getElementById("actionModalOptions"),
  actionModalCancelBtn: document.getElementById("actionModalCancelBtn"),
};

let actionModalResolver = null;

function resourceMap(init = 0) {
  const out = {};
  for (const res of RESOURCES) out[res] = init;
  return out;
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

function assignNumbersWithConstraints(coords, resourcesByTile) {
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

function parsePositiveInt(raw) {
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 1) return null;
  return num;
}

function updateSetupCardVisibility() {
  const gameStarted = state.phase !== "pregame";
  refs.setupFields.classList.toggle("hidden", gameStarted);
  refs.startBtn.classList.toggle("hidden", gameStarted);
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

function showActionModal({ title, text, options, allowCancel = false }) {
  if (actionModalResolver) closeActionModal(null);

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

function currentPlayerObj() {
  return state.players[state.currentPlayer];
}

function victoryPoints(player) {
  return player.settlements.size + player.cities.size * 2;
}

function resourceCount(player) {
  return RESOURCES.reduce((sum, res) => sum + player.hand[res], 0);
}

function canAfford(player, cost) {
  return Object.entries(cost).every(([res, amt]) => player.hand[res] >= amt);
}

function affordableBuildCount(player, cost) {
  return Math.min(...Object.entries(cost).map(([res, amt]) => Math.floor(player.hand[res] / amt)));
}

function missingCostSummary(player, cost) {
  const missing = [];
  for (const [res, amt] of Object.entries(cost)) {
    const gap = amt - player.hand[res];
    if (gap > 0) missing.push(`${gap} ${res}`);
  }
  return missing.join(", ");
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

function canBuildRoad(playerIdx, edgeIdx, setupNode = null) {
  if (edgeIdx < 0 || edgeIdx >= state.edges.length) return { ok: false, reason: "Invalid edge." };
  const edge = state.edges[edgeIdx];
  if (edge.owner !== null) return { ok: false, reason: "Road already exists there." };

  if (setupNode !== null) {
    if (edge.a === setupNode || edge.b === setupNode) return { ok: true };
    return { ok: false, reason: "Setup road must touch your new settlement." };
  }

  const endpoints = [edge.a, edge.b];
  for (const nodeIdx of endpoints) {
    const node = state.nodes[nodeIdx];
    if (node.owner === playerIdx) return { ok: true };
    for (const otherEdgeIdx of node.edges) {
      if (state.edges[otherEdgeIdx].owner === playerIdx) return { ok: true };
    }
  }
  return { ok: false, reason: "Road must connect to your road or building." };
}

function canBuildSettlement(playerIdx, nodeIdx, setup = false) {
  if (nodeIdx < 0 || nodeIdx >= state.nodes.length) return { ok: false, reason: "Invalid node." };
  const node = state.nodes[nodeIdx];
  if (node.owner !== null) return { ok: false, reason: "That corner is already occupied." };
  if (!distanceRuleOk(nodeIdx)) return { ok: false, reason: "Distance rule violation." };
  if (!setup && !hasConnectedRoad(playerIdx, nodeIdx)) {
    return { ok: false, reason: "Settlement must connect to one of your roads." };
  }
  return { ok: true };
}

function canBuildCity(playerIdx, nodeIdx) {
  if (nodeIdx < 0 || nodeIdx >= state.nodes.length) return { ok: false, reason: "Invalid node." };
  const node = state.nodes[nodeIdx];
  if (node.owner !== playerIdx) return { ok: false, reason: "You do not own this settlement." };
  if (node.isCity) return { ok: false, reason: "That is already a city." };
  return { ok: true };
}

function checkVictory(playerIdx) {
  const player = state.players[playerIdx];
  if (victoryPoints(player) < 10) return false;
  state.phase = "gameover";
  state.pendingRobberMove = false;
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
    if (!canAfford(player, COST.road)) {
      setStatus("Not enough resources for road.");
      return false;
    }
    payCost(player, COST.road);
  }
  state.edges[edgeIdx].owner = playerIdx;
  player.roads.add(edgeIdx);
  logEvent(`${player.name} built a road.`);
  setStatus(`${player.name} built road on edge ${edgeIdx}.`);
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
  }
  const node = state.nodes[nodeIdx];
  node.owner = playerIdx;
  node.isCity = false;
  player.settlements.add(nodeIdx);
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
  const node = state.nodes[nodeIdx];
  node.isCity = true;
  player.settlements.delete(nodeIdx);
  player.cities.add(nodeIdx);
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
  addResources(player, gains);
}

function distributeResources(roll) {
  const gains = state.players.map(() => resourceMap(0));

  for (const tile of state.tiles) {
    if (tile.resource === "desert") continue;
    if (tile.idx === state.robberTile) continue;
    if (tile.number !== roll) continue;

    for (const nodeIdx of tile.nodes) {
      const node = state.nodes[nodeIdx];
      if (node.owner === null) continue;
      gains[node.owner][tile.resource] += node.isCity ? 2 : 1;
    }
  }

  for (let i = 0; i < state.players.length; i += 1) addResources(state.players[i], gains[i]);

  const summary = state.players
    .map((p, idx) => {
      const parts = RESOURCES.filter((res) => gains[idx][res] > 0).map((res) => `${gains[idx][res]} ${res}`);
      return parts.length > 0 ? `${p.name}: ${parts.join(", ")}` : null;
    })
    .filter(Boolean);

  if (summary.length > 0) {
    logEvent(`Production on ${roll}: ${summary.join(" | ")}`);
    setStatus(`Resources distributed for roll ${roll}.`);
  } else {
    logEvent(`Production on ${roll}: no resources generated.`);
    setStatus(`No resources generated on roll ${roll}.`);
  }
}

async function chooseDiscardResource(player, toDiscard) {
  let remaining = toDiscard;
  while (remaining > 0) {
    const options = RESOURCES.filter((res) => player.hand[res] > 0).map((res) => ({
      label: `${res[0].toUpperCase() + res.slice(1)} (${player.hand[res]})`,
      value: res,
    }));
    const picked = await showActionModal({
      title: `${player.name} Must Discard`,
      text: `Choose ${remaining} more card(s) to discard.`,
      options,
    });
    if (!picked) continue;
    player.hand[picked] -= 1;
    remaining -= 1;
    render();
  }
}

async function handleRollSeven() {
  for (const player of state.players) {
    const total = resourceCount(player);
    if (total <= 7) continue;
    const toDiscard = Math.floor(total / 2);
    await chooseDiscardResource(player, toDiscard);
    logEvent(`${player.name} discarded ${toDiscard} card(s).`);
  }
  state.pendingRobberMove = true;
  state.mode = "robber";
  setStatus("Rolled 7: click a tile to move the robber.");
}

async function pickVictim(victims) {
  if (victims.length === 1) return victims[0];
  while (true) {
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
  return true;
}

function startMainPhase() {
  state.phase = "main";
  state.currentPlayer = 0;
  state.hasRolled = false;
  state.pendingRobberMove = false;
  state.mode = "none";
  state.setup = null;
  setStatus(`${currentPlayerObj().name}'s turn. Roll dice.`);
  logEvent("Setup complete. Main game begins.");
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
  setStatus(`${currentPlayerObj().name}: place settlement.`);
}

function beginSetup(players) {
  const order = [...Array(players.length).keys()];
  state.setup = {
    order: order.concat(order.slice().reverse()),
    turnIndex: 0,
    expecting: "settlement",
    lastSettlementNode: null,
  };
  state.phase = "setup";
  state.currentPlayer = state.setup.order[0];
  state.round = 1;
  state.hasRolled = false;
  state.pendingRobberMove = false;
  state.diceResult = null;
  state.mode = "none";
  setStatus(`${currentPlayerObj().name}: place settlement.`);
  logEvent("Setup started.");
}

function startGame() {
  const playerCount = Number(refs.playerCount.value);
  const names = [];
  const inputs = refs.nameInputs.querySelectorAll("input");
  for (let i = 0; i < playerCount; i += 1) {
    const name = (inputs[i]?.value || "").trim() || `Player ${i + 1}`;
    names.push(name);
  }

  state.players = names.map((name, idx) => ({
    name,
    color: PLAYER_COLORS[idx],
    hand: resourceMap(0),
    roads: new Set(),
    settlements: new Set(),
    cities: new Set(),
  }));

  buildBoard();
  state.log = [];
  logEvent(`New game: ${names.join(", ")}.`);
  beginSetup(state.players);
  render();
}

function restartGame() {
  if (state.phase === "pregame") return;
  const confirmed = window.confirm("Restart the current game? All progress will be lost.");
  if (!confirmed) return;

  if (actionModalResolver) closeActionModal(null);

  const existingNames = state.players.map((player) => player.name);
  if (existingNames.length >= 3 && existingNames.length <= 4) {
    refs.playerCount.value = String(existingNames.length);
    createNameInputs();
    const inputs = refs.nameInputs.querySelectorAll("input");
    existingNames.forEach((name, idx) => {
      if (inputs[idx]) inputs[idx].value = name;
    });
  }

  startGame();
}

function buildBoard() {
  const coords = shuffle(axialHexes(BOARD_RADIUS));

  const resources = [];
  for (const [res, count] of Object.entries(RESOURCE_COUNTS)) {
    for (let i = 0; i < count; i += 1) resources.push(res);
  }
  const shuffledResources = shuffle(resources);
  const numbersByTile = assignNumbersWithConstraints(coords, shuffledResources);

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

function appendResourceIcon(layer, tile) {
  const g = el("g", {
    class: "resource-icon",
    transform: `translate(${sx(tile.cx)} ${sy(tile.cy) - 35})`,
  });
  appendResourceIconShapes(g, tile.resource);

  layer.appendChild(g);
}

function isClickableNode(nodeIdx) {
  if (state.phase === "setup") {
    const setup = state.setup;
    if (!setup || setup.expecting !== "settlement") return false;
    return canBuildSettlement(state.currentPlayer, nodeIdx, true).ok;
  }
  if (state.phase !== "main" || state.phase === "gameover") return false;
  if (!state.hasRolled || state.pendingRobberMove) return false;
  if (state.mode === "settlement") return canBuildSettlement(state.currentPlayer, nodeIdx, false).ok;
  if (state.mode === "city") return canBuildCity(state.currentPlayer, nodeIdx).ok;
  return false;
}

function isClickableEdge(edgeIdx) {
  if (state.phase === "setup") {
    const setup = state.setup;
    if (!setup || setup.expecting !== "road" || setup.lastSettlementNode === null) return false;
    return canBuildRoad(state.currentPlayer, edgeIdx, setup.lastSettlementNode).ok;
  }
  if (state.phase !== "main" || state.phase === "gameover") return false;
  if (!state.hasRolled || state.pendingRobberMove || state.mode !== "road") return false;
  return canBuildRoad(state.currentPlayer, edgeIdx).ok;
}

function isClickableTile(tileIdx) {
  if (state.phase !== "main" || state.phase === "gameover") return false;
  if (!(state.pendingRobberMove || state.mode === "robber")) return false;
  return tileIdx !== state.robberTile;
}

function onNodeClick(nodeIdx) {
  if (state.phase === "setup") {
    const setup = state.setup;
    if (!setup || setup.expecting !== "settlement") return;
    if (buildSettlement(state.currentPlayer, nodeIdx, { free: true, setup: true })) {
      setup.expecting = "road";
      setup.lastSettlementNode = nodeIdx;
      setStatus(`${currentPlayerObj().name}: place adjacent road.`);
    }
    render();
    return;
  }

  if (state.phase !== "main") return;
  if (!state.hasRolled) {
    setStatus("Roll dice first.");
    render();
    return;
  }
  if (state.pendingRobberMove) {
    setStatus("Move robber first.");
    render();
    return;
  }

  if (state.mode === "settlement") {
    buildSettlement(state.currentPlayer, nodeIdx);
  } else if (state.mode === "city") {
    buildCity(state.currentPlayer, nodeIdx);
  }
  render();
}

function onEdgeClick(edgeIdx) {
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
    }
    render();
    return;
  }

  if (state.phase !== "main" || state.mode !== "road") return;
  if (!state.hasRolled) {
    setStatus("Roll dice first.");
    render();
    return;
  }
  if (state.pendingRobberMove) {
    setStatus("Move robber first.");
    render();
    return;
  }
  buildRoad(state.currentPlayer, edgeIdx);
  render();
}

async function onTileClick(tileIdx) {
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
  const edgeLayer = el("g");
  const nodeLayer = el("g");
  const overlayLayer = el("g");

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
    if (node.owner === null) {
      const circle = el("circle", {
        cx: sx(node.x),
        cy: sy(node.y),
        r: 6,
        class: `node node-empty ${clickable ? "clickable" : ""}`,
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

    const nameRow = document.createElement("div");
    nameRow.className = "player-name";
    nameRow.innerHTML = `<span>${player.name}</span><span class="player-color" style="background:${player.color}"></span>`;
    card.appendChild(nameRow);

    const vp = document.createElement("div");
    vp.className = "resource-row";
    vp.textContent = `VP ${victoryPoints(player)} | Roads ${player.roads.size} | Settlements ${player.settlements.size} | Cities ${player.cities.size}`;
    card.appendChild(vp);

    const resources = document.createElement("div");
    resources.className = "resource-strip";
    RESOURCES.forEach((resource) => {
      const chip = document.createElement("div");
      chip.className = "resource-chip";
      chip.title = `${resource}: ${player.hand[resource]}`;

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

    grid.appendChild(card);
  });

  refs.tableStats.appendChild(grid);
}

function renderBuildPanel() {
  refs.buildPanel.innerHTML = "";
  if (state.players.length === 0) {
    refs.buildPanel.textContent = "Start a game to see build options.";
    return;
  }

  const player = currentPlayerObj();
  const wrap = document.createElement("div");
  wrap.className = "build-grid";

  const title = document.createElement("div");
  title.className = "build-title";
  title.textContent = `Current Build Options (${player.name})`;
  wrap.appendChild(title);

  const entries = [
    { label: "Road", cost: COST.road },
    { label: "Settlement", cost: COST.settlement },
    { label: "City", cost: COST.city },
  ];

  entries.forEach((entry) => {
    const canBuild = canAfford(player, entry.cost);
    const chip = document.createElement("div");
    chip.className = `build-chip ${canBuild ? "ok" : "locked"}`;
    const count = affordableBuildCount(player, entry.cost);
    if (canBuild) {
      chip.textContent = `${entry.label}: yes (${count} now)`;
    } else {
      chip.textContent = `${entry.label}: need ${missingCostSummary(player, entry.cost)}`;
    }
    wrap.appendChild(chip);
  });

  const tradeable = RESOURCES.filter((res) => player.hand[res] >= 4);
  const bankTrade = document.createElement("div");
  bankTrade.className = `build-chip ${tradeable.length > 0 ? "ok" : "locked"}`;
  bankTrade.textContent =
    tradeable.length > 0
      ? `Bank Trade: yes (${tradeable.join(", ")})`
      : "Bank Trade: need 4 of one resource";
  wrap.appendChild(bankTrade);

  refs.buildPanel.appendChild(wrap);
}

function renderLog() {
  refs.logList.innerHTML = "";
  for (const line of state.log) {
    const li = document.createElement("li");
    li.textContent = line;
    refs.logList.appendChild(li);
  }
}

function renderControls() {
  updateSetupCardVisibility();
  refreshPlayerTradeTargets();
  refs.phaseLabel.textContent = phaseLabel();
  refs.currentPlayerLabel.textContent =
    state.players.length > 0 ? `${currentPlayerObj().name}${state.phase === "setup" ? " (setup)" : ""}` : "-";
  refs.diceLabel.textContent = state.diceResult !== null ? String(state.diceResult) : "-";
  refs.statusText.textContent = state.status;

  const canRoll = state.phase === "main" && !state.hasRolled && state.phase !== "gameover";
  refs.rollBtn.disabled = !canRoll;

  const canEndTurn =
    state.phase === "main" && state.hasRolled && !state.pendingRobberMove && state.phase !== "gameover";
  refs.endTurnBtn.disabled = !canEndTurn;

  const canTrade = state.phase === "main" && state.hasRolled && !state.pendingRobberMove && state.phase !== "gameover";
  refs.tradeBtn.disabled = !canTrade;
  refs.p2pTradeBtn.disabled = !canTrade || refs.p2pTarget.options.length === 0;
  refs.p2pTarget.disabled = !canTrade || refs.p2pTarget.options.length === 0;
  refs.p2pGive.disabled = !canTrade;
  refs.p2pGet.disabled = !canTrade;
  refs.p2pGiveAmount.disabled = !canTrade;
  refs.p2pGetAmount.disabled = !canTrade;

  for (const btn of refs.modeButtons) {
    const mode = btn.dataset.mode;
    btn.classList.toggle("active", state.mode === mode);
    const allowed = state.phase === "main" && state.phase !== "gameover";
    btn.disabled = !allowed;
  }
}

function render() {
  renderBoard();
  renderControls();
  renderTableStats();
  renderBuildPanel();
  renderLog();
}

async function rollDice() {
  if (state.phase !== "main" || state.hasRolled) return;
  const roll = 1 + Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6);
  state.hasRolled = true;
  state.diceResult = roll;
  logEvent(`${currentPlayerObj().name} rolled ${roll}.`);
  if (roll === 7) {
    await handleRollSeven();
  } else {
    distributeResources(roll);
    setStatus(`${currentPlayerObj().name}: choose actions, then end turn.`);
  }
  render();
}

function endTurn() {
  if (state.phase !== "main" || !state.hasRolled || state.pendingRobberMove) return;
  state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
  if (state.currentPlayer === 0) state.round += 1;
  state.hasRolled = false;
  state.diceResult = null;
  state.mode = "none";
  setStatus(`${currentPlayerObj().name}: roll dice.`);
  logEvent(`Turn passed to ${currentPlayerObj().name}.`);
  render();
}

function bankTrade() {
  if (state.phase !== "main" || !state.hasRolled || state.pendingRobberMove) return;
  const player = currentPlayerObj();
  const give = refs.tradeGive.value;
  const get = refs.tradeGet.value;

  if (give === get) {
    setStatus("Choose different resources for trade.");
    render();
    return;
  }
  if (player.hand[give] < 4) {
    setStatus(`Need 4 ${give} to trade.`);
    render();
    return;
  }

  player.hand[give] -= 4;
  player.hand[get] += 1;
  logEvent(`${player.name} traded 4 ${give} for 1 ${get}.`);
  setStatus(`${player.name} traded with the bank.`);
  render();
}

function playerTrade() {
  if (state.phase !== "main" || !state.hasRolled || state.pendingRobberMove) return;
  const fromIdx = state.currentPlayer;
  const toIdx = Number(refs.p2pTarget.value);
  if (!Number.isInteger(toIdx) || toIdx < 0 || toIdx >= state.players.length || toIdx === fromIdx) {
    setStatus("Choose a valid target player.");
    render();
    return;
  }

  const giveRes = refs.p2pGive.value;
  const getRes = refs.p2pGet.value;
  const giveAmt = parsePositiveInt(refs.p2pGiveAmount.value);
  const getAmt = parsePositiveInt(refs.p2pGetAmount.value);

  if (!RESOURCES.includes(giveRes) || !RESOURCES.includes(getRes)) {
    setStatus("Choose valid resources for trade.");
    render();
    return;
  }
  if (giveAmt === null || getAmt === null) {
    setStatus("Trade amounts must be whole numbers >= 1.");
    render();
    return;
  }
  if (giveRes === getRes) {
    setStatus("Give and get resources must be different.");
    render();
    return;
  }

  const from = state.players[fromIdx];
  const to = state.players[toIdx];
  if (from.hand[giveRes] < giveAmt) {
    setStatus(`${from.name} does not have ${giveAmt} ${giveRes}.`);
    render();
    return;
  }
  if (to.hand[getRes] < getAmt) {
    setStatus(`${to.name} does not have ${getAmt} ${getRes}.`);
    render();
    return;
  }

  const accepted = window.confirm(
    `${to.name}, accept this trade?\n` +
      `${from.name} gives ${giveAmt} ${giveRes}\n` +
      `${to.name} gives ${getAmt} ${getRes}`
  );
  if (!accepted) {
    logEvent(`${to.name} declined a trade from ${from.name}.`);
    setStatus("Trade declined.");
    render();
    return;
  }

  from.hand[giveRes] -= giveAmt;
  to.hand[giveRes] += giveAmt;
  to.hand[getRes] -= getAmt;
  from.hand[getRes] += getAmt;
  logEvent(`${from.name} traded ${giveAmt} ${giveRes} for ${getAmt} ${getRes} with ${to.name}.`);
  setStatus("Trade completed.");
  render();
}

function initTradeSelectors() {
  refs.tradeGive.innerHTML = "";
  refs.tradeGet.innerHTML = "";
  refs.p2pGive.innerHTML = "";
  refs.p2pGet.innerHTML = "";
  for (const res of RESOURCES) {
    const a = document.createElement("option");
    a.value = res;
    a.textContent = res;
    refs.tradeGive.appendChild(a);

    const b = document.createElement("option");
    b.value = res;
    b.textContent = res;
    refs.tradeGet.appendChild(b);

    const c = document.createElement("option");
    c.value = res;
    c.textContent = res;
    refs.p2pGive.appendChild(c);

    const d = document.createElement("option");
    d.value = res;
    d.textContent = res;
    refs.p2pGet.appendChild(d);
  }
  refs.tradeGet.value = "ore";
  refs.p2pGet.value = "ore";
}

function refreshPlayerTradeTargets() {
  const selected = refs.p2pTarget.value;
  refs.p2pTarget.innerHTML = "";
  if (state.players.length < 2) return;

  for (let idx = 0; idx < state.players.length; idx += 1) {
    if (idx === state.currentPlayer) continue;
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
  refs.restartBtn.addEventListener("click", restartGame);
  refs.rollBtn.addEventListener("click", rollDice);
  refs.endTurnBtn.addEventListener("click", endTurn);
  refs.tradeBtn.addEventListener("click", bankTrade);
  refs.p2pTradeBtn.addEventListener("click", playerTrade);
  refs.actionModalCancelBtn.addEventListener("click", () => closeActionModal(null));
  refs.actionModal.addEventListener("click", (event) => {
    const cancelVisible = !refs.actionModalCancelBtn.classList.contains("hidden");
    if (event.target === refs.actionModal && cancelVisible) closeActionModal(null);
  });
  window.addEventListener("keydown", (event) => {
    const cancelVisible = !refs.actionModalCancelBtn.classList.contains("hidden");
    if (event.key === "Escape" && actionModalResolver && cancelVisible) closeActionModal(null);
  });

  refs.modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.phase !== "main") return;
      state.mode = btn.dataset.mode;
      if (state.pendingRobberMove) {
        state.mode = "robber";
        setStatus("Move robber first.");
      } else {
        setStatus(`Mode: ${state.mode}.`);
      }
      render();
    });
  });
}

function init() {
  createNameInputs();
  initTradeSelectors();
  bindEvents();
  render();
}

init();
