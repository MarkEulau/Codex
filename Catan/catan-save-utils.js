"use strict";

(function initCatanSaveUtils(root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.CatanSaveUtils = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCatanSaveUtils() {
  const SAVE_SCHEMA_VERSION = 2;
  const LEGACY_SAVE_SCHEMA_VERSION = 1;
  const SAVE_INDEX_KEY = "catan:save-index:v1";
  const SAVE_RECORD_PREFIX = "catan:save:v1:";

  const RESOURCE_TYPES = ["wood", "brick", "sheep", "wheat", "ore"];
  const DEV_CARD_TYPES = ["knight", "road_building", "year_of_plenty", "monopoly", "victory_point"];
  const DEFAULT_PLAYER_COLORS = ["#b93b2a", "#2b66be", "#d49419", "#2f8852", "#7b4cbf", "#9a6733"];
  const DEFAULT_PIECE_LIMITS = { road: 15, settlement: 5, city: 4 };
  const BASE_BANK_COUNTS = RESOURCE_TYPES.reduce((acc, resource) => {
    acc[resource] = 19;
    return acc;
  }, {});
  const EXTENSION_BANK_COUNTS = RESOURCE_TYPES.reduce((acc, resource) => {
    acc[resource] = 24;
    return acc;
  }, {});
  const BASE_DEV_DECK_COUNTS = {
    knight: 14,
    road_building: 2,
    year_of_plenty: 2,
    monopoly: 2,
    victory_point: 5,
  };
  const EXTENSION_DEV_DECK_COUNTS = {
    knight: 20,
    road_building: 3,
    year_of_plenty: 3,
    monopoly: 3,
    victory_point: 5,
  };
  const DEFAULT_AWARD_STATE = {
    longestRoadHolder: null,
    longestRoadLength: 0,
    largestArmyHolder: null,
    largestArmyCount: 0,
  };
  const MAIN_STEP_LABELS = {
    before_roll: "Before Roll",
    discard: "Discard",
    move_robber: "Move Robber",
    main_actions: "Actions",
    dev_card_resolution: "Dev Cards",
  };

  function cloneJson(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function clonePoint(point) {
    return { x: Number(point?.x ?? 0), y: Number(point?.y ?? 0) };
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
    if (summary.phase === "main") {
      const mainStep = typeof summary.mainStep === "string" ? summary.mainStep : "";
      const pairStep = typeof summary.pairStep === "string" ? summary.pairStep : "";
      const mainLabel = MAIN_STEP_LABELS[mainStep] || "";
      if (mainLabel) return `Round ${summary.round} - ${mainLabel}`;
      if (pairStep && pairStep !== "inactive" && pairStep !== "none") return `Round ${summary.round} - Pair Turn`;
      return `Round ${summary.round}`;
    }
    if (summary.phase === "setup") return "Setup";
    if (summary.phase === "gameover") return "Game Over";
    return "Pregame";
  }

  function resourceMap(init = 0, resources = RESOURCE_TYPES) {
    const out = {};
    for (const resource of resources) out[resource] = init;
    return out;
  }

  function createResourceMap(init = 0, resources = RESOURCE_TYPES) {
    return resourceMap(init, resources);
  }

  function emptyRollHistogram(diceSums) {
    const out = {};
    for (const sum of diceSums) out[sum] = 0;
    return out;
  }

  function normalizeHand(hand, resources) {
    const out = resourceMap(0, resources);
    for (const resource of resources) {
      const count = Number(hand?.[resource] ?? 0);
      out[resource] = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    }
    return out;
  }

  function normalizeNonNegativeInteger(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, Math.floor(num));
  }

  function normalizePlayerIndex(value) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 0) return null;
    return num;
  }

  function normalizePlayerCount(playerCount) {
    const num = Number(playerCount);
    if (!Number.isFinite(num)) return 4;
    return Math.min(6, Math.max(3, Math.floor(num)));
  }

  function normalizeIndexList(value) {
    const source = value instanceof Set || value instanceof Map ? Array.from(value.keys ? value.keys() : value.values()) : Array.isArray(value) ? value : [];
    const seen = new Set();
    const out = [];

    for (const item of source) {
      const num = Number(item);
      if (!Number.isInteger(num) || num < 0 || seen.has(num)) continue;
      seen.add(num);
      out.push(num);
    }

    out.sort((a, b) => a - b);
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
      a.mainStep === b.mainStep &&
      a.pairStep === b.pairStep &&
      a.playerCount === b.playerCount &&
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
        ? item.playerNames.filter((name) => typeof name === "string" && name.trim().length > 0).slice(0, 6)
        : [];
      cleaned.push({
        id: item.id,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : typeof item.savedAt === "string" ? item.savedAt : "",
        savedAt: typeof item.savedAt === "string" ? item.savedAt : "",
        phase: typeof item.phase === "string" ? item.phase : "pregame",
        round: Number.isInteger(item.round) ? item.round : 1,
        currentPlayerName: typeof item.currentPlayerName === "string" ? item.currentPlayerName : "",
        playerNames,
        mainStep: typeof item.mainStep === "string" ? item.mainStep : "",
        pairStep: typeof item.pairStep === "string" ? item.pairStep : "",
        playerCount: Number.isInteger(item.playerCount) ? item.playerCount : playerNames.length,
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

  function createBankForPlayerCount(playerCount = 4) {
    const counts = normalizePlayerCount(playerCount) >= 5 ? EXTENSION_BANK_COUNTS : BASE_BANK_COUNTS;
    return { ...counts };
  }

  function normalizeBank(source, playerCount = 4) {
    const defaults = createBankForPlayerCount(playerCount);
    if (!source || typeof source !== "object" || Array.isArray(source)) return defaults;

    const out = {};
    for (const resource of RESOURCE_TYPES) {
      const raw = Number(source?.[resource]);
      out[resource] = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : defaults[resource];
    }
    return out;
  }

  function createBank(initialCounts = BASE_BANK_COUNTS) {
    if (typeof initialCounts === "number") return createBankForPlayerCount(initialCounts);
    return normalizeBank(initialCounts, 4);
  }

  function createDevelopmentDeckForPlayerCount(playerCount = 4) {
    const counts = normalizePlayerCount(playerCount) >= 5 ? EXTENSION_DEV_DECK_COUNTS : BASE_DEV_DECK_COUNTS;
    const deck = [];
    for (const cardType of DEV_CARD_TYPES) {
      for (let i = 0; i < (counts[cardType] ?? 0); i += 1) deck.push(cardType);
    }
    return deck;
  }

  function normalizeDevelopmentDeck(source, playerCount = 4) {
    if (Array.isArray(source)) {
      return source.filter((cardType) => DEV_CARD_TYPES.includes(cardType));
    }
    if (source && typeof source === "object") {
      const deck = [];
      for (const cardType of DEV_CARD_TYPES) {
        const count = normalizeNonNegativeInteger(source?.[cardType], 0);
        for (let i = 0; i < count; i += 1) deck.push(cardType);
      }
      return deck;
    }
    return createDevelopmentDeckForPlayerCount(playerCount);
  }

  function createDevelopmentDeck(playerCount = 4) {
    return createDevelopmentDeckForPlayerCount(playerCount);
  }

  function normalizeDevelopmentState(source = {}) {
    const hand = resourceMap(0, DEV_CARD_TYPES);
    const boughtThisTurn = resourceMap(0, DEV_CARD_TYPES);
    const sourceHand = source.hand ?? source.playable ?? source.cards ?? source.devCards?.hand ?? source.devCards ?? {};
    const sourceBought = source.boughtThisTurn ?? source.newCards ?? source.devCards?.boughtThisTurn ?? {};

    for (const cardType of DEV_CARD_TYPES) {
      const playable = Number(sourceHand?.[cardType] ?? 0);
      const bought = Number(sourceBought?.[cardType] ?? 0);
      hand[cardType] = Number.isFinite(playable) ? Math.max(0, Math.floor(playable)) : 0;
      boughtThisTurn[cardType] = Number.isFinite(bought) ? Math.max(0, Math.floor(bought)) : 0;
    }

    return {
      hand,
      boughtThisTurn,
      playedNonVictoryThisTurn: Boolean(source.playedNonVictoryThisTurn ?? source.devCards?.playedNonVictoryThisTurn),
      playedKnights: normalizeNonNegativeInteger(source.playedKnights ?? source.devCards?.playedKnights ?? 0, 0),
      freeRoadPlacements: normalizeNonNegativeInteger(source.freeRoadPlacements ?? source.devCards?.freeRoadPlacements ?? 0, 0),
    };
  }

  function normalizeHarbors(source = []) {
    if (!Array.isArray(source)) return [];
    return source.map((harbor, idx) => {
      const raw = harbor && typeof harbor === "object" ? cloneJson(harbor) || {} : {};
      const type = typeof raw.type === "string" && raw.type.trim().length > 0 ? raw.type : typeof raw.resource === "string" && raw.resource.trim().length > 0 ? raw.resource : "generic";
      const nodes = Array.isArray(raw.nodes)
        ? raw.nodes
        : Array.isArray(raw.nodeIds)
        ? raw.nodeIds
        : Array.isArray(raw.nodeIndices)
        ? raw.nodeIndices
        : [];
      raw.idx = Number.isInteger(raw.idx) ? raw.idx : idx;
      raw.type = type;
      raw.nodes = normalizeIndexList(nodes);
      return raw;
    });
  }

  function normalizeAwards(source = {}) {
    const raw = source && typeof source === "object" ? cloneJson(source) || {} : {};
    const longestRoadSource = raw.longestRoad && typeof raw.longestRoad === "object" ? raw.longestRoad : {};
    const largestArmySource = raw.largestArmy && typeof raw.largestArmy === "object" ? raw.largestArmy : {};

    const longestRoadHolder = raw.longestRoadHolder ?? longestRoadSource.holder ?? longestRoadSource.playerIndex ?? longestRoadSource.player ?? null;
    const longestRoadLength = raw.longestRoadLength ?? longestRoadSource.length ?? longestRoadSource.count ?? longestRoadSource.size ?? 0;
    const largestArmyHolder = raw.largestArmyHolder ?? largestArmySource.holder ?? largestArmySource.playerIndex ?? largestArmySource.player ?? null;
    const largestArmyCount = raw.largestArmyCount ?? largestArmySource.count ?? largestArmySource.size ?? 0;

    raw.longestRoadHolder = normalizePlayerIndex(longestRoadHolder);
    raw.longestRoadLength = normalizeNonNegativeInteger(longestRoadLength, 0);
    raw.largestArmyHolder = normalizePlayerIndex(largestArmyHolder);
    raw.largestArmyCount = normalizeNonNegativeInteger(largestArmyCount, 0);
    raw.longestRoad = { holder: raw.longestRoadHolder, length: raw.longestRoadLength };
    raw.largestArmy = { holder: raw.largestArmyHolder, count: raw.largestArmyCount };
    return raw;
  }

  function normalizeTurnState(source = {}, snapshot = {}) {
    const raw = source && typeof source === "object" ? cloneJson(source) || {} : {};
    const legacy = snapshot && typeof snapshot === "object" ? snapshot : {};

    if (typeof raw.mainStep !== "string" || raw.mainStep.trim().length === 0) {
      if (typeof raw.main?.step === "string" && raw.main.step.trim().length > 0) raw.mainStep = raw.main.step;
      else if (typeof legacy.mainStep === "string" && legacy.mainStep.trim().length > 0) raw.mainStep = legacy.mainStep;
      else if (typeof legacy.mainTurnState?.mainStep === "string" && legacy.mainTurnState.mainStep.trim().length > 0) {
        raw.mainStep = legacy.mainTurnState.mainStep;
      } else raw.mainStep = "pregame";
    }

    if (typeof raw.pairStep !== "string" || raw.pairStep.trim().length === 0) {
      if (typeof raw.pair?.step === "string" && raw.pair.step.trim().length > 0) raw.pairStep = raw.pair.step;
      else if (typeof legacy.pairStep === "string" && legacy.pairStep.trim().length > 0) raw.pairStep = legacy.pairStep;
      else raw.pairStep = "inactive";
    }

    raw.pairPlayerIndex = normalizePlayerIndex(
      raw.pairPlayerIndex ?? raw.pair?.playerIndex ?? legacy.pairPlayerIndex ?? legacy.pairPlayer ?? legacy.partnerPlayerIndex ?? legacy.partnerPlayer
    );
    raw.pairTurnIndex = normalizePlayerIndex(raw.pairTurnIndex ?? raw.pair?.turnIndex ?? legacy.pairTurnIndex ?? legacy.turnIndex ?? legacy.pairIndex);
    raw.main = { step: raw.mainStep };
    raw.pair = {
      step: raw.pairStep,
      playerIndex: raw.pairPlayerIndex,
      turnIndex: raw.pairTurnIndex,
    };
    return raw;
  }

  function normalizeGeometry(source, nodes = [], tiles = []) {
    if (source && typeof source === "object") {
      const minX = Number(source.minX);
      const minY = Number(source.minY);
      const width = Number(source.width);
      const height = Number(source.height);
      if ([minX, minY, width, height].every((value) => Number.isFinite(value))) {
        return { minX, minY, width, height };
      }
    }

    const points = [];
    for (const node of Array.isArray(nodes) ? nodes : []) {
      if (Number.isFinite(node?.x) && Number.isFinite(node?.y)) points.push({ x: Number(node.x), y: Number(node.y) });
    }
    for (const tile of Array.isArray(tiles) ? tiles : []) {
      if (Number.isFinite(tile?.cx) && Number.isFinite(tile?.cy)) points.push({ x: Number(tile.cx), y: Number(tile.cy) });
      if (Array.isArray(tile?.corners)) {
        for (const point of tile.corners) {
          if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) points.push({ x: Number(point.x), y: Number(point.y) });
        }
      }
    }

    if (points.length === 0) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      minY,
      width: maxX - minX + 72,
      height: maxY - minY + 72,
    };
  }

  function normalizePlayerSnapshot(player, idx, playerColors) {
    const fallbackColor = DEFAULT_PLAYER_COLORS[idx] || DEFAULT_PLAYER_COLORS[idx % DEFAULT_PLAYER_COLORS.length] || "#666666";
    const devCards = normalizeDevelopmentState(player?.devCards ?? player?.development ?? {});
    const playedKnights = normalizeNonNegativeInteger(player?.playedKnights ?? devCards.playedKnights, devCards.playedKnights);
    devCards.playedKnights = playedKnights;
    return {
      name: typeof player?.name === "string" && player.name.trim().length > 0 ? player.name : `Player ${idx + 1}`,
      color: typeof player?.color === "string" && player.color.trim().length > 0 ? player.color : playerColors[idx] || fallbackColor,
      hand: normalizeHand(player?.hand, RESOURCE_TYPES),
      roads: normalizeIndexList(player?.roads),
      settlements: normalizeIndexList(player?.settlements),
      cities: normalizeIndexList(player?.cities),
      devCards,
      playedKnights,
    };
  }

  function deriveTurnStateFromLegacy(snapshot) {
    const raw = snapshot && typeof snapshot === "object" ? cloneJson(snapshot.turnState ?? snapshot.mainTurnState ?? {}) || {} : {};
    const phase = typeof snapshot?.phase === "string" ? snapshot.phase : "pregame";
    const hasRolled = snapshot?.hasRolled === true;
    const pendingRobberMove = snapshot?.pendingRobberMove === true;
    const diceResult = Number.isInteger(snapshot?.diceResult) ? snapshot.diceResult : null;
    const mode = typeof snapshot?.mode === "string" ? snapshot.mode : "";

    if (typeof raw.mainStep !== "string" || raw.mainStep.trim().length === 0) {
      if (typeof snapshot?.mainStep === "string" && snapshot.mainStep.trim().length > 0) raw.mainStep = snapshot.mainStep;
      else if (typeof snapshot?.mainTurnState?.mainStep === "string" && snapshot.mainTurnState.mainStep.trim().length > 0) {
        raw.mainStep = snapshot.mainTurnState.mainStep;
      } else if (typeof snapshot?.turnState?.mainStep === "string" && snapshot.turnState.mainStep.trim().length > 0) {
        raw.mainStep = snapshot.turnState.mainStep;
      } else if (phase === "setup") raw.mainStep = "setup";
      else if (phase === "gameover") raw.mainStep = "gameover";
      else if (phase !== "main") raw.mainStep = "pregame";
      else if (!hasRolled) raw.mainStep = "before_roll";
      else if (pendingRobberMove) raw.mainStep = "move_robber";
      else if (diceResult === 7 && mode === "robber") raw.mainStep = "discard";
      else raw.mainStep = "main_actions";
    }

    if (typeof raw.pairStep !== "string" || raw.pairStep.trim().length === 0) {
      if (typeof snapshot?.pairStep === "string" && snapshot.pairStep.trim().length > 0) raw.pairStep = snapshot.pairStep;
      else if (typeof snapshot?.turnState?.pairStep === "string" && snapshot.turnState.pairStep.trim().length > 0) raw.pairStep = snapshot.turnState.pairStep;
      else if (typeof snapshot?.mainTurnState?.pairStep === "string" && snapshot.mainTurnState.pairStep.trim().length > 0) {
        raw.pairStep = snapshot.mainTurnState.pairStep;
      } else {
        raw.pairStep = "inactive";
      }
    }

    raw.pairPlayerIndex = normalizePlayerIndex(
      raw.pairPlayerIndex ??
        raw.pair?.playerIndex ??
        snapshot?.pairPlayerIndex ??
        snapshot?.pairPlayer ??
        snapshot?.partnerPlayerIndex ??
        snapshot?.partnerPlayer
    );
    raw.pairTurnIndex = normalizePlayerIndex(raw.pairTurnIndex ?? raw.pair?.turnIndex ?? snapshot?.pairTurnIndex ?? snapshot?.turnIndex ?? snapshot?.pairIndex);
    raw.main = { step: raw.mainStep };
    raw.pair = {
      step: raw.pairStep,
      playerIndex: raw.pairPlayerIndex,
      turnIndex: raw.pairTurnIndex,
    };
    return raw;
  }

  function migrateSnapshot(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== "object") return null;
    const version = Number(snapshot.version);
    if (version !== LEGACY_SAVE_SCHEMA_VERSION && version !== SAVE_SCHEMA_VERSION) return null;

    const playerColors = Array.isArray(options.playerColors) ? options.playerColors : DEFAULT_PLAYER_COLORS;
    const playersRaw = Array.isArray(snapshot.players) ? snapshot.players : [];
    if (playersRaw.length < 3 || playersRaw.length > 6) return null;

    const players = playersRaw.map((player, idx) => normalizePlayerSnapshot(player, idx, playerColors));
    const tiles = Array.isArray(snapshot.tiles)
      ? snapshot.tiles.map((tile, idx) => ({
          idx: Number.isInteger(tile?.idx) ? tile.idx : idx,
          q: Number(tile?.q),
          r: Number(tile?.r),
          resource: typeof tile?.resource === "string" ? tile.resource : "desert",
          number: tile?.number === null ? null : Number(tile?.number),
          cx: Number(tile?.cx),
          cy: Number(tile?.cy),
          corners: Array.isArray(tile?.corners)
            ? tile.corners.map((point) => clonePoint(point))
            : [],
          nodes: Array.isArray(tile?.nodes) ? normalizeIndexList(tile.nodes) : [],
        }))
      : [];
    const nodes = Array.isArray(snapshot.nodes)
      ? snapshot.nodes.map((node, idx) => ({
          idx: Number.isInteger(node?.idx) ? node.idx : idx,
          x: Number(node?.x),
          y: Number(node?.y),
          hexes: Array.isArray(node?.hexes) ? normalizeIndexList(node.hexes) : [],
          edges: normalizeIndexList(node?.edges),
          owner: Number.isInteger(node?.owner) ? node.owner : null,
          isCity: node?.isCity === true,
        }))
      : [];
    const edges = Array.isArray(snapshot.edges)
      ? snapshot.edges.map((edge, idx) => ({
          idx: Number.isInteger(edge?.idx) ? edge.idx : idx,
          a: Number(edge?.a),
          b: Number(edge?.b),
          owner: Number.isInteger(edge?.owner) ? edge.owner : null,
        }))
      : [];

    const playerCount = players.length;
    const bank = normalizeBank(snapshot.bank, playerCount);
    const devDeck = normalizeDevelopmentDeck(snapshot.devDeck, playerCount);
    const awards = normalizeAwards(snapshot.awards);
    const harbors = normalizeHarbors(snapshot.harbors);
    const turnState = deriveTurnStateFromLegacy(snapshot);
    const geometry = normalizeGeometry(snapshot.geometry, nodes, tiles);
    const rollHistogram = emptyRollHistogram(options.diceSums || []);
    if (options.diceSums && Array.isArray(options.diceSums)) {
      for (const sum of options.diceSums) {
        const count = Number(snapshot.rollHistogram?.[sum] ?? 0);
        rollHistogram[sum] = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
      }
    }

    return {
      ...cloneJson(snapshot),
      version: SAVE_SCHEMA_VERSION,
      players,
      tiles,
      nodes,
      edges,
      geometry,
      bank,
      devDeck,
      awards,
      harbors,
      turnState,
      mainStep: turnState.mainStep,
      pairStep: turnState.pairStep,
      pairPlayerIndex: turnState.pairPlayerIndex,
      pairTurnIndex: turnState.pairTurnIndex,
      longestRoadHolder: awards.longestRoadHolder,
      longestRoadLength: awards.longestRoadLength,
      largestArmyHolder: awards.largestArmyHolder,
      largestArmyCount: awards.largestArmyCount,
      rollHistogram: options.diceSums ? rollHistogram : cloneJson(snapshot.rollHistogram) || {},
    };
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

    const playerCount = state.players.length;
    const turnState = normalizeTurnState(
      state.turnState ?? {
        mainStep: state.mainStep,
        pairStep: state.pairStep,
        pairPlayerIndex: state.pairPlayerIndex,
        pairTurnIndex: state.pairTurnIndex,
      },
      state
    );
    const awards = normalizeAwards(state.awards);
    const bank = normalizeBank(state.bank, playerCount);
    const devDeck = normalizeDevelopmentDeck(state.devDeck, playerCount);
    const harbors = normalizeHarbors(state.harbors);

    return {
      version: SAVE_SCHEMA_VERSION,
      saveId: state.currentSaveId,
      createdAt,
      savedAt,
      players: state.players.map((player) => {
        const devCards = normalizeDevelopmentState(player.devCards);
        const playedKnights = normalizeNonNegativeInteger(player.playedKnights ?? devCards.playedKnights, devCards.playedKnights);
        devCards.playedKnights = playedKnights;
        return {
          name: player.name,
          color: player.color,
          hand: normalizeHand(player.hand, resources),
          roads: Array.from(player.roads).sort((a, b) => a - b),
          settlements: Array.from(player.settlements).sort((a, b) => a - b),
          cities: Array.from(player.cities).sort((a, b) => a - b),
          devCards,
          playedKnights,
        };
      }),
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
      bank,
      devDeck,
      awards,
      harbors,
      turnState,
      mainStep: turnState.mainStep,
      pairStep: turnState.pairStep,
      pairPlayerIndex: turnState.pairPlayerIndex,
      pairTurnIndex: turnState.pairTurnIndex,
      longestRoadHolder: awards.longestRoadHolder,
      longestRoadLength: awards.longestRoadLength,
      largestArmyHolder: awards.largestArmyHolder,
      largestArmyCount: awards.largestArmyCount,
    };
  }

  function buildSaveSummary(snapshot) {
    const currentPlayer = snapshot.players[snapshot.currentPlayer];
    const turnState = snapshot.turnState || {};
    return {
      id: snapshot.saveId,
      createdAt: snapshot.createdAt,
      savedAt: snapshot.savedAt,
      phase: snapshot.phase,
      round: snapshot.round,
      currentPlayerName: currentPlayer ? currentPlayer.name : "",
      playerNames: snapshot.players.map((player) => player.name),
      playerCount: Array.isArray(snapshot.players) ? snapshot.players.length : 0,
      mainStep: typeof snapshot.mainStep === "string" ? snapshot.mainStep : typeof turnState.mainStep === "string" ? turnState.mainStep : "",
      pairStep: typeof snapshot.pairStep === "string" ? snapshot.pairStep : typeof turnState.pairStep === "string" ? turnState.pairStep : "",
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
    const migrated = migrateSnapshot(snapshot, { playerColors, diceSums });
    if (!migrated) return null;
    if (typeof clampTurnSeconds !== "function") return null;

    const players = migrated.players.map((player, idx) => {
      const devCards = normalizeDevelopmentState(player.devCards);
      const playedKnights = normalizeNonNegativeInteger(player.playedKnights ?? devCards.playedKnights, devCards.playedKnights);
      devCards.playedKnights = playedKnights;
      return {
        name: player.name,
        color: player.color,
        hand: normalizeHand(player.hand, resources),
        roads: new Set(Array.isArray(player.roads) ? player.roads : []),
        settlements: new Set(Array.isArray(player.settlements) ? player.settlements : []),
        cities: new Set(Array.isArray(player.cities) ? player.cities : []),
        devCards,
        playedKnights,
      };
    });

    const tiles = migrated.tiles.map((tile, idx) => ({
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

    const nodes = migrated.nodes.map((node, idx) => ({
      idx: Number.isInteger(node.idx) ? node.idx : idx,
      x: Number(node.x),
      y: Number(node.y),
      hexes: Array.isArray(node.hexes) ? node.hexes.slice() : [],
      edges: new Set(Array.isArray(node.edges) ? node.edges : []),
      owner: Number.isInteger(node.owner) ? node.owner : null,
      isCity: node.isCity === true,
    }));

    const edges = migrated.edges.map((edge, idx) => ({
      idx: Number.isInteger(edge.idx) ? edge.idx : idx,
      a: Number(edge.a),
      b: Number(edge.b),
      owner: Number.isInteger(edge.owner) ? edge.owner : null,
    }));

    const rollHistogram = emptyRollHistogram(diceSums);
    for (const sum of diceSums) {
      const count = Number(migrated.rollHistogram?.[sum] ?? 0);
      rollHistogram[sum] = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    }

    const turnSeconds = clampTurnSeconds(migrated.turnSeconds);
    const turnTimerRemainingMs = Number.isFinite(Number(migrated.turnTimerRemainingMs))
      ? Math.max(0, Number(migrated.turnTimerRemainingMs))
      : turnSeconds * 1000;

    const restored = {
      players,
      tiles,
      nodes,
      edges,
      geometry: migrated.geometry ? { ...migrated.geometry } : null,
      robberTile: Number.isInteger(migrated.robberTile) ? migrated.robberTile : -1,
      phase:
        migrated.phase === "setup" ||
        migrated.phase === "main" ||
        migrated.phase === "gameover" ||
        migrated.phase === "pregame"
          ? migrated.phase
          : "pregame",
      setup: migrated.setup
        ? {
            order: Array.isArray(migrated.setup.order) ? migrated.setup.order.slice() : [],
            turnIndex: Number.isInteger(migrated.setup.turnIndex) ? migrated.setup.turnIndex : 0,
            expecting: migrated.setup.expecting === "road" ? "road" : "settlement",
            lastSettlementNode: Number.isInteger(migrated.setup.lastSettlementNode) ? migrated.setup.lastSettlementNode : null,
            selectedSettlementNode: Number.isInteger(migrated.setup.selectedSettlementNode)
              ? migrated.setup.selectedSettlementNode
              : null,
          }
        : null,
      currentPlayer:
        Number.isInteger(migrated.currentPlayer) && migrated.currentPlayer >= 0 && migrated.currentPlayer < players.length
          ? migrated.currentPlayer
          : 0,
      round: Number.isInteger(migrated.round) ? migrated.round : 1,
      hasRolled: migrated.hasRolled === true,
      diceResult: Number.isInteger(migrated.diceResult) ? migrated.diceResult : null,
      isRollingDice: false,
      rollingDiceValue: null,
      rollResultPopupValue: null,
      rollHistogram,
      rollCountTotal: Number.isInteger(migrated.rollCountTotal)
        ? migrated.rollCountTotal
        : diceSums.reduce((total, sum) => total + rollHistogram[sum], 0),
      histogramOpen: migrated.histogramOpen === true,
      turnSeconds,
      turnTimerActive: false,
      turnTimerEndMs: 0,
      turnTimerRemainingMs,
      turnTimeoutBusy: false,
      pendingRobberMove: migrated.pendingRobberMove === true,
      mode: "none",
      tradeMenuOpen: migrated.tradeMenuOpen === true && migrated.phase === "main",
      status: typeof migrated.status === "string" && migrated.status.length > 0 ? migrated.status : "Game resumed.",
      log: Array.isArray(migrated.log) ? migrated.log.filter((line) => typeof line === "string").slice(0, 16) : [],
      currentSaveId: typeof migrated.saveId === "string" && migrated.saveId.length > 0 ? migrated.saveId : makeSaveId(),
      saveCreatedAt:
        typeof migrated.createdAt === "string" && migrated.createdAt.length > 0
          ? migrated.createdAt
          : typeof migrated.savedAt === "string"
          ? migrated.savedAt
          : new Date().toISOString(),
      lastSaveAt: typeof migrated.savedAt === "string" ? migrated.savedAt : null,
      bank: normalizeBank(migrated.bank, players.length),
      devDeck: normalizeDevelopmentDeck(migrated.devDeck, players.length),
      awards: normalizeAwards(migrated.awards),
      harbors: normalizeHarbors(migrated.harbors),
      turnState: normalizeTurnState(migrated.turnState, migrated),
      mainStep: typeof migrated.mainStep === "string" ? migrated.mainStep : migrated.turnState?.mainStep || "pregame",
      pairStep: typeof migrated.pairStep === "string" ? migrated.pairStep : migrated.turnState?.pairStep || "inactive",
      pairPlayerIndex: normalizePlayerIndex(migrated.pairPlayerIndex ?? migrated.turnState?.pairPlayerIndex ?? migrated.turnState?.pairPlayer),
      pairTurnIndex: normalizePlayerIndex(migrated.pairTurnIndex ?? migrated.turnState?.pairTurnIndex),
      longestRoadHolder: normalizePlayerIndex(migrated.longestRoadHolder ?? migrated.awards?.longestRoadHolder),
      longestRoadLength: normalizeNonNegativeInteger(migrated.longestRoadLength ?? migrated.awards?.longestRoadLength, 0),
      largestArmyHolder: normalizePlayerIndex(migrated.largestArmyHolder ?? migrated.awards?.largestArmyHolder),
      largestArmyCount: normalizeNonNegativeInteger(migrated.largestArmyCount ?? migrated.awards?.largestArmyCount, 0),
    };

    restored.mode =
      restored.pendingRobberMove
        ? "robber"
        : migrated.mode === "road" || migrated.mode === "settlement" || migrated.mode === "city" || migrated.mode === "none"
        ? migrated.mode
        : "none";
    restored.turnState = normalizeTurnState({ ...restored.turnState, mainStep: restored.mainStep, pairStep: restored.pairStep, pairPlayerIndex: restored.pairPlayerIndex, pairTurnIndex: restored.pairTurnIndex }, restored);

    rebuildPlayerPieceSets(players, edges, nodes);
    for (const player of players) {
      player.playedKnights = player.devCards.playedKnights;
    }

    return restored;
  }

  return {
    SAVE_SCHEMA_VERSION,
    LEGACY_SAVE_SCHEMA_VERSION,
    SAVE_INDEX_KEY,
    SAVE_RECORD_PREFIX,
    RESOURCE_TYPES,
    DEV_CARD_TYPES,
    DEFAULT_PIECE_LIMITS,
    createResourceMap,
    createBank,
    normalizeHand,
    emptyRollHistogram,
    makeSaveId,
    saveRecordKey,
    formatSaveTimestamp,
    friendlySavePhase,
    sortSaveSummaries,
    sanitizeSaveIndex,
    createDevelopmentDeck,
    normalizeDevelopmentState,
    normalizeAwards,
    normalizeHarbors,
    normalizeTurnState,
    migrateSnapshot,
    captureGameSnapshot,
    buildSaveSummary,
    deserializeSnapshot,
  };
});
