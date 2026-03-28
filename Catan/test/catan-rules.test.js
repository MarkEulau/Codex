"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const Rules = require("../catan-rules.js");

function makeNode(idx, owner, edgeIds, isCity = false) {
  return { idx, owner, edges: new Set(edgeIds), isCity };
}

function makeEdge(idx, a, b, owner) {
  return { idx, a, b, owner };
}

function makeState(overrides = {}) {
  return {
    players: [
      {
        roads: new Set([0]),
        settlements: new Set([0]),
        cities: new Set(),
        hand: { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 },
        devCards: Rules.normalizeDevelopmentState(),
        playedKnights: 0,
      },
      {
        roads: new Set(),
        settlements: new Set([1]),
        cities: new Set(),
        hand: { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 },
        devCards: Rules.normalizeDevelopmentState(),
        playedKnights: 0,
      },
    ],
    nodes: [
      makeNode(0, 0, [0, 2]),
      makeNode(1, 1, [0, 1]),
      makeNode(2, null, [1, 2, 3]),
      makeNode(3, null, [3]),
    ],
    edges: [
      makeEdge(0, 0, 1, 0),
      makeEdge(1, 1, 2, null),
      makeEdge(2, 0, 2, null),
      makeEdge(3, 2, 3, null),
    ],
    bank: Rules.createBank({ wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 }),
    harbors: [],
    devDeck: Rules.createDevelopmentDeck(),
    ...overrides,
  };
}

test("road legality respects enemy building blockades", () => {
  const state = makeState();

  assert.equal(Rules.canBuildRoad(state, 0, 1).ok, false);
  assert.equal(Rules.canBuildRoad(state, 0, 2).ok, true);
});

test("piece limits are derived from built piece counts", () => {
  const player = {
    roads: new Set(Array.from({ length: 15 }, (_, idx) => idx)),
    settlements: new Set(Array.from({ length: 5 }, (_, idx) => idx)),
    cities: new Set(Array.from({ length: 4 }, (_, idx) => idx)),
  };

  assert.deepEqual(Rules.getRemainingPieces(player), { road: 0, settlement: 0, city: 0 });
  assert.equal(Rules.canSpendPiece(player, "road"), false);
  assert.equal(Rules.canSpendPiece(player, "settlement"), false);
  assert.equal(Rules.canSpendPiece(player, "city"), false);
});

test("city upgrades release a settlement piece and spend a city piece", () => {
  const before = {
    roads: new Set(),
    settlements: new Set([1, 2, 3, 4]),
    cities: new Set([5, 6, 7]),
  };
  const after = {
    roads: new Set(),
    settlements: new Set([1, 2, 3]),
    cities: new Set([5, 6, 7, 8]),
  };

  assert.deepEqual(Rules.getRemainingPieces(before), { road: 15, settlement: 1, city: 1 });
  assert.deepEqual(Rules.getRemainingPieces(after), { road: 15, settlement: 2, city: 0 });
  assert.equal(
    Rules.canBuildCity(
      {
        players: [
          {
            roads: new Set(),
            settlements: new Set([1, 2, 3, 4]),
            cities: new Set([5, 6, 7, 8]),
          },
        ],
        nodes: [makeNode(0, 0, []), makeNode(1, 0, [])],
        edges: [],
      },
      0,
      0
    ).ok,
    false
  );
});

test("bank payouts partially fill shortages and bank trades honor shortages", () => {
  const payout = Rules.applyBankPayout(Rules.createBank({ wood: 1, brick: 0, sheep: 2, wheat: 0, ore: 3 }), {
    wood: 2,
    brick: 1,
    ore: 2,
  });

  assert.deepEqual(payout.granted, { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 2 });
  assert.deepEqual(payout.shortage, { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 });
  assert.deepEqual(payout.bank, { wood: 0, brick: 0, sheep: 2, wheat: 0, ore: 1 });

  const trade = Rules.performBankTrade(makeState(), 0, "wood", "ore", { rate: 4 });
  assert.equal(trade.ok, true);
  assert.equal(trade.state.players[0].hand.wood, 0);
  assert.equal(trade.state.players[0].hand.ore, 5);
  assert.equal(trade.state.bank.wood, 23);
  assert.equal(trade.state.bank.ore, 18);
});

test("harbor access resolves the best available bank trade rate", () => {
  const state = makeState({
    harbors: [
      { type: "generic", nodes: [0] },
      { type: "wood", nodes: [1] },
    ],
  });
  state.nodes[1].owner = 0;

  assert.equal(Rules.resolveHarborTradeRate(state, 0, "wood"), 2);
  assert.equal(Rules.resolveHarborTradeRate(state, 0, "brick"), 3);
  assert.equal(Rules.resolveHarborTradeRate(state, 0, "ore"), 3);
  assert.equal(Rules.resolveHarborTradeRate(state, 1, "ore"), 4);
  assert.equal(Rules.resolveHarborTradeRate(makeState({ harbors: [] }), 0, "ore"), 4);
});

