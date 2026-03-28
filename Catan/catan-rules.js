"use strict";

(function initCatanRules(root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.CatanRules = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCatanRules() {
  const RESOURCE_TYPES = ["wood", "brick", "sheep", "wheat", "ore"];
  const DEV_CARD_TYPES = ["knight", "road_building", "year_of_plenty", "monopoly", "victory_point"];
  const DEFAULT_PIECE_LIMITS = { road: 15, settlement: 5, city: 4 };
  const DEFAULT_BANK_COUNTS = RESOURCE_TYPES.reduce((acc, resource) => {
    acc[resource] = 19;
    return acc;
  }, {});
  const EXTENSION_BANK_COUNTS = RESOURCE_TYPES.reduce((acc, resource) => {
    acc[resource] = 24;
    return acc;
  }, {});
  const ROAD_COST = { wood: 1, brick: 1 };
  const SETTLEMENT_COST = { wood: 1, brick: 1, sheep: 1, wheat: 1 };
  const CITY_COST = { wheat: 2, ore: 3 };
  const DEVELOPMENT_CARD_COST = { sheep: 1, wheat: 1, ore: 1 };
  const DEVELOPMENT_DECK_COUNTS = {
    knight: 14,
    road_building: 2,
    year_of_plenty: 2,
    monopoly: 2,
    victory_point: 5,
  };
  const EXTENSION_DEVELOPMENT_DECK_COUNTS = {
    knight: 20,
    road_building: 3,
    year_of_plenty: 3,
    monopoly: 3,
    victory_point: 5,
  };

  function createResourceMap(init = 0, resources = RESOURCE_TYPES) {
    const out = {};
    for (const resource of resources) out[resource] = init;
    return out;
  }

  function normalizeResourceMap(source = {}, resources = RESOURCE_TYPES, init = 0) {
    const out = createResourceMap(init, resources);
    for (const resource of resources) {
      const raw = Number(source?.[resource] ?? init);
      out[resource] = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : Math.max(0, Math.floor(init));
    }
    return out;
  }

  function normalizeResourceDelta(source = {}, resources = RESOURCE_TYPES) {
    const out = createResourceMap(0, resources);
    for (const resource of resources) {
      const raw = Number(source?.[resource] ?? 0);
      out[resource] = Number.isFinite(raw) ? Math.trunc(raw) : 0;
    }
    return out;
  }

  function countCollection(value) {
    if (value instanceof Set || value instanceof Map) return value.size;
    if (Array.isArray(value)) return value.length;
    if (Number.isFinite(value)) return Math.max(0, Math.floor(value));
    return 0;
  }

  function collectionValues(value) {
    if (value instanceof Set || value instanceof Map) return Array.from(value.keys ? value.keys() : value.values());
    if (Array.isArray(value)) return value.slice();
    return [];
  }

  function otherNode(edge, nodeIdx) {
    return edge.a === nodeIdx ? edge.b : edge.a;
  }

  function getNode(state, nodeIdx) {
    return Array.isArray(state?.nodes) && nodeIdx >= 0 && nodeIdx < state.nodes.length ? state.nodes[nodeIdx] : null;
  }

  function getEdge(state, edgeIdx) {
    return Array.isArray(state?.edges) && edgeIdx >= 0 && edgeIdx < state.edges.length ? state.edges[edgeIdx] : null;
  }

  function getPlayer(state, playerIdx) {
    return Array.isArray(state?.players) && playerIdx >= 0 && playerIdx < state.players.length ? state.players[playerIdx] : null;
  }

  function getPlayerPieceCounts(player) {
    return {
      road: countCollection(player?.roads),
      settlement: countCollection(player?.settlements),
      city: countCollection(player?.cities),
    };
  }

  function getRemainingPieces(player, limits = DEFAULT_PIECE_LIMITS) {
    const built = getPlayerPieceCounts(player);
    return {
      road: Math.max(0, (limits.road ?? DEFAULT_PIECE_LIMITS.road) - built.road),
      settlement: Math.max(0, (limits.settlement ?? DEFAULT_PIECE_LIMITS.settlement) - built.settlement),
      city: Math.max(0, (limits.city ?? DEFAULT_PIECE_LIMITS.city) - built.city),
    };
  }

  function canSpendPiece(player, pieceType, limits = DEFAULT_PIECE_LIMITS) {
    const remaining = getRemainingPieces(player, limits);
    return remaining[pieceType] > 0;
  }

  function canAffordCost(wallet, cost, resources = RESOURCE_TYPES) {
    const hand = normalizeResourceMap(wallet, resources, 0);
    const normalizedCost = normalizeResourceMap(cost, resources, 0);
    return resources.every((resource) => hand[resource] >= normalizedCost[resource]);
  }

  function applyResourceDelta(wallet, delta, resources = RESOURCE_TYPES) {
    const next = normalizeResourceMap(wallet, resources, 0);
    const changes = normalizeResourceDelta(delta, resources);
    for (const resource of resources) {
      next[resource] = Math.max(0, next[resource] + changes[resource]);
    }
    return next;
  }

  function applyCost(wallet, cost, resources = RESOURCE_TYPES) {
    return applyResourceDelta(wallet, Object.fromEntries(resources.map((resource) => [resource, -(Number(cost?.[resource] ?? 0) || 0)])), resources);
  }

  function createBank(initialCounts = DEFAULT_BANK_COUNTS) {
    if (typeof initialCounts === "number") {
      const defaults = initialCounts >= 5 ? EXTENSION_BANK_COUNTS : DEFAULT_BANK_COUNTS;
      return normalizeResourceMap(defaults, RESOURCE_TYPES, 0);
    }
    return normalizeResourceMap(initialCounts, RESOURCE_TYPES, 19);
  }

  function applyBankPayout(bank, request, resources = RESOURCE_TYPES) {
    const nextBank = normalizeResourceMap(bank, resources, 0);
    const wanted = normalizeResourceMap(request, resources, 0);
    const granted = createResourceMap(0, resources);
    const shortage = createResourceMap(0, resources);

    for (const resource of resources) {
      granted[resource] = Math.min(nextBank[resource], wanted[resource]);
      shortage[resource] = Math.max(0, wanted[resource] - granted[resource]);
      nextBank[resource] -= granted[resource];
    }

    return { bank: nextBank, granted, shortage };
  }

  function applyResourceGainFromBank(bank, wallet, request, resources = RESOURCE_TYPES) {
    const payout = applyBankPayout(bank, request, resources);
    return {
      bank: payout.bank,
      wallet: applyResourceDelta(wallet, payout.granted, resources),
      granted: payout.granted,
      shortage: payout.shortage,
    };
  }

  function isNodeBlockedByOpponent(state, nodeIdx, playerIdx) {
    const node = getNode(state, nodeIdx);
    if (!node) return false;
    return node.owner !== null && node.owner !== playerIdx;
  }

  function getPlayerOwnedNodeSet(state, playerIdx) {
    const owned = new Set();
    for (const node of Array.isArray(state?.nodes) ? state.nodes : []) {
      if (node && node.owner === playerIdx) owned.add(node.idx);
    }
    return owned;
  }

  function getReachableRoadNodes(state, playerIdx) {
    const reachable = new Set();
    const queue = [];

    for (const nodeIdx of getPlayerOwnedNodeSet(state, playerIdx)) {
      reachable.add(nodeIdx);
      queue.push(nodeIdx);
    }

    while (queue.length > 0) {
      const nodeIdx = queue.shift();
      const node = getNode(state, nodeIdx);
      if (!node || isNodeBlockedByOpponent(state, nodeIdx, playerIdx)) continue;
      const edgeIds = collectionValues(node.edges);

      for (const edgeIdx of edgeIds) {
        const edge = getEdge(state, edgeIdx);
        if (!edge || edge.owner !== playerIdx) continue;
        const nextNodeIdx = otherNode(edge, nodeIdx);
        if (reachable.has(nextNodeIdx)) continue;
        const nextNode = getNode(state, nextNodeIdx);
        if (!nextNode) continue;
        if (isNodeBlockedByOpponent(state, nextNodeIdx, playerIdx)) continue;
        reachable.add(nextNodeIdx);
        queue.push(nextNodeIdx);
      }
    }

    return reachable;
  }

  function canBuildRoad(state, playerIdx, edgeIdx, options = {}) {
    const player = getPlayer(state, playerIdx);
    const edge = getEdge(state, edgeIdx);
    if (!player || !edge) return { ok: false, reason: "Invalid edge." };
    if (edge.owner !== null) return { ok: false, reason: "Road already exists there." };
    if (!canSpendPiece(player, "road", options.pieceLimits)) return { ok: false, reason: "No roads remain." };

    const setupNode = options.setupNode ?? null;
    if (setupNode !== null) {
      if (edge.a === setupNode || edge.b === setupNode) return { ok: true };
      return { ok: false, reason: "Setup road must touch your new settlement." };
    }

    const reachable = getReachableRoadNodes(state, playerIdx);
    const endpoints = [edge.a, edge.b];
    for (const nodeIdx of endpoints) {
      const node = getNode(state, nodeIdx);
      if (!node) continue;
      if (node.owner === playerIdx) return { ok: true };
      if (!isNodeBlockedByOpponent(state, nodeIdx, playerIdx) && reachable.has(nodeIdx)) return { ok: true };
    }
    return { ok: false, reason: "Road must connect to your road or building." };
  }

  function canBuildSettlement(state, playerIdx, nodeIdx, options = {}) {
    const player = getPlayer(state, playerIdx);
    const node = getNode(state, nodeIdx);
    if (!player || !node) return { ok: false, reason: "Invalid node." };
    if (node.owner !== null) return { ok: false, reason: "That corner is already occupied." };
    if (!canSpendPiece(player, "settlement", options.pieceLimits)) {
      return { ok: false, reason: "No settlements remain." };
    }
    for (const neighborIdx of collectionValues(node.edges).map((edgeIdx) => {
      const edge = getEdge(state, edgeIdx);
      return edge ? otherNode(edge, nodeIdx) : -1;
    })) {
      if (neighborIdx >= 0) {
        const neighbor = getNode(state, neighborIdx);
        if (neighbor && neighbor.owner !== null) return { ok: false, reason: "Distance rule violation." };
      }
    }
    if (!options.setup) {
      const reachable = getReachableRoadNodes(state, playerIdx);
      if (!reachable.has(nodeIdx)) return { ok: false, reason: "Settlement must connect to one of your roads." };
    }
    return { ok: true };
  }

  function canBuildCity(state, playerIdx, nodeIdx, options = {}) {
    const player = getPlayer(state, playerIdx);
    const node = getNode(state, nodeIdx);
    if (!player || !node) return { ok: false, reason: "Invalid node." };
    if (node.owner !== playerIdx) return { ok: false, reason: "You do not own this settlement." };
    if (node.isCity) return { ok: false, reason: "That is already a city." };
    if (!canSpendPiece(player, "city", options.pieceLimits)) return { ok: false, reason: "No cities remain." };
    return { ok: true };
  }

  function createDevelopmentDeck(playerCount = 4) {
    const counts = Number(playerCount) >= 5 ? EXTENSION_DEVELOPMENT_DECK_COUNTS : DEVELOPMENT_DECK_COUNTS;
    const deck = [];
    for (const cardType of DEV_CARD_TYPES) {
      for (let i = 0; i < (counts[cardType] ?? 0); i += 1) deck.push(cardType);
    }
    return deck;
  }

  function normalizeDevelopmentState(source = {}) {
    const hand = createResourceMap(0, DEV_CARD_TYPES);
    const boughtThisTurn = createResourceMap(0, DEV_CARD_TYPES);
    const sourceHand = source.hand ?? source.playable ?? source.cards ?? source.devCards?.hand ?? {};
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
      playedKnights: Math.max(0, Math.floor(Number(source.playedKnights ?? source.devCards?.playedKnights ?? 0) || 0)),
      freeRoadPlacements: Math.max(0, Math.floor(Number(source.freeRoadPlacements ?? source.devCards?.freeRoadPlacements ?? 0) || 0)),
    };
  }

  function promoteBoughtDevelopmentCards(devState) {
    const next = normalizeDevelopmentState(devState);
    for (const cardType of DEV_CARD_TYPES) {
      next.hand[cardType] += next.boughtThisTurn[cardType];
      next.boughtThisTurn[cardType] = 0;
    }
    next.playedNonVictoryThisTurn = false;
    return next;
  }

  function countVictoryPointCards(devState) {
    const normalized = normalizeDevelopmentState(devState);
    return normalized.hand.victory_point + normalized.boughtThisTurn.victory_point;
  }

  function canBuyDevelopmentCard(player, bank, deck) {
    const hand = normalizeResourceMap(player?.hand, RESOURCE_TYPES, 0);
    return canAffordCost(hand, DEVELOPMENT_CARD_COST) && deck.length > 0;
  }

  function buyDevelopmentCard(state, playerIdx) {
    const player = getPlayer(state, playerIdx);
    const deck = Array.isArray(state?.devDeck) ? state.devDeck.slice() : [];
    const bank = normalizeResourceMap(state?.bank, RESOURCE_TYPES, 0);
    if (!player || deck.length === 0) return { ok: false, reason: "No development cards remain." };
    if (!canBuyDevelopmentCard(player, bank, deck)) return { ok: false, reason: "Cannot afford a development card." };

    const nextPlayer = {
      ...player,
      hand: applyCost(player.hand, DEVELOPMENT_CARD_COST, RESOURCE_TYPES),
      devCards: normalizeDevelopmentState(player.devCards),
    };
    const card = deck.shift();
    nextPlayer.devCards.boughtThisTurn[card] += 1;

    return {
      ok: true,
      card,
      bank: applyResourceDelta(bank, DEVELOPMENT_CARD_COST, RESOURCE_TYPES),
      devDeck: deck,
      player: nextPlayer,
    };
  }

  function canPlayDevelopmentCard(devState, cardType, turnState = {}) {
    if (!DEV_CARD_TYPES.includes(cardType) || cardType === "victory_point") return false;
    const normalized = normalizeDevelopmentState(devState);
    if (
      turnState.mainStep &&
      turnState.mainStep !== "before_roll" &&
      turnState.mainStep !== "main_actions" &&
      turnState.mainStep !== "dev_card_resolution"
    ) {
      return false;
    }
    if (normalized.playedNonVictoryThisTurn) return false;
    if (normalized.boughtThisTurn[cardType] > 0) return false;
    return normalized.hand[cardType] > 0;
  }

  function spendDevelopmentCard(devState, cardType, turnState = {}) {
    if (!canPlayDevelopmentCard(devState, cardType, turnState)) {
      return { ok: false, reason: "Card cannot be played right now." };
    }
    const next = normalizeDevelopmentState(devState);
    next.hand[cardType] -= 1;
    next.playedNonVictoryThisTurn = true;
    if (cardType === "knight") next.playedKnights += 1;
    return { ok: true, devCards: next };
  }

  function applyRoadBuildingEffect(turnState, placements = 2) {
    const next = { ...(turnState || {}) };
    next.freeRoadPlacements = Math.max(0, Math.floor(Number(next.freeRoadPlacements ?? 0) || 0)) + Math.max(0, Math.floor(Number(placements) || 0));
    return next;
  }

  function applyYearOfPlentyEffect(bank, playerHand, request, maxCards = 2) {
    const desired = normalizeResourceMap(request, RESOURCE_TYPES, 0);
    const requestedCount = RESOURCE_TYPES.reduce((sum, resource) => sum + desired[resource], 0);
    const limit = Math.max(0, Math.floor(Number(maxCards) || 0));
    if (requestedCount > limit) {
      return {
        ok: false,
        reason: `Year of Plenty can grant at most ${limit} resource cards.`,
        bank: normalizeResourceMap(bank, RESOURCE_TYPES, 0),
        hand: normalizeResourceMap(playerHand, RESOURCE_TYPES, 0),
        granted: createResourceMap(0, RESOURCE_TYPES),
        shortage: createResourceMap(0, RESOURCE_TYPES),
      };
    }
    const payout = applyResourceGainFromBank(bank, playerHand, desired, RESOURCE_TYPES);
    return {
      ok: true,
      bank: payout.bank,
      hand: payout.wallet,
      granted: payout.granted,
      shortage: payout.shortage,
    };
  }

  function applyMonopolyEffect(players, playerIdx, resource) {
    if (!RESOURCE_TYPES.includes(resource)) {
      return { ok: false, reason: "Invalid resource.", players: Array.isArray(players) ? players.slice() : [], stolen: 0 };
    }
    const nextPlayers = Array.isArray(players) ? players.map((player) => ({ ...player, hand: normalizeResourceMap(player?.hand, RESOURCE_TYPES, 0) })) : [];
    if (playerIdx < 0 || playerIdx >= nextPlayers.length) {
      return { ok: false, reason: "Invalid player.", players: nextPlayers, stolen: 0 };
    }

    let stolen = 0;
    for (let idx = 0; idx < nextPlayers.length; idx += 1) {
      if (idx === playerIdx) continue;
      stolen += nextPlayers[idx].hand[resource];
      nextPlayers[idx].hand[resource] = 0;
    }
    nextPlayers[playerIdx].hand[resource] += stolen;
    return { ok: true, players: nextPlayers, stolen };
  }

  function resolveHarborTradeRate(state, playerIdx, giveResource) {
    const player = getPlayer(state, playerIdx);
    if (!player || !RESOURCE_TYPES.includes(giveResource)) return 4;
    const occupiedNodes = new Set();
    for (const node of Array.isArray(state?.nodes) ? state.nodes : []) {
      if (node && node.owner === playerIdx) occupiedNodes.add(node.idx);
    }

    let bestRate = 4;
    for (const harbor of Array.isArray(state?.harbors) ? state.harbors : []) {
      if (!harbor || !Array.isArray(harbor.nodes)) continue;
      const touchesHarbor = harbor.nodes.some((nodeIdx) => occupiedNodes.has(nodeIdx));
      if (!touchesHarbor) continue;
      if (harbor.type === giveResource) return 2;
      if (harbor.type === "generic") bestRate = Math.min(bestRate, 3);
    }
    return bestRate;
  }

  function performBankTrade(state, playerIdx, giveResource, getResource, options = {}) {
    if (!RESOURCE_TYPES.includes(giveResource) || !RESOURCE_TYPES.includes(getResource) || giveResource === getResource) {
      return { ok: false, reason: "Choose different resources for trade." };
    }
    const player = getPlayer(state, playerIdx);
    if (!player) return { ok: false, reason: "Invalid player." };
    const rate = Math.max(1, Math.floor(Number(options.rate ?? resolveHarborTradeRate(state, playerIdx, giveResource)) || 4));
    const count = Math.max(1, Math.floor(Number(options.count) || 1));
    const hand = normalizeResourceMap(player.hand, RESOURCE_TYPES, 0);
    const bank = normalizeResourceMap(state?.bank, RESOURCE_TYPES, 0);

    if (hand[giveResource] < rate * count) return { ok: false, reason: `Need ${rate * count} ${giveResource} to trade.` };
    if (bank[getResource] < count) return { ok: false, reason: `The bank is out of ${getResource}.` };

    const nextPlayers = Array.isArray(state?.players) ? state.players.slice() : [];
    const nextPlayer = {
      ...player,
      hand: applyResourceDelta(hand, { [giveResource]: -(rate * count), [getResource]: count }, RESOURCE_TYPES),
    };
    nextPlayers[playerIdx] = nextPlayer;

    const nextBank = applyResourceDelta(bank, { [giveResource]: rate * count, [getResource]: -count }, RESOURCE_TYPES);
    return {
      ok: true,
      rate,
      count,
      state: {
        ...state,
        players: nextPlayers,
        bank: nextBank,
      },
    };
  }

  function computeLongestRoadLength(state, playerIdx) {
    const player = getPlayer(state, playerIdx);
    if (!player) return 0;
    const usedEdges = new Set();
    let best = 0;

    function longestFromNode(nodeIdx) {
      const node = getNode(state, nodeIdx);
      if (!node || isNodeBlockedByOpponent(state, nodeIdx, playerIdx)) return 0;
      let branchBest = 0;
      for (const edgeIdx of collectionValues(node.edges)) {
        const edge = getEdge(state, edgeIdx);
        if (!edge || edge.owner !== playerIdx || usedEdges.has(edgeIdx)) continue;
        branchBest = Math.max(branchBest, longestFromEdge(edgeIdx, nodeIdx));
      }
      return branchBest;
    }

    function longestFromEdge(edgeIdx, fromNodeIdx) {
      const edge = getEdge(state, edgeIdx);
      if (!edge || edge.owner !== playerIdx || usedEdges.has(edgeIdx)) return 0;
      usedEdges.add(edgeIdx);
      const nextNodeIdx = otherNode(edge, fromNodeIdx);
      const length = 1 + longestFromNode(nextNodeIdx);
      usedEdges.delete(edgeIdx);
      return length;
    }

    for (const edgeIdx of collectionValues(player.roads)) {
      const edge = getEdge(state, edgeIdx);
      if (!edge || edge.owner !== playerIdx) continue;
      best = Math.max(best, longestFromEdge(edgeIdx, edge.a), longestFromEdge(edgeIdx, edge.b));
    }

    return best;
  }

  function recomputeLongestRoad(state, currentHolder = null, minimum = 5) {
    const counts = Array.isArray(state?.players) ? state.players.map((_, idx) => computeLongestRoadLength(state, idx)) : [];
    let bestHolder = currentHolder;
    let bestLength = currentHolder === null || currentHolder === undefined ? 0 : counts[currentHolder] ?? 0;

    for (let idx = 0; idx < counts.length; idx += 1) {
      const length = counts[idx];
      if (length < minimum) continue;
      if (length > bestLength || bestHolder === null || bestHolder === undefined) {
        bestHolder = idx;
        bestLength = length;
      }
    }

    if (bestLength < minimum) return { holder: null, length: bestLength };
    return { holder: bestHolder, length: bestLength };
  }

  function recomputeLargestArmy(players, currentHolder = null, minimum = 3) {
    const counts = Array.isArray(players)
      ? players.map((player) => Math.max(0, Math.floor(Number(player?.playedKnights ?? player?.devCards?.playedKnights ?? 0) || 0)))
      : [];
    let bestHolder = currentHolder;
    let bestCount = currentHolder === null || currentHolder === undefined ? 0 : counts[currentHolder] ?? 0;

    for (let idx = 0; idx < counts.length; idx += 1) {
      const count = counts[idx];
      if (count < minimum) continue;
      if (count > bestCount || bestHolder === null || bestHolder === undefined) {
        bestHolder = idx;
        bestCount = count;
      }
    }

    if (bestCount < minimum) return { holder: null, count: bestCount };
    return { holder: bestHolder, count: bestCount };
  }

  function computeVictoryPoints(player, awards = {}, playerIdx = null, devState = null) {
    const builtSettlements = countCollection(player?.settlements);
    const builtCities = countCollection(player?.cities);
    const longestRoadHolder = awards.longestRoadHolder ?? awards.longestRoad ?? null;
    const largestArmyHolder = awards.largestArmyHolder ?? awards.largestArmy ?? null;
    let points = builtSettlements + builtCities * 2 + countVictoryPointCards(devState);
    if (playerIdx !== null && playerIdx !== undefined) {
      if (longestRoadHolder === playerIdx) points += 2;
      if (largestArmyHolder === playerIdx) points += 2;
    }
    return points;
  }

  return {
    RESOURCE_TYPES,
    DEV_CARD_TYPES,
    DEFAULT_PIECE_LIMITS,
    DEFAULT_BANK_COUNTS,
    EXTENSION_BANK_COUNTS,
    ROAD_COST,
    SETTLEMENT_COST,
    CITY_COST,
    DEVELOPMENT_CARD_COST,
    DEVELOPMENT_DECK_COUNTS,
    EXTENSION_DEVELOPMENT_DECK_COUNTS,
    createResourceMap,
    normalizeResourceMap,
    normalizeResourceDelta,
    countCollection,
    getPlayerPieceCounts,
    getRemainingPieces,
    canSpendPiece,
    canAffordCost,
    applyResourceDelta,
    applyCost,
    createBank,
    applyBankPayout,
    applyResourceGainFromBank,
    isNodeBlockedByOpponent,
    getReachableRoadNodes,
    canBuildRoad,
    canBuildSettlement,
    canBuildCity,
    createDevelopmentDeck,
    normalizeDevelopmentState,
    promoteBoughtDevelopmentCards,
    countVictoryPointCards,
    canBuyDevelopmentCard,
    buyDevelopmentCard,
    canPlayDevelopmentCard,
    spendDevelopmentCard,
    applyRoadBuildingEffect,
    applyYearOfPlentyEffect,
    applyMonopolyEffect,
    resolveHarborTradeRate,
    performBankTrade,
    computeLongestRoadLength,
    recomputeLongestRoad,
    recomputeLargestArmy,
    computeVictoryPoints,
  };
});
