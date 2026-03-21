"use strict";

(function initCatanSaveUtils(root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.CatanSaveUtils = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCatanSaveUtils() {
  const SAVE_SCHEMA_VERSION = 1;
  const SAVE_INDEX_KEY = "catan:save-index:v1";
  const SAVE_RECORD_PREFIX = "catan:save:v1:";

  function clonePoint(point) {
    return { x: point.x, y: point.y };
  }

  function makeSaveId() {
    return `game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function saveRecordKey(saveId) {
    return `${SAVE_RECORD_PREFIX}${saveId}`;
  }

  function formatSaveTimestamp(iso) {
    if (!iso) return "unknown time";
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return iso;
    return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(parsed);
  }

  function friendlySavePhase(summary) {
    if (summary.phase === "main") return `Round ${summary.round}`;
    if (summary.phase === "setup") return "Setup";
    if (summary.phase === "gameover") return "Game Over";
    return "Pregame";
  }

  function resourceMap(resources, init = 0) {
    const out = {};
    for (const resource of resources) out[resource] = init;
    return out;
  }

  function emptyRollHistogram(diceSums) {
    const out = {};
    for (const sum of diceSums) out[sum] = 0;
    return out;
  }

  function normalizeHand(hand, resources) {
    const out = resourceMap(resources, 0);
    for (const resource of resources) {
      const count = Number(hand?.[resource] ?? 0);
      out[resource] = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    }
    return out;
  }

  function sortSaveSummaries(items) {
    return items
      .slice()
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  }

  function sameSaveSummary(a, b) {
    return (
      a.id === b.id &&
      a.createdAt === b.createdAt &&
      a.savedAt === b.savedAt &&
      a.phase === b.phase &&
      a.round === b.round &&
      a.currentPlayerName === b.currentPlayerName &&
      JSON.stringify(a.playerNames) === JSON.stringify(b.playerNames)
    );
  }

  function sanitizeSaveIndex(rawIndex, hasRecord) {
    const source = Array.isArray(rawIndex) ? rawIndex : [];
    const cleaned = [];
    const seen = new Set();
    let dirty = !Array.isArray(rawIndex);

    for (const item of source) {
      if (!item || typeof item.id !== "string" || item.id.length === 0 || seen.has(item.id)) {
        dirty = true;
        continue;
      }
      if (!hasRecord(item.id)) {
        dirty = true;
        continue;
      }
      const playerNames = Array.isArray(item.playerNames)
        ? item.playerNames.filter((name) => typeof name === "string" && name.trim().length > 0).slice(0, 4)
        : [];
      cleaned.push({
        id: item.id,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : typeof item.savedAt === "string" ? item.savedAt : "",
        savedAt: typeof item.savedAt === "string" ? item.savedAt : "",
        phase: typeof item.phase === "string" ? item.phase : "pregame",
        round: Number.isInteger(item.round) ? item.round : 1,
        currentPlayerName: typeof item.currentPlayerName === "string" ? item.currentPlayerName : "",
        playerNames,
      });
      seen.add(item.id);
    }

    const sorted = sortSaveSummaries(cleaned);
    if (!dirty && sorted.length === source.length) {
      for (let idx = 0; idx < sorted.length; idx += 1) {
        if (!sameSaveSummary(sorted[idx], source[idx])) {
          dirty = true;
          break;
        }
      }
    } else {
      dirty = true;
    }

    return { items: sorted, dirty };
  }

  function captureGameSnapshot({ state, resources, diceSums, turnTimerRemainingMs }) {
    if (state.phase === "pregame" || state.players.length === 0 || !state.geometry) return null;

    const savedAt = new Date().toISOString();
    const createdAt = state.saveCreatedAt || savedAt;
    const rollHistogram = emptyRollHistogram(diceSums);
    for (const sum of diceSums) {
      const count = Number(state.rollHistogram?.[sum] ?? 0);
      rollHistogram[sum] = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    }

    return {
      version: SAVE_SCHEMA_VERSION,
      saveId: state.currentSaveId,
      createdAt,
      savedAt,
      players: state.players.map((player) => ({
        name: player.name,
        color: player.color,
        hand: normalizeHand(player.hand, resources),
        roads: Array.from(player.roads).sort((a, b) => a - b),
        settlements: Array.from(player.settlements).sort((a, b) => a - b),
        cities: Array.from(player.cities).sort((a, b) => a - b),
      })),
      tiles: state.tiles.map((tile) => ({
        idx: tile.idx,
        q: tile.q,
        r: tile.r,
        resource: tile.resource,
        number: tile.number,
        cx: tile.cx,
        cy: tile.cy,
        corners: tile.corners.map(clonePoint),
        nodes: tile.nodes.slice(),
      })),
      nodes: state.nodes.map((node) => ({
        idx: node.idx,
        x: node.x,
        y: node.y,
        hexes: node.hexes.slice(),
        edges: Array.from(node.edges).sort((a, b) => a - b),
        owner: node.owner,
        isCity: node.isCity,
      })),
      edges: state.edges.map((edge) => ({
        idx: edge.idx,
        a: edge.a,
        b: edge.b,
        owner: edge.owner,
      })),
      geometry: { ...state.geometry },
      robberTile: state.robberTile,
      phase: state.phase,
      setup: state.setup
        ? {
            order: state.setup.order.slice(),
            turnIndex: state.setup.turnIndex,
            expecting: state.setup.expecting,
            lastSettlementNode: state.setup.lastSettlementNode,
            selectedSettlementNode: state.setup.selectedSettlementNode,
          }
        : null,
      currentPlayer: state.currentPlayer,
      round: state.round,
      hasRolled: state.hasRolled,
      diceResult: state.diceResult,
      rollHistogram,
      rollCountTotal: state.rollCountTotal,
      histogramOpen: state.histogramOpen,
      turnSeconds: state.turnSeconds,
      turnTimerRemainingMs,
      pendingRobberMove: state.pendingRobberMove,
      mode: state.pendingRobberMove ? "robber" : state.mode,
      tradeMenuOpen: state.tradeMenuOpen,
      status: state.status,
      log: state.log.slice(),
    };
  }

  function buildSaveSummary(snapshot) {
    const currentPlayer = snapshot.players[snapshot.currentPlayer];
    return {
      id: snapshot.saveId,
      createdAt: snapshot.createdAt,
      savedAt: snapshot.savedAt,
      phase: snapshot.phase,
      round: snapshot.round,
      currentPlayerName: currentPlayer ? currentPlayer.name : "",
      playerNames: snapshot.players.map((player) => player.name),
    };
  }

  function rebuildPlayerPieceSets(players, edges, nodes) {
    for (const player of players) {
      player.roads = new Set();
      player.settlements = new Set();
      player.cities = new Set();
    }
    for (const edge of edges) {
      if (Number.isInteger(edge.owner) && players[edge.owner]) players[edge.owner].roads.add(edge.idx);
    }
    for (const node of nodes) {
      if (!Number.isInteger(node.owner) || !players[node.owner]) continue;
      if (node.isCity) {
        players[node.owner].cities.add(node.idx);
      } else {
        players[node.owner].settlements.add(node.idx);
      }
    }
  }

  function deserializeSnapshot({ snapshot, resources, diceSums, playerColors, clampTurnSeconds }) {
    if (!snapshot || snapshot.version !== SAVE_SCHEMA_VERSION) return null;
    if (!Array.isArray(snapshot.players) || snapshot.players.length < 3 || snapshot.players.length > 4) return null;

    const players = snapshot.players.map((player, idx) => ({
      name: typeof player.name === "string" && player.name.trim().length > 0 ? player.name : `Player ${idx + 1}`,
      color: typeof player.color === "string" ? player.color : playerColors[idx],
      hand: normalizeHand(player.hand, resources),
      roads: new Set(Array.isArray(player.roads) ? player.roads : []),
      settlements: new Set(Array.isArray(player.settlements) ? player.settlements : []),
      cities: new Set(Array.isArray(player.cities) ? player.cities : []),
    }));

    const tiles = snapshot.tiles.map((tile, idx) => ({
      idx: Number.isInteger(tile.idx) ? tile.idx : idx,
      q: Number(tile.q),
      r: Number(tile.r),
      resource: tile.resource,
      number: tile.number === null ? null : Number(tile.number),
      cx: Number(tile.cx),
      cy: Number(tile.cy),
      corners: Array.isArray(tile.corners) ? tile.corners.map((point) => ({ x: Number(point.x), y: Number(point.y) })) : [],
      nodes: Array.isArray(tile.nodes) ? tile.nodes.slice() : [],
    }));

    const nodes = snapshot.nodes.map((node, idx) => ({
      idx: Number.isInteger(node.idx) ? node.idx : idx,
      x: Number(node.x),
      y: Number(node.y),
      hexes: Array.isArray(node.hexes) ? node.hexes.slice() : [],
      edges: new Set(Array.isArray(node.edges) ? node.edges : []),
      owner: Number.isInteger(node.owner) ? node.owner : null,
      isCity: node.isCity === true,
    }));

    const edges = snapshot.edges.map((edge, idx) => ({
      idx: Number.isInteger(edge.idx) ? edge.idx : idx,
      a: Number(edge.a),
      b: Number(edge.b),
      owner: Number.isInteger(edge.owner) ? edge.owner : null,
    }));

    const rollHistogram = emptyRollHistogram(diceSums);
    for (const sum of diceSums) {
      const count = Number(snapshot.rollHistogram?.[sum] ?? 0);
      rollHistogram[sum] = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    }

    const restored = {
      players,
      tiles,
      nodes,
      edges,
      geometry: snapshot.geometry ? { ...snapshot.geometry } : null,
      robberTile: Number.isInteger(snapshot.robberTile) ? snapshot.robberTile : -1,
      phase:
        snapshot.phase === "setup" ||
        snapshot.phase === "main" ||
        snapshot.phase === "gameover" ||
        snapshot.phase === "pregame"
          ? snapshot.phase
          : "pregame",
      setup: snapshot.setup
        ? {
            order: Array.isArray(snapshot.setup.order) ? snapshot.setup.order.slice() : [],
            turnIndex: Number.isInteger(snapshot.setup.turnIndex) ? snapshot.setup.turnIndex : 0,
            expecting: snapshot.setup.expecting === "road" ? "road" : "settlement",
            lastSettlementNode: Number.isInteger(snapshot.setup.lastSettlementNode) ? snapshot.setup.lastSettlementNode : null,
            selectedSettlementNode: Number.isInteger(snapshot.setup.selectedSettlementNode)
              ? snapshot.setup.selectedSettlementNode
              : null,
          }
        : null,
      currentPlayer:
        Number.isInteger(snapshot.currentPlayer) && snapshot.currentPlayer >= 0 && snapshot.currentPlayer < players.length
          ? snapshot.currentPlayer
          : 0,
      round: Number.isInteger(snapshot.round) ? snapshot.round : 1,
      hasRolled: snapshot.hasRolled === true,
      diceResult: Number.isInteger(snapshot.diceResult) ? snapshot.diceResult : null,
      isRollingDice: false,
      rollingDiceValue: null,
      rollResultPopupValue: null,
      rollHistogram,
      rollCountTotal: Number.isInteger(snapshot.rollCountTotal)
        ? snapshot.rollCountTotal
        : diceSums.reduce((total, sum) => total + rollHistogram[sum], 0),
      histogramOpen: snapshot.histogramOpen === true,
      turnSeconds: clampTurnSeconds(snapshot.turnSeconds),
      turnTimerActive: false,
      turnTimerEndMs: 0,
      turnTimerRemainingMs: Number.isFinite(Number(snapshot.turnTimerRemainingMs))
        ? Math.max(0, Number(snapshot.turnTimerRemainingMs))
        : clampTurnSeconds(snapshot.turnSeconds) * 1000,
      turnTimeoutBusy: false,
      pendingRobberMove: snapshot.pendingRobberMove === true,
      mode: "none",
      tradeMenuOpen: snapshot.tradeMenuOpen === true && snapshot.phase === "main",
      status: typeof snapshot.status === "string" && snapshot.status.length > 0 ? snapshot.status : "Game resumed.",
      log: Array.isArray(snapshot.log) ? snapshot.log.filter((line) => typeof line === "string").slice(0, 16) : [],
      currentSaveId: typeof snapshot.saveId === "string" && snapshot.saveId.length > 0 ? snapshot.saveId : makeSaveId(),
      saveCreatedAt:
        typeof snapshot.createdAt === "string" && snapshot.createdAt.length > 0
          ? snapshot.createdAt
          : typeof snapshot.savedAt === "string"
          ? snapshot.savedAt
          : new Date().toISOString(),
      lastSaveAt: typeof snapshot.savedAt === "string" ? snapshot.savedAt : null,
    };

    restored.mode =
      restored.pendingRobberMove
        ? "robber"
        : snapshot.mode === "road" || snapshot.mode === "settlement" || snapshot.mode === "city" || snapshot.mode === "none"
        ? snapshot.mode
        : "none";

    rebuildPlayerPieceSets(players, edges, nodes);
    return restored;
  }

  return {
    SAVE_SCHEMA_VERSION,
    SAVE_INDEX_KEY,
    SAVE_RECORD_PREFIX,
    emptyRollHistogram,
    normalizeHand,
    makeSaveId,
    saveRecordKey,
    formatSaveTimestamp,
    friendlySavePhase,
    sortSaveSummaries,
    sanitizeSaveIndex,
    captureGameSnapshot,
    buildSaveSummary,
    deserializeSnapshot,
  };
});