test("development cards obey buy, hold, and one-play-per-turn restrictions", () => {
  const deck = Rules.createDevelopmentDeck();
  const counts = deck.reduce((acc, card) => {
    acc[card] += 1;
    return acc;
  }, Rules.createResourceMap(0, Rules.DEV_CARD_TYPES));

  assert.deepEqual(counts, {
    knight: 14,
    road_building: 2,
    year_of_plenty: 2,
    monopoly: 2,
    victory_point: 5,
  });

  const state = makeState({
    players: [
      {
        roads: new Set([0]),
        settlements: new Set([0]),
        cities: new Set(),
        hand: { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1 },
        devCards: Rules.normalizeDevelopmentState(),
        playedKnights: 0,
      },
    ],
    devDeck: ["knight", "year_of_plenty", "victory_point"],
  });

  const buy = Rules.buyDevelopmentCard(state, 0);
  assert.equal(buy.ok, true);
  assert.equal(buy.card, "knight");
  assert.equal(buy.player.hand.sheep, 0);
  assert.equal(buy.player.devCards.boughtThisTurn.knight, 1);
  assert.equal(Rules.canPlayDevelopmentCard(buy.player.devCards, "knight", { mainStep: "main_actions" }), false);
  assert.equal(Rules.countVictoryPointCards(buy.player.devCards), 0);

  const promoted = Rules.promoteBoughtDevelopmentCards(buy.player.devCards);
  assert.equal(Rules.canPlayDevelopmentCard(promoted, "knight", { mainStep: "before_roll" }), true);
  assert.equal(Rules.canPlayDevelopmentCard(promoted, "knight", { mainStep: "main_actions" }), true);

  const played = Rules.spendDevelopmentCard(promoted, "knight", { mainStep: "main_actions" });
  assert.equal(played.ok, true);
  assert.equal(played.devCards.playedKnights, 1);
  assert.equal(played.devCards.playedNonVictoryThisTurn, true);
  assert.equal(Rules.canPlayDevelopmentCard(played.devCards, "year_of_plenty", { mainStep: "main_actions" }), false);

  const vpState = Rules.normalizeDevelopmentState({
    hand: { victory_point: 2, knight: 0, road_building: 0, year_of_plenty: 0, monopoly: 0 },
    boughtThisTurn: { victory_point: 1, knight: 0, road_building: 0, year_of_plenty: 0, monopoly: 0 },
  });
  assert.equal(Rules.countVictoryPointCards(vpState), 3);
});

test("extension bank and development deck counts expand for 5-6 player games", () => {
  assert.deepEqual(Rules.createBank(6), {
    wood: 24,
    brick: 24,
    sheep: 24,
    wheat: 24,
    ore: 24,
  });

  const extensionDeck = Rules.createDevelopmentDeck(6);
  const counts = extensionDeck.reduce((acc, card) => {
    acc[card] += 1;
    return acc;
  }, Rules.createResourceMap(0, Rules.DEV_CARD_TYPES));

  assert.deepEqual(counts, {
    knight: 20,
    road_building: 3,
    year_of_plenty: 3,
    monopoly: 3,
    victory_point: 5,
  });
});

test("year of plenty and monopoly effects are resolved purely", () => {
  const year = Rules.applyYearOfPlentyEffect(
    Rules.createBank({ wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 2 }),
    { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
    { wood: 1, brick: 1 }
  );

  assert.equal(year.ok, true);
  assert.deepEqual(year.granted, { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 });
  assert.deepEqual(year.shortage, { wood: 0, brick: 1, sheep: 0, wheat: 0, ore: 0 });
  assert.deepEqual(year.hand, { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 });

  const monopoly = Rules.applyMonopolyEffect(
    [
      { hand: { wood: 0, brick: 0, sheep: 2, wheat: 0, ore: 0 } },
      { hand: { wood: 0, brick: 0, sheep: 1, wheat: 0, ore: 0 } },
      { hand: { wood: 0, brick: 0, sheep: 4, wheat: 0, ore: 0 } },
    ],
    1,
    "sheep"
  );

  assert.equal(monopoly.ok, true);
  assert.equal(monopoly.stolen, 6);
  assert.equal(monopoly.players[1].hand.sheep, 7);
  assert.equal(monopoly.players[0].hand.sheep, 0);
  assert.equal(monopoly.players[2].hand.sheep, 0);
});

test("longest road and largest army recomputation stays stable on ties", () => {
  const state = makeState({
    players: [
      {
        roads: new Set([0, 1, 2]),
        settlements: new Set([0]),
        cities: new Set(),
        hand: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
        playedKnights: 3,
        devCards: Rules.normalizeDevelopmentState({ playedKnights: 3 }),
      },
      {
        roads: new Set([3, 4]),
        settlements: new Set([1]),
        cities: new Set(),
        hand: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
        playedKnights: 3,
        devCards: Rules.normalizeDevelopmentState({ playedKnights: 3 }),
      },
    ],
    nodes: [
      makeNode(0, 0, [0]),
      makeNode(1, 1, [0, 1]),
      makeNode(2, null, [1, 2]),
      makeNode(3, null, [2, 3]),
      makeNode(4, null, [3]),
      makeNode(5, null, [4]),
    ],
    edges: [
      makeEdge(0, 0, 1, 0),
      makeEdge(1, 1, 2, 0),
      makeEdge(2, 2, 3, 0),
      makeEdge(3, 3, 4, 1),
      makeEdge(4, 4, 5, 1),
    ],
  });

  assert.equal(Rules.computeLongestRoadLength(state, 0), 2);
  assert.deepEqual(Rules.recomputeLongestRoad(state, 0, 2), { holder: 0, length: 2 });
  assert.deepEqual(Rules.recomputeLargestArmy(state.players, 1), { holder: 1, count: 3 });
});

test("victory points include awards and hidden victory point cards", () => {
  const player = {
    settlements: new Set([0, 1]),
    cities: new Set([2]),
  };
  const devCards = Rules.normalizeDevelopmentState({
    hand: { victory_point: 2, knight: 0, road_building: 0, year_of_plenty: 0, monopoly: 0 },
    boughtThisTurn: { victory_point: 1, knight: 0, road_building: 0, year_of_plenty: 0, monopoly: 0 },
  });

  assert.equal(
    Rules.computeVictoryPoints(player, { longestRoadHolder: 0, largestArmyHolder: 0 }, 0, devCards),
    11
  );
});
